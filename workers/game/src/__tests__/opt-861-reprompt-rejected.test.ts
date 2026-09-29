/**
 * OPT-861: a paused action that declines a stale reply and asks the SAME
 * selection again must surface as a rejected response at the
 * resumePromptLifecycle boundary, while keeping the refreshed prompt. A valid
 * reply that legitimately leads to another prompt stays accepted.
 */
import { describe, expect, it } from "vitest";
import type { EffectBlock } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { GameSession } from "../GameSession.js";
import type { Env } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { executeEffectAction } from "../engine/effect-resolver/resolver.js";
import { runPipeline } from "../engine/pipeline.js";
import { parseStoredSession } from "../session/persistence.js";
import {
  resumePromptLifecycle,
  type PromptLifecycleResult,
} from "../session/prompt-lifecycle.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    });
  }
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER"
  ) {
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt861-${serial++}`,
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
    } else if (zone === "HAND") p.hand.push(card);
    else if (zone === "TRASH") p.trash.push(card);
    return card;
  }
  function act(action: GameAction) {
    const result = runPipeline(state, action, db, state.turn.activePlayerIndex);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  function reply(action: GameAction): PromptLifecycleResult {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    state = result.state;
    return result;
  }
  // Blind hand prompts offer opaque slot tokens (OPT-838); name cards by id.
  function select(ids: string[]) {
    const slots = state.pendingPrompt?.blindSlots;
    const selected = slots
      ? ids.map((id) => slots.find((s) => s.instanceId === id)?.token ?? id)
      : ids;
    return reply({ type: "SELECT_TARGET", selectedInstanceIds: selected });
  }
  function targets() {
    const options = state.pendingPrompt?.options;
    if (options?.promptType !== "SELECT_TARGET")
      throw new Error(JSON.stringify(options));
    return options;
  }
  return {
    db,
    data,
    put,
    act,
    reply,
    select,
    targets,
    persist() {
      state = parseStoredSession(
        JSON.parse(
          JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })
        )
      ).state;
    },
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

function reveals(state: GameState) {
  return state.eventLog.filter((e) => e.type === "CARDS_REVEALED");
}

// Canonical text: docs/cards/OP-01.md (OP01-105 Bao Huang, OP01-063 Arlong).
describe("OPT-861 stale selections re-prompt as rejected responses", () => {
  for (const owner of [0, 1] as const) {
    it(`REVEAL_HAND (Bao Huang) controller ${owner}: stale ids after persistence`, () => {
      const f = fixture();
      const opponent: 0 | 1 = owner === 0 ? 1 : 0;
      f.state.turn.activePlayerIndex = owner;
      f.data("OP01-105", { cost: 2 });
      const source = f.put("OP01-105", owner, "HAND");
      const hand = [0, 1, 2].map((i) => {
        f.data(`opt861-secret-${i}`);
        return f.put(`opt861-secret-${i}`, opponent, "HAND");
      });
      f.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId });
      f.persist();
      const stackDepth = f.state.effectStack.length;
      // The first card leaves the hand after the prompt was persisted.
      f.state.players[opponent].hand = hand.slice(1);

      const result = f.select([hand[0].instanceId, hand[2].instanceId]);

      expect(result.responseRejected).toBe(true);
      expect(result.reprompted).toBe(true);
      // The refreshed prompt is kept, not the stale one.
      expect(reveals(f.state)).toEqual([]);
      expect(f.state.pendingPrompt?.respondingPlayer).toBe(owner);
      expect(f.targets()).toMatchObject({
        blindSelection: true,
        countMin: 2,
        countMax: 2,
      });
      const live = hand.slice(1).map((c) => c.instanceId).sort();
      expect(
        f.state.pendingPrompt!.blindSlots!.map((s) => s.instanceId).sort()
      ).toEqual(live);
      expect(f.state.effectStack).toHaveLength(stackDepth);
      expect([...f.state.effectStack.at(-1)!.validTargets].sort()).toEqual(live);
      expect(f.state.players[opponent].hand).toEqual(hand.slice(1));

      f.persist();
      const recovered = f.select(hand.slice(1).map((c) => c.instanceId));
      expect(recovered).toMatchObject({ responseRejected: false });
      expect(recovered.reprompted).toBeUndefined();
      expect(f.state.pendingPrompt).toBeNull();
      expect(reveals(f.state)).toHaveLength(1);
    });
  }

  it("REVEAL_HAND (Arlong) keeps its conditional continuation across the re-prompt", () => {
    const f = fixture();
    f.state.turn.activePlayerIndex = 0;
    const hand = [0, 1, 2].map((i) => {
      f.data(`opt861-secret-${i}`, i === 1 ? { type: "Event" } : {});
      return f.put(`opt861-secret-${i}`, 1, "HAND");
    });
    f.data("OP01-063", { cost: 4 });
    const arlong = f.put("OP01-063", 0);
    const don = f.state.players[0].donCostArea.shift()!;
    arlong.attachedDon = [{ ...don, attachedTo: arlong.instanceId }];
    const life = structuredClone(f.state.players[1].life);
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: arlong.instanceId,
      effectId: "OP01-063_activate_reveal_conditional",
    });
    if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
      expect(f.reply({ type: "PLAYER_CHOICE", choiceId: "accept" }))
        .toMatchObject({ responseRejected: false });
    }
    f.persist();
    const stale = hand.pop()!;
    f.state.players[1].hand = [...hand];

    const result = f.select([stale.instanceId]);

    expect(result).toMatchObject({ responseRejected: true, reprompted: true });
    expect(reveals(f.state)).toEqual([]);
    expect(f.targets().blindSelection).toBe(true);
    expect(
      f.state.pendingPrompt!.blindSlots!.map((s) => s.instanceId).sort()
    ).toEqual(hand.map((c) => c.instanceId).sort());

    f.persist();
    expect(f.select([hand[1].instanceId])).toMatchObject({
      responseRejected: false,
    });
    // The conditional continuation still runs: an Event was revealed, so the
    // opponent's Life lost a card.
    if (f.state.pendingPrompt) f.select([f.targets().validTargets[0]]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(reveals(f.state)).toHaveLength(1);
    expect(f.state.players[1].life).toHaveLength(life.length - 1);
  });
});

// A prompt whose resumeContext is the paused action's own ResumeContext (no
// effect-stack frame) resumes through resumeEffectChain directly.
describe("OPT-861 frameless prompts", () => {
  it("a stale REVEAL_HAND reply re-prompts as rejected", () => {
    const f = fixture();
    const source = f.put(CARDS.VANILLA.id, 0);
    const hand = [0, 1, 2].map(() => f.put(CARDS.VANILLA.id, 1, "HAND"));
    const paused = executeEffectAction(
      f.state,
      { type: "REVEAL_HAND", target: { controller: "OPPONENT" }, params: { amount: 1 } },
      source.instanceId,
      0,
      f.db,
      new Map()
    );
    f.state = { ...paused.state, pendingPrompt: paused.pendingPrompt! };
    expect(f.state.effectStack).toEqual([]);
    f.persist();
    f.state.players[1].hand = hand.slice(1);

    const result = f.select([hand[0].instanceId]);

    expect(result).toMatchObject({ responseRejected: true, reprompted: true });
    expect(reveals(f.state)).toEqual([]);
    expect(
      f.state.pendingPrompt!.blindSlots!.map((s) => s.instanceId).sort()
    ).toEqual(hand.slice(1).map((c) => c.instanceId).sort());
    f.persist();
    expect(f.select([hand[2].instanceId])).toMatchObject({
      responseRejected: false,
    });
    expect(f.state.pendingPrompt).toBeNull();
  });

  it("a reply outside validTargets is rejected with the prompt unchanged", () => {
    const f = fixture();
    const source = f.put(CARDS.VANILLA.id, 0);
    const foes = [0, 1].map(() => f.put(CARDS.VANILLA.id, 1));
    const paused = executeEffectAction(
      f.state,
      {
        type: "MODIFY_POWER",
        target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
        params: { amount: -1000 },
        duration: { type: "THIS_TURN" },
      },
      source.instanceId,
      0,
      f.db,
      new Map()
    );
    f.state = { ...paused.state, pendingPrompt: paused.pendingPrompt! };
    expect(f.state.effectStack).toEqual([]);
    f.persist();
    const before = structuredClone(f.state);

    const result = f.select([source.instanceId]);

    expect(result.responseRejected).toBe(true);
    expect(result.reprompted).toBeUndefined();
    expect(f.state).toEqual(before);
    expect(f.select([foes[1].instanceId])).toMatchObject({
      responseRejected: false,
    });
    expect(f.state.pendingPrompt).toBeNull();
  });
});

describe("OPT-861 valid replies that lead to another prompt stay accepted", () => {
  function pause(
    f: ReturnType<typeof fixture>,
    block: EffectBlock,
    sourceId: string
  ) {
    const result = resolveEffect(f.state, block, sourceId, 0, f.db);
    expect(result.pendingPrompt).toBeDefined();
    f.state = { ...result.state, pendingPrompt: result.pendingPrompt! };
    f.persist();
  }

  it("rule 3-7-6-1: the same PLAY_CARD asks for the overflow trash next", () => {
    const f = fixture();
    const board = [0, 1, 2, 3, 4].map(() => f.put(CARDS.VANILLA.id, 0));
    const candidates = [0, 1].map(() => f.put(CARDS.RUSH.id, 0, "TRASH"));
    pause(
      f,
      {
        id: "opt861-play-from-trash",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [
          {
            type: "PLAY_CARD",
            target: {
              type: "CHARACTER_CARD",
              source_zone: "TRASH",
              count: { up_to: 1 },
            },
            params: { source_zone: "TRASH", cost_override: "FREE" },
          },
        ],
      },
      board[0].instanceId
    );
    expect(f.targets().validTargets).toEqual(
      expect.arrayContaining(candidates.map((c) => c.instanceId))
    );

    const result = f.select([candidates[1].instanceId]);

    expect(result.responseRejected).toBe(false);
    expect(result.reprompted).toBeUndefined();
    // Follow-up: choose which of the five Characters to rule-trash.
    expect([...f.targets().validTargets].sort()).toEqual(
      board.map((c) => c.instanceId).sort()
    );
    expect(
      f.state.effectStack.at(-1)?.ruleTrashForPlay?.playTargetId
    ).toBe(candidates[1].instanceId);

    f.persist();
    expect(f.select([board[2].instanceId])).toMatchObject({
      responseRejected: false,
    });
    expect(f.state.pendingPrompt).toBeNull();
    expect(
      f.state.players[0].characters.some(
        (c) => c?.cardId === CARDS.RUSH.id
      )
    ).toBe(true);
  });

  it("two identical selection steps: answering the first asks the second", () => {
    const f = fixture();
    const source = f.put(CARDS.VANILLA.id, 0);
    const foes = [0, 1].map(() => f.put(CARDS.VANILLA.id, 1));
    const step = {
      type: "MODIFY_POWER",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { up_to: 1 },
      },
      params: { amount: -1000 },
      duration: { type: "THIS_TURN" },
    } as const;
    pause(
      f,
      {
        id: "opt861-two-steps",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [step, step],
      },
      source.instanceId
    );
    const before = f.state.pendingPrompt;

    const result = f.select([foes[0].instanceId]);

    expect(result.responseRejected).toBe(false);
    expect(result.reprompted).toBeUndefined();
    expect(f.state.pendingPrompt).not.toBeNull();
    expect(f.state.pendingPrompt).not.toEqual(before);
    expect(f.targets().validTargets).toEqual(
      expect.arrayContaining(foes.map((c) => c.instanceId))
    );

    f.persist();
    expect(f.select([foes[1].instanceId])).toMatchObject({
      responseRejected: false,
    });
    expect(f.state.pendingPrompt).toBeNull();
  });
});

// Wire contract: the session persists the refreshed prompt and answers the
// sender with action:rejected, then re-sends the (new) prompt.
describe("OPT-861 GameSession wire contract", () => {
  class MockWebSocket {
    sent: string[] = [];
    send(payload: string) {
      this.sent.push(payload);
    }
    close() {}
    serializeAttachment() {}
    deserializeAttachment() {
      return null;
    }
  }
  const storage = {
    put: async () => undefined,
    get: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };
  type Access = {
    gameState: GameState;
    cardDb: Map<string, CardData>;
    handleAction(ws: WebSocket, player: 0 | 1, action: GameAction): Promise<void>;
  };

  it("keeps the refreshed prompt and reports the stale reply as rejected", async () => {
    const f = fixture();
    f.data("OP01-105", { cost: 2 });
    const source = f.put("OP01-105", 0, "HAND");
    const hand = [0, 1, 2].map((i) => {
      f.data(`opt861-secret-${i}`);
      return f.put(`opt861-secret-${i}`, 1, "HAND");
    });
    f.state.turn.activePlayerIndex = 0;
    f.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId });
    f.persist();
    f.state.players[1].hand = hand.slice(1);
    const stalePrompt = f.state.pendingPrompt!;
    const session = new GameSession(
      {
        storage,
        acceptWebSocket() {},
        getWebSockets: () => [],
        getTags: () => [],
      } as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "s", NEXTJS_URL: "https://app.example.test" } as Env
    ) as unknown as Access;
    session.gameState = f.state;
    session.cardDb = f.db;
    const ws = new MockWebSocket();
    const token = (id: string) =>
      stalePrompt.blindSlots!.find((s) => s.instanceId === id)!.token;

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: [token(hand[0].instanceId), token(hand[2].instanceId)],
    });

    const messages = ws.sent.map((m) => JSON.parse(m) as { type: string; reason?: string });
    expect(messages).toEqual([
      expect.objectContaining({
        type: "action:rejected",
        reason: "That selection is no longer valid; choose again from the updated prompt",
      }),
    ]);
    const refreshed = session.gameState.pendingPrompt!;
    expect(refreshed.promptId).toBeDefined();
    expect(refreshed.promptId).not.toBe(stalePrompt.promptId);
    expect(refreshed.blindSlots!.map((s) => s.instanceId).sort()).toEqual(
      hand.slice(1).map((c) => c.instanceId).sort()
    );
    expect(reveals(session.gameState)).toEqual([]);
  });
});
