/**
 * OPT-1022 (Engine PR 8): Life actions.
 *
 * - OPT-976: ADD_TO_LIFE_FROM_DECK publishes CARD_ADDED_TO_LIFE.
 * - OPT-1014: an action-level LIFE_TO_HAND with TOP_OR_BOTTOM asks the
 *   controller which end (OP08-116, OP09-104, ST22-015 print "top or bottom").
 * - OPT-917: ST04-001 trashes up to 1 opponent Life card from any position,
 *   with face-down identities hidden from every payload.
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameEvent, GameState } from "../types.js";
import { AUTHORED_SCHEMAS } from "../engine/authored-schemas.generated.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import {
  executeAddToLifeFromDeck,
  lifeToHandChoiceId,
} from "../engine/effect-resolver/actions/life.js";
import { filterEventForPlayer, HIDDEN_IDENTITY } from "../engine/visibility.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { SessionRepository, type SessionStorage } from "../session/persistence.js";
import { visibleStateForPlayer, visibleStateForSpectator } from "../session/visibility.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function inst(id: string, cardId: string, owner: 0 | 1, zone: CardInstance["zone"]): CardInstance {
  return { instanceId: id, cardId, controller: owner, owner, zone, state: "ACTIVE", attachedDon: [], turnPlayed: 0 };
}

function register(db: Map<string, CardData>, id: string, extra: Partial<CardData> = {}) {
  const schema = getEffectSchema(id);
  expect(schema, id).toBeTruthy();
  db.set(id, { ...CARDS.VANILLA, id, name: schema!.card_name, cost: 0, effectSchema: schema!, ...extra } as CardData);
}

function act(state: GameState, action: GameAction, db: Map<string, CardData>, player: 0 | 1 = 0): GameState {
  if (state.pendingPrompt) {
    expect(new SessionCoordinator().routePromptResponse(state, player, action).kind).toBe("resume");
    const r = resumePromptLifecycle(state, action, db, { drainPregame: (s) => s, advanceStartOfTurn: (s) => s });
    expect(r.responseRejected, JSON.stringify(action)).toBe(false);
    return JSON.parse(JSON.stringify(r.state)) as GameState;
  }
  const r = runPipeline(state, action, db, player);
  expect(r.valid, r.error).toBe(true);
  return JSON.parse(JSON.stringify(r.state)) as GameState;
}

class MemoryStorage implements SessionStorage {
  data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(key: string | Record<string, unknown>, value?: unknown): Promise<void> {
    for (const [k, v] of Object.entries(typeof key === "string" ? { [key]: value } : key)) {
      this.data.set(k, JSON.parse(JSON.stringify(v)));
    }
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

/** Save and reload through the session repository, live state and undo history. */
async function reload(state: GameState, db: Map<string, CardData>) {
  const storage = new MemoryStorage();
  const config = { nextJsUrl: "https://example.test", workerSecret: "test" };
  await new SessionRepository(storage, config).save({
    state,
    cardDb: db,
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
    undoHistory: [state],
  });
  const loaded = await new SessionRepository(storage, config).load();
  expect(loaded).not.toBeNull();
  expect(loaded!.undoHistory).toHaveLength(1);
  return { live: loaded!.state, undo: loaded!.undoHistory[0] };
}

// ─── OPT-976 ─────────────────────────────────────────────────────────────────

describe("OPT-976 ADD_TO_LIFE_FROM_DECK publishes CARD_ADDED_TO_LIFE", () => {
  function addFromDeck(face: "UP" | "DOWN", amount = 2) {
    const db = createTestCardDb();
    const state = createBattleReadyState(db);
    const deckTop = state.players[0].deck.slice(0, amount);
    const result = executeAddToLifeFromDeck(
      state,
      { type: "ADD_TO_LIFE_FROM_DECK", params: { amount, face, position: "TOP" } },
      state.players[0].leader.instanceId,
      0,
      db,
      new Map(),
    );
    return { state, result, deckTop };
  }

  it.each(["UP", "DOWN"] as const)("names each card, its owner and its face (%s)", (face) => {
    const { result, deckTop } = addFromDeck(face);
    expect(result.succeeded).toBe(true);
    expect(result.events).toHaveLength(2);
    const life = result.state.players[0].life;
    result.events.forEach((event, i) => {
      expect(event).toMatchObject({
        type: "CARD_ADDED_TO_LIFE",
        playerIndex: 0,
        payload: {
          cardInstanceId: deckTop[i].instanceId,
          cardId: deckTop[i].cardId,
          sourceZone: "DECK",
          movementCause: "EFFECT",
          face,
        },
      });
      const payload = event.payload as { newCardInstanceId: string };
      expect(life.some((c) => c.instanceId === payload.newCardInstanceId && c.face === face)).toBe(true);
    });
  });

  it("an empty deck adds nothing and publishes nothing", () => {
    const db = createTestCardDb();
    const state = createBattleReadyState(db);
    state.players[0].deck = [];
    const result = executeAddToLifeFromDeck(
      state,
      { type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1 } },
      state.players[0].leader.instanceId,
      0,
      db,
      new Map(),
    );
    expect(result.succeeded).toBe(false);
    expect(result.events).toEqual([]);
  });

  it("a face-down card from the deck is hidden from both players; face-up stays with its owner", () => {
    const down = addFromDeck("DOWN", 1).result.events[0] as GameEvent;
    const up = addFromDeck("UP", 1).result.events[0] as GameEvent;
    for (const player of [0, 1] as const) {
      const filtered = filterEventForPlayer(down, player);
      expect(filtered.payload).toMatchObject({ cardId: HIDDEN_IDENTITY, cardInstanceId: HIDDEN_IDENTITY });
    }
    expect(filterEventForPlayer(up, 0)).toEqual(up);
    expect((filterEventForPlayer(up, 1).payload as { cardId: string }).cardId).toBe(HIDDEN_IDENTITY);
  });

  it("the event survives the persisted-state reader", async () => {
    const db = createTestCardDb();
    const { result } = addFromDeck("DOWN", 1);
    const state: GameState = {
      ...result.state,
      eventLog: [...result.state.eventLog, ...(result.events as GameEvent[]).map((e) => ({ ...e, timestamp: 1 }))],
    };
    const { live } = await reload(state, db);
    expect(live.eventLog.filter((e) => e.type === "CARD_ADDED_TO_LIFE").at(-1)?.payload).toMatchObject({
      sourceZone: "DECK",
      face: "DOWN",
    });
  });
});

// ─── OPT-1014 ────────────────────────────────────────────────────────────────

describe("OPT-1014 LIFE_TO_HAND top-or-bottom asks the controller", () => {
  // OP09-104 Sabo: "[On Play] Add up to 1 {Revolutionary Army} type Character
  // card from your hand to the top of your Life cards face-up. Then, if you
  // have 2 or more Life cards, add 1 card from the top or bottom of your Life
  // cards to your hand."
  function playSabo(lifeCount: number) {
    const db = createTestCardDb();
    register(db, "OP09-104", { cost: 0 });
    let state = createBattleReadyState(db);
    state.players.forEach((p) => {
      p.characters = padChars([]);
      p.hand = [];
    });
    state.players[0].life = state.players[0].life
      .slice(0, lifeCount)
      .map((c, i) => ({ ...c, instanceId: `own-life-${i}` }));
    state.players[0].hand = [inst("sabo", "OP09-104", 0, "HAND")];
    const lifeBefore = structuredClone(state.players[0].life);
    state = act(state, { type: "PLAY_CARD", cardInstanceId: "sabo" }, db);
    return { db, state, lifeBefore };
  }

  function positionPrompt(state: GameState) {
    const prompt = state.pendingPrompt;
    expect(prompt?.respondingPlayer).toBe(0);
    if (prompt?.options.promptType !== "PLAYER_CHOICE") throw new Error("no position prompt");
    expect(prompt.options.choices).toEqual([
      { id: lifeToHandChoiceId("TOP"), label: "Top" },
      { id: lifeToHandChoiceId("BOTTOM"), label: "Bottom" },
    ]);
    // The prompt names an end, never a Life identity.
    expect(JSON.stringify(prompt.options)).not.toContain("own-life-");
    return prompt;
  }

  function expectTaken(
    state: GameState,
    lifeBefore: GameState["players"][0]["life"],
    end: "TOP" | "BOTTOM",
  ) {
    const taken = end === "TOP" ? lifeBefore[0] : lifeBefore[lifeBefore.length - 1];
    const kept = end === "TOP" ? lifeBefore.slice(1) : lifeBefore.slice(0, -1);
    expect(state.players[0].life.map((c) => c.instanceId)).toEqual(kept.map((c) => c.instanceId));
    expect(state.players[0].hand.map((c) => c.cardId)).toEqual([taken.cardId]);
    expect(state.pendingPrompt).toBeNull();
    expect(state.effectStack).toHaveLength(0);
    // Not damage: no [Trigger] (OPT-259).
    expect(state.eventLog.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(false);
    expect(state.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE")).toHaveLength(1);
  }

  it.each(["TOP", "BOTTOM"] as const)("%s takes that end of Life", (end) => {
    const { db, state, lifeBefore } = playSabo(4);
    positionPrompt(state);
    expect(state.players[0].life).toHaveLength(4);
    const done = act(state, { type: "PLAYER_CHOICE", choiceId: lifeToHandChoiceId(end) }, db);
    expectTaken(done, lifeBefore, end);
  });

  it.each(["TOP", "BOTTOM"] as const)("%s survives a live and an undo reload while pending", async (end) => {
    const { db, state, lifeBefore } = playSabo(3);
    positionPrompt(state);
    const { live, undo } = await reload(state, db);
    for (const restored of [live, undo]) {
      const prompt = positionPrompt(restored);
      const response: GameAction = { type: "PLAYER_CHOICE", choiceId: lifeToHandChoiceId(end), promptId: prompt.promptId };
      expect(new SessionCoordinator().routePromptResponse(restored, 1, response).kind).toBe("reject");
      expectTaken(act(restored, response, db), lifeBefore, end);
    }
  });

  it("rejects a choice it did not offer and keeps the prompt", () => {
    const { db, state } = playSabo(3);
    positionPrompt(state);
    const rejected = resumeFromStack(state, { type: "PLAYER_CHOICE", choiceId: "life-to-hand:MIDDLE" }, db);
    expect(rejected.rejected).toBe(true);
    expect(rejected.state).toEqual(state);
  });

  it("Life below the printed condition never prompts or moves a card", () => {
    const { state, lifeBefore } = playSabo(1);
    expect(state.pendingPrompt).toBeNull();
    expect(state.players[0].life).toEqual(lifeBefore);
    expect(state.players[0].hand).toHaveLength(0);
  });

  /** Test-only "[Activate: Main] Add 1 card from the top or bottom of your Life cards to your hand." */
  function activateLifeToHand(lifeCount: number) {
    const db = createTestCardDb();
    db.set("OPT1014-SRC", {
      ...CARDS.VANILLA,
      id: "OPT1014-SRC",
      effectSchema: {
        card_id: "OPT1014-SRC",
        card_name: "OPT1014-SRC",
        card_type: "Character",
        effects: [{
          id: "life_to_hand",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          actions: [{ type: "LIFE_TO_HAND", params: { amount: 1, position: "TOP_OR_BOTTOM" } }],
        }],
      },
    } as CardData);
    let state = createBattleReadyState(db);
    state.players[0].life = state.players[0].life.slice(0, lifeCount);
    state.players[0].hand = [];
    const lifeBefore = structuredClone(state.players[0].life);
    state.players[0].characters = padChars([inst("src", "OPT1014-SRC", 0, "CHARACTER")]);
    state = act(state, { type: "ACTIVATE_EFFECT", cardInstanceId: "src", effectId: "life_to_hand" }, db);
    return { state, lifeBefore };
  }

  it("empty Life never prompts", () => {
    const { state } = activateLifeToHand(0);
    expect(state.pendingPrompt).toBeNull();
    expect(state.players[0].hand).toHaveLength(0);
  });

  it("one Life card is the same card at both ends, so no prompt", () => {
    const { state, lifeBefore } = activateLifeToHand(1);
    expect(state.pendingPrompt).toBeNull();
    expect(state.players[0].life).toHaveLength(0);
    expect(state.players[0].hand.map((c) => c.cardId)).toEqual([lifeBefore[0].cardId]);
  });

  it("two Life cards ask", () => {
    const { state } = activateLifeToHand(2);
    expect(state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(state.players[0].life).toHaveLength(2);
  });

  it("inventory: every action-level TOP_OR_BOTTOM LIFE_TO_HAND prints 'top or bottom' of its own Life", () => {
    const found: string[] = [];
    for (const [cardId, schema] of Object.entries(AUTHORED_SCHEMAS)) {
      const walk = (node: unknown, inCost: boolean) => {
        if (Array.isArray(node)) return node.forEach((n) => walk(n, inCost));
        if (!node || typeof node !== "object") return;
        const r = node as Record<string, unknown>;
        const params = r.params as { position?: string } | undefined;
        if (!inCost && r.type === "LIFE_TO_HAND" && params?.position === "TOP_OR_BOTTOM") {
          expect(r.target, cardId).toBeUndefined();
          found.push(cardId);
        }
        for (const [k, v] of Object.entries(r)) walk(v, inCost || k === "costs");
      };
      walk(schema, false);
    }
    // The other LIFE_TO_HAND TOP_OR_BOTTOM uses are costs, which already ask.
    expect(found.sort()).toEqual(["OP08-116", "OP09-104", "ST22-015"]);
  });
});

// ─── OPT-917 ─────────────────────────────────────────────────────────────────

describe("OPT-917 ST04-001 trashes an opponent Life card from any position", () => {
  const FACE_UP = "OPT917-FACEUP";

  function activateKaido() {
    const db = createTestCardDb();
    register(db, "ST04-001", { type: "Leader", cost: null });
    db.set(FACE_UP, { ...CARDS.VANILLA, id: FACE_UP });
    let state = createBattleReadyState(db);
    state.players[0].leader = inst("ldr", "ST04-001", 0, "LEADER");
    state.players[0].donCostArea = Array.from({ length: 8 }, (_, i) => ({
      instanceId: `don-x-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));
    state.players[1].life = state.players[1].life.map((c, i) => ({
      ...c,
      ...(i === 1 ? { cardId: FACE_UP } : {}),
      face: i === 1 ? ("UP" as const) : ("DOWN" as const),
    }));
    const lifeBefore = structuredClone(state.players[1].life);
    state = act(state, { type: "ACTIVATE_EFFECT", cardInstanceId: "ldr", effectId: "activate_trash_life" }, db);
    return { db, state, lifeBefore };
  }

  function lifePrompt(state: GameState) {
    const prompt = state.pendingPrompt;
    expect(prompt?.respondingPlayer).toBe(0);
    if (prompt?.options.promptType !== "SELECT_TARGET") throw new Error("no Life target prompt");
    return prompt.options;
  }

  it("offers every Life position, 0 to 1, with only face-up identities shown", () => {
    const { state, lifeBefore } = activateKaido();
    const options = lifePrompt(state);
    expect(options.validTargets).toEqual(lifeBefore.map((c) => c.instanceId));
    expect(options.countMin).toBe(0);
    expect(options.countMax).toBe(1);
    expect(options.cards.map((c) => c.instanceId)).toEqual(lifeBefore.map((c) => c.instanceId));
    expect(options.cards.map((c) => c.cardId)).toEqual(
      lifeBefore.map((c) => (c.face === "UP" ? c.cardId : HIDDEN_IDENTITY)),
    );
  });

  it("no session payload carries a face-down Life identity", () => {
    const { db, state, lifeBefore } = activateKaido();
    const hidden = lifeBefore.filter((c) => c.face === "DOWN").map((c) => c.cardId);
    // Make face-down identities unique strings so a leak is detectable.
    const marked: GameState = structuredClone(state);
    marked.players[1].life = marked.players[1].life.map((c, i) =>
      c.face === "DOWN" ? { ...c, cardId: `SECRET-${i}` } : c);
    for (let i = 0; i < marked.players[1].life.length; i++) {
      if (marked.players[1].life[i].face === "DOWN") db.set(`SECRET-${i}`, { ...CARDS.VANILLA, id: `SECRET-${i}` });
    }
    expect(hidden.length).toBeGreaterThan(0);
    const views = [
      visibleStateForPlayer(marked, db, 0),
      visibleStateForPlayer(marked, db, 1),
      visibleStateForSpectator(marked, db),
    ];
    for (const view of views) expect(JSON.stringify(view)).not.toContain("SECRET-");
    // The chooser still sees the face-up card and every position.
    const chooser = views[0].pendingPrompt?.options;
    if (chooser?.promptType !== "SELECT_TARGET") throw new Error("chooser lost the prompt");
    expect(chooser.cards.map((c) => c.cardId)).toContain(FACE_UP);
    expect(chooser.validTargets).toEqual(lifeBefore.map((c) => c.instanceId));
  });

  it("a rejected selection re-prompts without revealing face-down identities", () => {
    const { db, state, lifeBefore } = activateKaido();
    const result = resumeFromStack(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds: lifeBefore.slice(0, 2).map((c) => c.instanceId) },
      db,
    );
    expect(result.rejected).toBe(true);
    const options = result.pendingPrompt?.options;
    if (options?.promptType !== "SELECT_TARGET") throw new Error("no re-prompt");
    expect(options.cards.filter((c) => c.cardId !== HIDDEN_IDENTITY).map((c) => c.cardId)).toEqual([FACE_UP]);
  });

  it.each([0, 3, 4] as const)("trashes the chosen card at index %i and leaves the rest in order", (index) => {
    const { db, state, lifeBefore } = activateKaido();
    lifePrompt(state);
    const chosen = lifeBefore[index];
    const done = act(state, { type: "SELECT_TARGET", selectedInstanceIds: [chosen.instanceId] }, db);
    expect(done.players[1].trash.map((c) => c.cardId)).toEqual([chosen.cardId]);
    expect(done.players[1].life.map((c) => c.instanceId)).toEqual(
      lifeBefore.filter((c) => c.instanceId !== chosen.instanceId).map((c) => c.instanceId),
    );
    expect(done.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE" && e.playerIndex === 1)).toHaveLength(1);
    expect(done.eventLog.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(false);
    expect(done.pendingPrompt).toBeNull();
  });

  it("choosing none leaves Life untouched", () => {
    const { db, state, lifeBefore } = activateKaido();
    const done = act(state, { type: "SELECT_TARGET", selectedInstanceIds: [] }, db);
    expect(done.players[1].life).toEqual(lifeBefore);
    expect(done.players[1].trash).toHaveLength(0);
    expect(done.pendingPrompt).toBeNull();
  });

  it("the pending choice survives a live and an undo reload", async () => {
    const { db, state, lifeBefore } = activateKaido();
    const { live, undo } = await reload(state, db);
    for (const restored of [live, undo]) {
      expect(lifePrompt(restored).cards.map((c) => c.cardId)).toEqual(
        lifeBefore.map((c) => (c.face === "UP" ? c.cardId : HIDDEN_IDENTITY)),
      );
      const done = act(restored, {
        type: "SELECT_TARGET",
        selectedInstanceIds: [lifeBefore[1].instanceId],
        promptId: restored.pendingPrompt!.promptId,
      }, db);
      expect(done.players[1].trash.map((c) => c.cardId)).toEqual([FACE_UP]);
      expect(done.players[1].life).toHaveLength(lifeBefore.length - 1);
    }
  });

  it("an empty opponent Life does not prompt", () => {
    const db = createTestCardDb();
    register(db, "ST04-001", { type: "Leader", cost: null });
    let state = createBattleReadyState(db);
    state.players[0].leader = inst("ldr", "ST04-001", 0, "LEADER");
    state.players[0].donCostArea = Array.from({ length: 7 }, (_, i) => ({
      instanceId: `don-x-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));
    state.players[1].life = [];
    state = act(state, { type: "ACTIVATE_EFFECT", cardInstanceId: "ldr", effectId: "activate_trash_life" }, db);
    expect(state.pendingPrompt).toBeNull();
    expect(state.players[1].trash).toHaveLength(0);
  });
});
