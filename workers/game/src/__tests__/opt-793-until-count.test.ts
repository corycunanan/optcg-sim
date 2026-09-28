/**
 * OPT-793 — "until you have N" semantics through the real action pipeline.
 *
 * Card text (docs/cards/):
 * - OP14-054 Fisher Tiger: "[End of Your Turn] Trash cards from your hand until
 *   you have 5 cards in your hand." OP14 FAQ: with 5 or fewer cards nothing is
 *   trashed; only 6+ trims to 5.
 * - OP05-058 It's a Waste of Human Life!!: "…Then, you and your opponent trash
 *   cards from your hands until you each have 5 cards in your hands." OP05 FAQ:
 *   the turn player (activator) chooses and trashes first, then the opponent
 *   chooses from their own hand (also Comprehensive Rules 1-3-4 / 1-3-10).
 * - OP08-074 Black Maria: "…Then, at the end of this turn, return DON!! cards
 *   from your field to your DON!! deck until you have the same number of DON!!
 *   cards on your field as your opponent." Field = cost area + DON!! attached
 *   to Leader/Characters (Rules 3-1-2 / 8-3-1-6); OP08 FAQ: the return still
 *   happens if Black Maria left the field, and it counts as "a DON!! card on
 *   your field is returned to your DON!! deck".
 */
import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  DonInstance,
  GameAction,
  GameState,
} from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { SessionRepository, type SessionStorage } from "../session/persistence.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const entries = typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries;
    for (const [key, entry] of Object.entries(entries)) this.data.set(key, structuredClone(entry));
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

function dons(owner: 0 | 1, count: number, state: "ACTIVE" | "RESTED", tag: string): DonInstance[] {
  return Array.from({ length: count }, (_, i) => ({
    instanceId: `don-${tag}-${owner}-${i}`,
    state,
    attachedTo: null,
  }));
}

function fixture() {
  const db = createTestCardDb();
  let state: GameState = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  function put(
    id: string,
    owner: 0 | 1 = 0,
    zone: CardInstance["zone"] = "CHARACTER",
    data: Partial<CardData> = {}
  ) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
      id,
      name: schema?.card_name ?? id,
      cost: 3,
      power: 4000,
      ...data,
      ...(schema ? { effectSchema: schema } : {}),
    });
    const c: CardInstance = {
      instanceId: `${id}-${owner}-${zone}-${serial++}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "LEADER") state.players[owner].leader = c;
    else
      state.players[owner].characters[
        state.players[owner].characters.findIndex((slot) => !slot)
      ] = c;
    if (zone === "LEADER" || zone === "CHARACTER")
      state = registerCardEnteredField(state, c, db.get(id)!);
    return c;
  }
  function fillHand(owner: 0 | 1, count: number) {
    return Array.from({ length: count }, () => put("OPT793-FILLER", owner, "HAND"));
  }
  function run(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    const r = runPipeline(state, action, db, player);
    expect(r.valid, r.error).toBe(true);
    state = r.state;
  }
  /** Respond to the pending prompt; returns whether the response was rejected. */
  function respond(action: GameAction): boolean {
    const r = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    state = r.state;
    return r.responseRejected;
  }
  function selectHand(owner: 0 | 1, count: number): boolean {
    const ids = state.players[owner].hand.slice(0, count).map((c) => c.instanceId);
    return respond({ type: "SELECT_TARGET", selectedInstanceIds: ids });
  }
  function handTrashEvents(owner: 0 | 1) {
    return state.eventLog.filter(
      (e) =>
        e.type === "CARD_TRASHED" &&
        e.playerIndex === owner &&
        (e.payload as { from?: string } | undefined)?.from === "HAND"
    );
  }
  function fieldDon(owner: 0 | 1): number {
    const p = state.players[owner];
    return (
      p.donCostArea.length +
      p.leader.attachedDon.length +
      p.characters.reduce((sum, c) => sum + (c?.attachedDon.length ?? 0), 0)
    );
  }
  return {
    db,
    put,
    fillHand,
    run,
    respond,
    selectHand,
    handTrashEvents,
    fieldDon,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

function trashPrompt(state: GameState) {
  const prompt = state.pendingPrompt;
  expect(prompt?.options.promptType).toBe("SELECT_TARGET");
  if (prompt?.options.promptType !== "SELECT_TARGET") throw new Error("expected SELECT_TARGET");
  return { options: prompt.options, respondingPlayer: prompt.respondingPlayer };
}

// ─── Slice 1: hand primitive + OP14-054 ──────────────────────────────────────

describe("OPT-793 OP14-054 Fisher Tiger — [End of Your Turn] trash until 5", () => {
  function atEndOfTurn(handSize: number) {
    const f = fixture();
    f.put("OP14-054", 0);
    f.fillHand(0, handSize);
    f.run({ type: "ADVANCE_PHASE" });
    return f;
  }

  it("with 7 cards prompts the owner to trash exactly 2, leaving 5", () => {
    const f = atEndOfTurn(7);
    const { options, respondingPlayer } = trashPrompt(f.state);
    expect(respondingPlayer).toBe(0);
    expect(options.countMin).toBe(2);
    expect(options.countMax).toBe(2);
    expect(options.blindSelection).toBeUndefined();
    expect(f.selectHand(0, 2)).toBe(false);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].hand).toHaveLength(5);
    const events = f.handTrashEvents(0);
    expect(events).toHaveLength(1);
    expect((events[0].payload as { count: number }).count).toBe(2);
  });

  it("with 6 cards trashes exactly 1", () => {
    const f = atEndOfTurn(6);
    expect(trashPrompt(f.state).options.countMin).toBe(1);
    expect(f.selectHand(0, 1)).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(5);
  });

  it.each([5, 4, 0])("with %i cards trashes nothing and never prompts", (size) => {
    const f = atEndOfTurn(size);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].hand).toHaveLength(size);
    expect(f.handTrashEvents(0)).toHaveLength(0);
    expect(f.state.turn.activePlayerIndex).toBe(1);
  });

  it.each([1, 3, 0])("rejects a %i-card response to a trash-2 prompt", (count) => {
    const f = atEndOfTurn(7);
    trashPrompt(f.state);
    const before = f.state;
    expect(f.selectHand(0, count)).toBe(true);
    expect(f.state.players[0].hand).toHaveLength(7);
    expect(f.state.pendingPrompt).toEqual(before.pendingPrompt);
    // The original prompt still resolves correctly afterwards.
    expect(f.selectHand(0, 2)).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(5);
  });

  it("counts at resolution: On Play draw 3 takes 4 → 7, end of turn trims 2", () => {
    const f = fixture();
    f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, types: ["Fish-Man"] });
    const tiger = f.put("OP14-054", 0, "HAND", { cost: 1 });
    f.fillHand(0, 4);
    f.run({ type: "PLAY_CARD", cardInstanceId: tiger.instanceId });
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].hand).toHaveLength(7);
    f.run({ type: "ADVANCE_PHASE" });
    expect(trashPrompt(f.state).options.countMin).toBe(2);
    expect(f.selectHand(0, 2)).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(5);
  });

  it("survives a JSON round-trip of the pending end-of-turn prompt", () => {
    const f = atEndOfTurn(8);
    f.state = JSON.parse(JSON.stringify(f.state));
    expect(trashPrompt(f.state).options.countMin).toBe(3);
    expect(f.selectHand(0, 3)).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(5);
    expect(f.state.turn.activePlayerIndex).toBe(1);
  });
});

// ─── Slice 2: symmetric OP05-058 ─────────────────────────────────────────────

describe("OPT-793 OP05-058 It's a Waste of Human Life!! — both players trim to 5", () => {
  /** Hand sizes are counted after the Event has left the hand. */
  function cast(selfHand: number, oppHand: number) {
    const f = fixture();
    const event = f.put("OP05-058", 0, "HAND", {
      type: "Event",
      cost: 1,
      effectText:
        "[Main] Place all Characters with a cost of 3 or less at the bottom of the owner's deck. Then, you and your opponent trash cards from your hands until you each have 5 cards in your hands.",
    });
    f.fillHand(0, selfHand);
    f.fillHand(1, oppHand);
    f.run({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    return f;
  }

  it("you 7 / opponent 8: you choose 2 first, then the opponent chooses 3", () => {
    const f = cast(7, 8);
    const first = trashPrompt(f.state);
    expect(first.respondingPlayer).toBe(0);
    expect(first.options.countMin).toBe(2);
    expect(first.options.countMax).toBe(2);
    expect(first.options.validTargets).toEqual(f.state.players[0].hand.map((c) => c.instanceId));
    expect(f.selectHand(0, 2)).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(5);
    expect(f.state.players[1].hand).toHaveLength(8);

    const second = trashPrompt(f.state);
    expect(second.respondingPlayer).toBe(1);
    expect(second.options.countMin).toBe(3);
    expect(second.options.countMax).toBe(3);
    expect(second.options.blindSelection).toBeUndefined();
    expect(second.options.validTargets).toEqual(f.state.players[1].hand.map((c) => c.instanceId));
    expect(f.selectHand(1, 3)).toBe(false);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players.map((p) => p.hand.length)).toEqual([5, 5]);
    // Event order: the turn player's discard is published before the opponent's.
    const order = f.state.eventLog
      .filter((e) => e.type === "CARD_TRASHED" && (e.payload as { from?: string }).from === "HAND")
      .map((e) => [e.playerIndex, (e.payload as { count: number }).count]);
    expect(order).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });

  it("you 3 / opponent 9: you trash nothing, the opponent trashes 4", () => {
    const f = cast(3, 9);
    const prompt = trashPrompt(f.state);
    expect(prompt.respondingPlayer).toBe(1);
    expect(prompt.options.countMin).toBe(4);
    expect(f.selectHand(1, 4)).toBe(false);
    expect(f.state.players.map((p) => p.hand.length)).toEqual([3, 5]);
    expect(f.handTrashEvents(0)).toHaveLength(0);
  });

  it("you 9 / opponent 3: you trash 4, the opponent trashes nothing", () => {
    const f = cast(9, 3);
    const prompt = trashPrompt(f.state);
    expect(prompt.respondingPlayer).toBe(0);
    expect(prompt.options.countMin).toBe(4);
    expect(f.selectHand(0, 4)).toBe(false);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players.map((p) => p.hand.length)).toEqual([5, 3]);
    expect(f.handTrashEvents(1)).toHaveLength(0);
  });

  it.each([
    [5, 5],
    [4, 2],
  ])("you %i / opponent %i: nobody trashes", (a, b) => {
    const f = cast(a, b);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players.map((p) => p.hand.length)).toEqual([a, b]);
    expect(f.handTrashEvents(0)).toHaveLength(0);
    expect(f.handTrashEvents(1)).toHaveLength(0);
  });

  it("you 6 / opponent 6: each trashes exactly 1 and a wrong-count opponent reply is rejected", () => {
    const f = cast(6, 6);
    expect(f.selectHand(0, 1)).toBe(false);
    expect(trashPrompt(f.state).respondingPlayer).toBe(1);
    expect(f.selectHand(1, 2)).toBe(true);
    expect(f.state.players[1].hand).toHaveLength(6);
    expect(f.selectHand(1, 1)).toBe(false);
    expect(f.state.players.map((p) => p.hand.length)).toEqual([5, 5]);
  });
});

// ─── Slice 3: scheduled DON!! return OP08-074 ────────────────────────────────

describe("OPT-793 OP08-074 Black Maria — end-of-turn return until DON!! equal", () => {
  /**
   * Own field starts at `ownField - added` DON!! (all rested) with a 10-card
   * DON!! deck; activation adds `added` rested DON!!. Opponent has `oppField`
   * DON!! in the cost area.
   */
  function activate(ownBefore: number, added: number, oppField: number) {
    const f = fixture();
    const maria = f.put("OP08-074", 0);
    const s = f.state;
    s.players[0].donCostArea = dons(0, ownBefore, "ACTIVE", "own");
    s.players[0].donDeck = dons(0, 10 - ownBefore, "ACTIVE", "deck");
    s.players[1].donCostArea = dons(1, oppField, "ACTIVE", "opp");
    f.run({ type: "ACTIVATE_EFFECT", cardInstanceId: maria.instanceId, effectId: "activate_add_don" });
    const prompt = f.state.pendingPrompt;
    if (prompt?.options.promptType === "PLAYER_CHOICE") {
      expect(f.respond({ type: "PLAYER_CHOICE", choiceId: `choose-value:${added}` })).toBe(false);
    }
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.scheduledActions).toHaveLength(1);
    return { f, maria };
  }

  function donChoicePrompt(state: GameState) {
    const prompt = state.pendingPrompt;
    expect(prompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (prompt?.options.promptType !== "PLAYER_CHOICE") throw new Error("expected PLAYER_CHOICE");
    return { options: prompt.options, respondingPlayer: prompt.respondingPlayer };
  }

  it("8 DON!! vs opponent's 5 returns exactly 3 at end of turn, owner chooses", () => {
    const { f } = activate(3, 5, 5);
    expect(f.fieldDon(0)).toBe(8);
    const deckBefore = f.state.players[0].donDeck.length;
    f.run({ type: "ADVANCE_PHASE" });
    const { options, respondingPlayer } = donChoicePrompt(f.state);
    expect(respondingPlayer).toBe(0);
    expect(options.donReturn?.count).toBe(3);
    // 3 active + 5 rested in the cost area → 4 distinct plans (0..3 active).
    expect(options.choices.map((c) => c.id).sort()).toEqual([
      "don-return:0:3",
      "don-return:1:3",
      "don-return:2:3",
      "don-return:3:3",
    ]);
    expect(f.state.turn.activePlayerIndex).toBe(0);
    expect(f.respond({ type: "PLAYER_CHOICE", choiceId: "don-return:3:3" })).toBe(false);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.fieldDon(0)).toBe(5);
    expect(f.state.players[0].donCostArea.every((d) => d.state === "RESTED")).toBe(true);
    expect(f.state.players[0].donDeck).toHaveLength(deckBefore + 3);
    expect(f.state.turn.activePlayerIndex).toBe(1);
    expect(f.state.scheduledActions).toHaveLength(0);
  });

  it("rejects a choice id the prompt did not offer", () => {
    const { f } = activate(3, 5, 5);
    f.run({ type: "ADVANCE_PHASE" });
    donChoicePrompt(f.state);
    expect(f.respond({ type: "PLAYER_CHOICE", choiceId: "don-return:3:8" })).toBe(true);
    expect(f.fieldDon(0)).toBe(8);
    expect(f.respond({ type: "PLAYER_CHOICE", choiceId: "don-return:0:3" })).toBe(false);
    expect(f.fieldDon(0)).toBe(5);
  });

  it.each([
    ["equal", 3, 5, 8],
    ["fewer", 0, 5, 8],
  ])("%s DON!! than the opponent returns nothing", (_label, ownBefore, added, opp) => {
    const { f } = activate(ownBefore, added, opp);
    const own = f.fieldDon(0);
    expect(own).toBeLessThanOrEqual(opp);
    f.run({ type: "ADVANCE_PHASE" });
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.fieldDon(0)).toBe(own);
    expect(f.state.eventLog.some((e) => e.type === "DON_DETACHED" && e.playerIndex === 0)).toBe(false);
    expect(f.state.turn.activePlayerIndex).toBe(1);
  });

  it("reads the opponent's DON!! count at end of turn, not at activation", () => {
    const { f } = activate(3, 5, 5);
    // Opponent's field DON!! drops to 2 after activation (e.g. an effect returned them).
    f.state.players[1].donCostArea = f.state.players[1].donCostArea.slice(0, 2);
    // All own DON!! rested → a single plan, applied without a prompt.
    f.state.players[0].donCostArea = f.state.players[0].donCostArea.map((d) => ({ ...d, state: "RESTED" as const }));
    f.run({ type: "ADVANCE_PHASE" });
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.fieldDon(0)).toBe(2);
    const detached = f.state.eventLog.filter((e) => e.type === "DON_DETACHED" && e.playerIndex === 0);
    expect(detached).toHaveLength(1);
    expect((detached[0].payload as { count: number }).count).toBe(6);
  });

  it("offers attached DON!! as returnable field DON!! and detaches the chosen ones", () => {
    const { f, maria } = activate(3, 5, 5);
    const s = f.state;
    // Move 2 of the 8 onto the Leader and 1 onto Black Maria (field total stays 8).
    const [a, b, c, ...rest] = s.players[0].donCostArea;
    s.players[0].donCostArea = rest.map((d) => ({ ...d, state: "RESTED" as const }));
    s.players[0].leader = {
      ...s.players[0].leader,
      attachedDon: [a, b].map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: s.players[0].leader.instanceId })),
    };
    const slot = s.players[0].characters.findIndex((ch) => ch?.instanceId === maria.instanceId);
    s.players[0].characters[slot] = {
      ...s.players[0].characters[slot]!,
      attachedDon: [{ ...c, state: "ACTIVE" as const, attachedTo: maria.instanceId }],
    };
    expect(f.fieldDon(0)).toBe(8);
    f.run({ type: "ADVANCE_PHASE" });
    const { options } = donChoicePrompt(f.state);
    const leaderId = f.state.players[0].leader.instanceId;
    const choice = `don-return:0:3:${leaderId}=2,${maria.instanceId}=1`;
    expect(options.choices.map((ch) => ch.id)).toContain(choice);
    expect(f.respond({ type: "PLAYER_CHOICE", choiceId: choice })).toBe(false);
    expect(f.fieldDon(0)).toBe(5);
    expect(f.state.players[0].leader.attachedDon).toHaveLength(0);
    expect(f.state.players[0].donDeck.every((d) => d.attachedTo === null && d.state === "ACTIVE")).toBe(true);
  });

  it("still returns after Black Maria left the field (OP08 FAQ)", () => {
    const { f, maria } = activate(3, 5, 5);
    const slot = f.state.players[0].characters.findIndex((ch) => ch?.instanceId === maria.instanceId);
    f.state.players[0].characters[slot] = null;
    f.state.players[0].donCostArea = f.state.players[0].donCostArea.map((d) => ({ ...d, state: "RESTED" as const }));
    f.run({ type: "ADVANCE_PHASE" });
    expect(f.fieldDon(0)).toBe(5);
  });

  it("persists across a saved prompt, fires once, and keeps end-phase event order", async () => {
    const { f } = activate(3, 5, 5);
    const scheduled = f.state.scheduledActions[0];
    const setActive = (id: string) => ({
      ...scheduled,
      id,
      action: { type: "SET_DON_ACTIVE" as const, params: { amount: 1, up_to: false } },
    });
    // Another end-of-turn effect on either side of Black Maria's return.
    f.state = { ...f.state, scheduledActions: [setActive("before"), scheduled, setActive("after")] };
    const logStart = f.state.eventLog.length;
    f.run({ type: "ADVANCE_PHASE" });
    expect(donChoicePrompt(f.state).options.donReturn?.count).toBe(3);
    expect(f.state.eventLog.slice(logStart).map((e) => e.type)).toEqual(["PHASE_CHANGED", "DON_SET_ACTIVE"]);

    const repository = new SessionRepository(new MemoryStorage(), {
      nextJsUrl: "https://app.example.test",
      workerSecret: "secret",
    });
    await repository.save({
      state: f.state,
      cardDb: f.db,
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      testPriorityRolls: null,
      undoHistory: [],
    });
    const restored = await repository.load();
    expect(restored).not.toBeNull();
    f.state = restored!.state;
    expect(f.state.effectStack[0]?.phaseBoundaryContinuation?.remainingScheduledActions).toHaveLength(1);

    expect(f.respond({ type: "PLAYER_CHOICE", choiceId: "don-return:1:3" })).toBe(false);
    expect(f.fieldDon(0)).toBe(5);
    expect(f.state.eventLog.slice(logStart).map((e) => e.type)).toEqual([
      "PHASE_CHANGED",
      "DON_SET_ACTIVE",
      "DON_DETACHED",
      "DON_SET_ACTIVE",
      "TURN_ENDED",
      "TURN_STARTED",
      "PHASE_CHANGED",
    ]);
    expect(f.state.scheduledActions).toHaveLength(0);
    expect(f.state.effectStack).toEqual([]);

    // Through player 1's turn and back: nothing further is returned.
    for (let i = 0; i < 10 && f.state.turn.activePlayerIndex === 1 && !f.state.pendingPrompt; i++) {
      f.run({ type: "ADVANCE_PHASE" }, 1);
    }
    expect(f.state.turn.activePlayerIndex).toBe(0);
    const detachedAfter = f.state.eventLog
      .slice(logStart)
      .filter((e) => e.type === "DON_DETACHED" && e.playerIndex === 0);
    expect(detachedAfter).toHaveLength(1);
  });
});
