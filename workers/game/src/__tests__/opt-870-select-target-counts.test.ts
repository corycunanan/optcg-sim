/**
 * OPT-870 — SELECT_TARGET replies must honor the prompt's advertised
 * selection count (countMin..countMax) and name each card at most once.
 *
 * Failure mode: `validatePromptPayload` never checked SELECT_TARGET counts,
 * and resume paths without their own count guard (PLACE_HAND_TO_DECK, the
 * OPPONENT_ACTION "your opponent places N cards" family) accepted an empty or
 * short reply — the prompt cleared and the mandatory effect silently did
 * less than the card says. Exact-1 cost prompts deduplicated `[id, id]`
 * before counting, so a duplicate reply passed as a single selection.
 *
 * Card text (docs/cards):
 *  - OP09-101 Kuzan: "[On Play] Place 1 of your opponent's Characters with a
 *    cost of 3 or less at the top or bottom of your opponent's Life cards
 *    face-up: Your opponent trashes 1 card from their hand."
 *  - OP16-047: "[Activate: Main] You may rest this Character: If your
 *    opponent has 8 or more cards in their hand, they place 2 cards from
 *    their hand at the bottom of their deck in any order."
 *  - EB01-002 Izo: "[On Play] Give up to 1 rested DON!! card to your Leader
 *    or 1 of your Characters." ("up to" permits 0 — rule 1-3-5-1.)
 *
 * The boundary under test is the real session path: GameSession.handleAction
 * → SessionCoordinator.executeAction → resumePromptLifecycle.
 */

import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession.js";
import type {
  CardData,
  CardInstance,
  Env,
  GameAction,
  GameState,
  PendingPromptState,
} from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  SessionCoordinator,
  selectTargetReplyViolation,
} from "../session/coordinator.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const P0 = 0 as const;
const P1 = 1 as const;

// ─── Minimal GameSession harness (pattern from opt-436) ─────────────────────

class MockWebSocket {
  sent: string[] = [];
  send(payload: string): void {
    this.sent.push(payload);
  }
  close(): void {}
  serializeAttachment(_attachment: unknown): void {}
  deserializeAttachment(): unknown {
    return null;
  }
}

class MockDurableObjectState {
  storage = {
    put: async () => undefined,
    get: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };
  acceptWebSocket(): void {}
  getWebSockets(): WebSocket[] {
    return [];
  }
  getTags(): string[] {
    return [];
  }
}

type SessionAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  handleAction(ws: WebSocket, playerIndex: 0 | 1, action: GameAction): Promise<void>;
};

function sessionFor(state: GameState, cardDb: Map<string, CardData>) {
  const session = new GameSession(
    new MockDurableObjectState() as unknown as DurableObjectState,
    { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
  ) as unknown as SessionAccess;
  session.gameState = state;
  session.cardDb = cardDb;
  const ws = new MockWebSocket();
  return {
    session,
    ws,
    async send(player: 0 | 1, action: GameAction) {
      await session.handleAction(ws as unknown as WebSocket, player, action);
    },
    rejections() {
      return ws.sent
        .map((m) => JSON.parse(m) as { type: string; reason?: string })
        .filter((m) => m.type === "action:rejected");
    },
  };
}

// ─── Engine fixture ─────────────────────────────────────────────────────────

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  const coordinator = new SessionCoordinator();
  const services = {
    drainPregame: (s: GameState) => s,
    advanceStartOfTurn: (s: GameState) => s,
  };

  function put(
    id: string,
    controller: 0 | 1,
    zone: "CHARACTER" | "HAND",
    overrides: Partial<CardData> = {},
  ): CardInstance {
    const schema = getEffectSchema(id);
    if (!db.has(id) || Object.keys(overrides).length > 0) {
      db.set(id, {
        ...CARDS.VANILLA,
        id,
        name: schema?.card_name ?? id,
        effectSchema: schema ?? null,
        ...overrides,
      });
    }
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt870-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "CHARACTER") {
      p.characters[p.characters.findIndex((c) => !c)] = card;
      state = registerCardEnteredField(state, card, db.get(id)!);
    } else {
      p.hand.push(card);
    }
    return card;
  }

  return {
    db,
    coordinator,
    put,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
    act(action: GameAction, player: 0 | 1 = P0) {
      const result = runPipeline(state, action, db, player);
      expect(result.valid, result.error).toBe(true);
      state = result.state;
    },
    /**
     * Answer the pending prompt the way GameSession.handleAction does:
     * coordinator gate first, then the prompt lifecycle on "resume".
     */
    reply(player: 0 | 1, action: GameAction) {
      const routed = coordinator.executeAction(state, [], player, action, db);
      if (routed.kind === "reject") return { rejected: true, reason: routed.reason, state: routed.state };
      expect(routed.kind).toBe("resume");
      const resumed = resumePromptLifecycle(routed.state, action, db, services);
      return { rejected: resumed.responseRejected, reason: undefined, state: resumed.state };
    },
    /** Accept a reply and adopt the resulting state. */
    answer(player: 0 | 1, action: GameAction) {
      const result = this.reply(player, action);
      expect(result.rejected, JSON.stringify({ action, prompt: state.pendingPrompt?.options })).toBe(false);
      state = result.state;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function select(ids: string[]): GameAction {
  return { type: "SELECT_TARGET", selectedInstanceIds: ids };
}

function selectPrompt(f: Fixture) {
  const options = f.state.pendingPrompt?.options;
  if (options?.promptType !== "SELECT_TARGET") throw new Error(JSON.stringify(options));
  return options;
}

/** A rejected reply leaves state — and the pending prompt with its continuation — untouched. */
function expectRejectedIntact(f: Fixture, player: 0 | 1, action: GameAction) {
  const before = f.state;
  const snapshot = JSON.stringify(before);
  const result = f.reply(player, action);
  expect(result.rejected, JSON.stringify(action)).toBe(true);
  expect(result.reason, "rejected at the session boundary").toBeTruthy();
  expect(result.state).toBe(before);
  expect(JSON.stringify(result.state)).toBe(snapshot);
}

// ─── OP09-101 Kuzan: mandatory opponent hand trash ──────────────────────────

function kuzanAtOpponentTrash() {
  const f = fixture();
  const kuzan = f.put("OP09-101", P0, "HAND", { cost: 5, power: 6000 });
  const opp3 = f.put("opp-cost-3", P1, "CHARACTER", { cost: 3 });
  const oppHand = [f.put("opp-hand-0", P1, "HAND"), f.put("opp-hand-1", P1, "HAND")];
  f.act({ type: "PLAY_CARD", cardInstanceId: kuzan.instanceId });
  return { f, opp3, oppHand };
}

function payKuzanCost(f: Fixture, opp3: CardInstance) {
  f.answer(P0, select([opp3.instanceId]));
  const choice = f.state.pendingPrompt?.options;
  if (choice?.promptType !== "PLAYER_CHOICE") throw new Error(JSON.stringify(choice));
  f.answer(P0, { type: "PLAYER_CHOICE", choiceId: choice.choices.find((c) => c.label === "Top")!.id });
}

describe("OPT-870 OP09-101: the opponent's mandatory hand trash", () => {
  it("prompts the opponent to trash exactly 1 (countMin 1)", () => {
    const { f, opp3, oppHand } = kuzanAtOpponentTrash();
    payKuzanCost(f, opp3);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(P1);
    expect(selectPrompt(f)).toMatchObject({ countMin: 1, countMax: 1 });
    expect([...selectPrompt(f).validTargets].sort()).toEqual(oppHand.map((c) => c.instanceId).sort());
  });

  it("rejects an empty reply at the session boundary; prompt and hand unchanged", () => {
    const { f, opp3 } = kuzanAtOpponentTrash();
    payKuzanCost(f, opp3);
    expectRejectedIntact(f, P1, select([]));
  });

  it("rejects over-count and duplicate replies at the session boundary", () => {
    const { f, opp3, oppHand } = kuzanAtOpponentTrash();
    payKuzanCost(f, opp3);
    expectRejectedIntact(f, P1, select(oppHand.map((c) => c.instanceId)));
    expectRejectedIntact(f, P1, select([oppHand[0].instanceId, oppHand[0].instanceId]));
  });

  it("a valid reply trashes exactly the one chosen card", () => {
    const { f, opp3, oppHand } = kuzanAtOpponentTrash();
    payKuzanCost(f, opp3);
    const trashBefore = f.state.players[P1].trash.length;
    f.answer(P1, select([oppHand[1].instanceId]));
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[P1].hand.map((c) => c.instanceId)).toEqual([oppHand[0].instanceId]);
    expect(f.state.players[P1].trash).toHaveLength(trashBefore + 1);
    expect(f.state.players[P1].trash[0].cardId).toBe("opp-hand-1");
  });

  it("rejects a duplicate id on the exact-1 placement cost instead of deduplicating it", () => {
    const { f, opp3 } = kuzanAtOpponentTrash();
    expect(selectPrompt(f)).toMatchObject({ countMin: 1, countMax: 1 });
    expectRejectedIntact(f, P0, select([opp3.instanceId, opp3.instanceId]));
  });

  it("GameSession: an empty reply surfaces as action:rejected and the same prompt stays pending", async () => {
    const { f, opp3, oppHand } = kuzanAtOpponentTrash();
    payKuzanCost(f, opp3);
    const prompt: PendingPromptState = { ...f.state.pendingPrompt!, promptId: "opt870-trash" };
    const state = { ...f.state, pendingPrompt: prompt };
    const s = sessionFor(state, f.db);

    await s.send(P1, { ...select([]), promptId: "opt870-trash" } as GameAction);
    expect(s.rejections()).toHaveLength(1);
    expect(s.session.gameState).toBe(state);
    expect(s.session.gameState.pendingPrompt).toBe(prompt);

    await s.send(P1, { ...select([oppHand[0].instanceId]), promptId: "opt870-trash" } as GameAction);
    expect(s.rejections()).toHaveLength(1);
    expect(s.session.gameState.pendingPrompt).toBeNull();
    expect(s.session.gameState.players[P1].hand.map((c) => c.instanceId)).toEqual([oppHand[1].instanceId]);
  });
});

// ─── OP16-047: mandatory opponent places 2 from hand at the bottom ──────────

function op16047AtOpponentPlacement() {
  const f = fixture();
  const source = f.put("OP16-047", P0, "CHARACTER", { cost: 4 });
  const oppHand = Array.from({ length: 8 }, (_, i) => f.put(`opp-card-${i}`, P1, "HAND"));
  const effectId = getEffectSchema("OP16-047")!.effects[0].id;
  f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId });
  // "You may rest this Character" — accept the optional activation.
  if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
    f.answer(P0, { type: "PLAYER_CHOICE", choiceId: "activate" });
  }
  return { f, oppHand };
}

describe("OPT-870 OP16-047: the opponent's mandatory 2-card hand-to-deck placement", () => {
  it("prompts the opponent to place exactly 2 (countMin 2)", () => {
    const { f } = op16047AtOpponentPlacement();
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(P1);
    expect(selectPrompt(f)).toMatchObject({ countMin: 2, countMax: 2 });
  });

  it.each([
    ["empty", (h: CardInstance[]) => []],
    ["one-card", (h: CardInstance[]) => [h[0].instanceId]],
    ["three-card", (h: CardInstance[]) => [h[0].instanceId, h[1].instanceId, h[2].instanceId]],
    ["duplicated-card", (h: CardInstance[]) => [h[0].instanceId, h[0].instanceId]],
  ])("rejects the %s reply with the prompt still pending", (_name, ids) => {
    const { f, oppHand } = op16047AtOpponentPlacement();
    expectRejectedIntact(f, P1, select(ids(oppHand)));
  });

  it("a valid reply moves exactly the 2 chosen cards to the bottom of the deck", () => {
    const { f, oppHand } = op16047AtOpponentPlacement();
    const deckBefore = f.state.players[P1].deck.length;
    f.answer(P1, select([oppHand[3].instanceId, oppHand[5].instanceId]));
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[P1].hand).toHaveLength(6);
    expect(f.state.players[P1].deck).toHaveLength(deckBefore + 2);
    expect(f.state.players[P1].deck.slice(-2).map((c) => c.cardId).sort()).toEqual(["opp-card-3", "opp-card-5"]);
  });

  it("GameSession: a 1-card reply surfaces as action:rejected and nothing moves", async () => {
    const { f, oppHand } = op16047AtOpponentPlacement();
    const s = sessionFor(f.state, f.db);
    const state = s.session.gameState;
    await s.send(P1, select([oppHand[0].instanceId]));
    expect(s.rejections()).toHaveLength(1);
    expect(s.session.gameState).toBe(state);
    expect(s.session.gameState.players[P1].hand).toHaveLength(8);
  });
});

// ─── EB01-002 Izo: "up to 1" control ────────────────────────────────────────

describe("OPT-870 EB01-002 (control): an 'up to' selection still accepts 0", () => {
  it("an empty reply resolves the prompt and gives nothing", () => {
    const f = fixture();
    f.state.players[P0].donCostArea = f.state.players[P0].donCostArea.map((d, i) =>
      i === 0 ? { ...d, state: "RESTED" } : d,
    );
    const izo = f.put("EB01-002", P0, "HAND", { cost: 3 });
    f.act({ type: "PLAY_CARD", cardInstanceId: izo.instanceId });
    expect(selectPrompt(f)).toMatchObject({ countMin: 0, countMax: 1 });
    const leaderDon = f.state.players[P0].leader.attachedDon.length;
    f.answer(P0, select([]));
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[P0].leader.attachedDon).toHaveLength(leaderDon);
  });
});

// ─── Available-count clamp (defensive) ──────────────────────────────────────

describe("OPT-870 selectTargetReplyViolation: the minimum is clamped to what is selectable", () => {
  const base = {
    promptType: "SELECT_TARGET" as const,
    cards: [],
    effectDescription: "",
    ctaLabel: "Confirm",
  };

  it("countMin above the candidate count requires only the available cards", () => {
    const options = { ...base, validTargets: ["a"], countMin: 2, countMax: 2 };
    expect(selectTargetReplyViolation(options, ["a"])).toBeNull();
    expect(selectTargetReplyViolation(options, [])).not.toBeNull();
  });

  it("an empty offer with countMin > 0 accepts the empty reply (no deadlock)", () => {
    const options = { ...base, validTargets: [], countMin: 1, countMax: 1 };
    expect(selectTargetReplyViolation(options, [])).toBeNull();
  });

  it("dual_targets clamps each slot's minimum to that slot's candidates", () => {
    // Slot A requires 1 but has no candidates; slot B requires 1 of {b1, b2}.
    const options = {
      ...base,
      validTargets: ["b1", "b2"],
      countMin: 2,
      countMax: 2,
      dualTargets: {
        slots: [
          { validIds: [], countMin: 1, countMax: 1 },
          { validIds: ["b1", "b2"], countMin: 1, countMax: 1 },
        ],
      },
    };
    expect(selectTargetReplyViolation(options, ["b1"])).toBeNull();
    expect(selectTargetReplyViolation(options, [])).not.toBeNull();
  });

  it("'up to' (countMin 0) accepts 0..countMax and rejects more", () => {
    const options = { ...base, validTargets: ["a", "b", "c"], countMin: 0, countMax: 2 };
    expect(selectTargetReplyViolation(options, [])).toBeNull();
    expect(selectTargetReplyViolation(options, ["a", "b"])).toBeNull();
    expect(selectTargetReplyViolation(options, ["a", "b", "c"])).not.toBeNull();
  });

  it("rejects duplicates even when the count is otherwise legal", () => {
    const options = { ...base, validTargets: ["a", "b"], countMin: 0, countMax: 2 };
    expect(selectTargetReplyViolation(options, ["a", "a"])).not.toBeNull();
  });
});
