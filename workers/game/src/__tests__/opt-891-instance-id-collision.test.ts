import { describe, expect, it } from "vitest";
import {
  createDeterministicExecutionContext,
  ensureExecutionContext,
  maxEngineIdCounter,
  parseEngineIdCounter,
  reconcileExecutionContextIdCounter,
} from "../engine/execution-context.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import {
  transitionCard,
  transitionCards,
  transitionDetachedCard,
  type TransitionDestination,
} from "../engine/zone-transition.js";
import {
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import {
  CARDS,
  advanceToPhase,
  createBattleReadyState,
  createTestCardDb,
  padChars,
  reseedExecutionContext,
  setupGame,
} from "./helpers.js";

// OPT-891: every engine id is `${namespace}_${base36 counter padded to 8}` from
// one shared `executionContext.idCounter`. A context whose counter is below an
// id already in state re-issues that id; two cards then share an identity and
// the next id-keyed removal drops both while moving one.
//
// OP04-048 Sasaki (docs/cards/OP-04.md:341): "[On Play] Return all cards in your
// hand to your deck and shuffle your deck. Then, draw cards equal to the number
// you returned to your deck." Hand + deck is therefore conserved.

const SASAKI: Partial<CardData> = {
  id: "OP04-048",
  name: "Sasaki",
  type: "Character",
  color: ["Blue"],
  cost: 3,
  power: 4000,
  counter: 2000,
};

function card(instanceId: string, zone: CardInstance["zone"], owner: 0 | 1 = 0, cardId = CARDS.VANILLA.id): CardInstance {
  return {
    instanceId,
    cardId,
    controller: owner,
    owner,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 0,
  };
}

function sasakiFixture() {
  const db = createTestCardDb();
  const schema = getEffectSchema("OP04-048");
  expect(schema).toBeTruthy();
  db.set("OP04-048", { ...CARDS.VANILLA, ...SASAKI, effectSchema: schema! } as CardData);
  const state = createBattleReadyState(db);
  state.players.forEach((p) => (p.characters = padChars([])));
  const hand = [0, 1, 2, 3].map((i) => card(`hand-${i}`, "HAND"));
  state.players[0].hand = [...hand, card("sasaki-hand", "HAND", 0, "OP04-048")];
  return { db, state };
}

/** The OPT-853 fixture mistake: a fresh context with idCounter 0. */
function withResetContext(state: GameState): GameState {
  return {
    ...state,
    executionContext: createDeterministicExecutionContext("opt-891-reset", { gameId: state.id }),
  };
}

function allCardIds(state: GameState): string[] {
  return state.players.flatMap((p) => [
    p.leader.instanceId,
    ...(p.stage ? [p.stage.instanceId] : []),
    ...p.characters.flatMap((c) => (c ? [c.instanceId] : [])),
    ...p.hand.map((c) => c.instanceId),
    ...p.deck.map((c) => c.instanceId),
    ...p.trash.map((c) => c.instanceId),
    ...p.life.map((c) => c.instanceId),
    ...p.removedFromGame.map((c) => c.instanceId),
  ]);
}

const inventory = (p: PlayerState) =>
  p.hand.length + p.deck.length + p.trash.length + p.life.length +
  p.removedFromGame.length + p.characters.filter(Boolean).length + (p.stage ? 1 : 0);

describe("OPT-891 reproduction through the pipeline", () => {
  it("a reset idCounter makes Sasaki's hand-return throw instead of silently losing cards", () => {
    const f = sasakiFixture();
    const state = withResetContext(f.state);
    // Precondition: the next card id is already live (player 0's leader).
    expect(state.players[0].leader.instanceId).toBe("card_00000001");
    expect(() =>
      runPipeline(state, { type: "PLAY_CARD", cardInstanceId: "sasaki-hand" }, f.db, 0),
    ).toThrow(/instance id collision/);
  });

  it("with the counter reconciled, the same play conserves every card and keeps ids unique", () => {
    const f = sasakiFixture();
    const state = reconcileExecutionContextIdCounter(withResetContext(f.state));
    const before = inventory(state.players[0]);
    const r = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: "sasaki-hand" }, f.db, 0);
    expect(r.valid, r.error).toBe(true);
    const p = r.state.players[0];
    // Sasaki moved hand → field; the 4 returned cards were redrawn.
    expect(p.hand).toHaveLength(4);
    expect(inventory(p)).toBe(before);
    const ids = allCardIds(r.state);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the reseed test helper keeps the counter, so a reseeded fixture plays cleanly", () => {
    const f = sasakiFixture();
    const state = reseedExecutionContext(f.state, "opt-891-seed");
    expect(state.executionContext.seed).toBe("opt-891-seed");
    expect(state.executionContext.idCounter).toBe(f.state.executionContext.idCounter);
    const r = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: "sasaki-hand" }, f.db, 0);
    expect(r.valid, r.error).toBe(true);
    expect(inventory(r.state.players[0])).toBe(inventory(f.state.players[0]));
  });
});

// ─── Production path: rule 3-7-6-1 rule-trash inside a play batch ───────────
//
// Rule 3-7-6-1: playing a Character onto a full area trashes one of the
// player's Characters first. The mid-batch resume grafted the pre-trash
// execution context back after scanning the trash event, rewinding idCounter
// so the next played card received the trashed victim's fresh instance id.

describe("OPT-891 rule-trash for play keeps the id counter monotonic", () => {
  it("a mid-batch overflow never re-issues the trashed victim's id to the played card", () => {
    const db = createTestCardDb();
    const batchPlayer: CardData = {
      ...CARDS.VANILLA,
      id: "OPT891-BATCH-PLAYER",
      name: "Batch Player",
      cost: 0,
      effectSchema: {
        card_id: "OPT891-BATCH-PLAYER",
        card_name: "Batch Player",
        card_type: "Character",
        effects: [{
          id: "opt891-play-two",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [{
            type: "PLAY_CARD",
            target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { exact: 2 } },
            params: { source_zone: "TRASH", cost_override: "FREE" },
          }],
        }],
      },
    };
    db.set(batchPlayer.id, batchPlayer);
    let state = createBattleReadyState(db);
    state.players[0].characters = padChars([
      card("board-0", "CHARACTER"),
      card("board-1", "CHARACTER"),
      card("board-2", "CHARACTER"),
    ]);
    state.players[0].trash = [card("trash-a", "TRASH"), card("trash-b", "TRASH")];
    state.players[0].hand = [card("source", "HAND", 0, batchPlayer.id)];

    const played = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: "source" }, db, 0);
    expect(played.valid, played.error).toBe(true);
    state = played.state;

    let sawRuleTrash = false;
    for (let guard = 0; state.pendingPrompt && guard < 5; guard++) {
      const options = state.pendingPrompt.options;
      expect(options.promptType).toBe("SELECT_TARGET");
      if (options.promptType !== "SELECT_TARGET") break;
      const targets = options.validTargets ?? [];
      const onBoard = targets.filter((id) =>
        state.players[0].characters.some((c) => c?.instanceId === id));
      const pick = onBoard.length > 0 ? [onBoard[0]] : targets.slice(0, options.countMax ?? 2);
      sawRuleTrash ||= onBoard.length > 0;
      const resumed = resumePromptLifecycle(
        state,
        { type: "SELECT_TARGET", selectedInstanceIds: pick },
        db,
        { drainPregame: (s) => s, advanceStartOfTurn: (s) => s },
      );
      expect(resumed.responseRejected).toBe(false);
      state = resumed.state;
    }
    expect(sawRuleTrash).toBe(true);
    expect(state.pendingPrompt).toBeNull();

    const p = state.players[0];
    // Source + 2 from trash onto a 3-card board: 5 on field, 1 rule-trashed.
    expect(p.characters.filter(Boolean)).toHaveLength(5);
    expect(p.trash).toHaveLength(1);
    const ids = allCardIds(state);
    expect(new Set(ids).size).toBe(ids.length);
    expect(state.executionContext.idCounter).toBeGreaterThanOrEqual(maxEngineIdCounter(state));
  });
});

// ─── transitionCards collision detection ─────────────────────────────────────

const NEXT_COUNTER = 10_000;
const NEXT_CARD_ID = `card_${NEXT_COUNTER.toString(36).padStart(8, "0")}`;

/** A state whose next allocated card id is NEXT_CARD_ID, unused unless placed. */
function collisionBase(): GameState {
  const state = createBattleReadyState(createTestCardDb());
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
    p.removedFromGame = [];
  });
  state.players[0].hand = [card("mover", "HAND")];
  state.players[0].trash = [card("mover-trash", "TRASH")];
  state.executionContext = { ...state.executionContext, idCounter: NEXT_COUNTER - 1 };
  expect(allCardIds(state)).not.toContain(NEXT_CARD_ID);
  return state;
}

type ColliderZone = "LEADER" | "STAGE" | "CHARACTER" | "HAND" | "DECK" | "TRASH" | "LIFE" | "REMOVED_FROM_GAME";
const COLLIDER_ZONES: ColliderZone[] = [
  "LEADER", "STAGE", "CHARACTER", "HAND", "DECK", "TRASH", "LIFE", "REMOVED_FROM_GAME",
];

function placeCollider(state: GameState, owner: 0 | 1, zone: ColliderZone): void {
  const p = state.players[owner];
  const collider = card(NEXT_CARD_ID, zone, owner);
  switch (zone) {
    case "LEADER": p.leader = { ...p.leader, instanceId: NEXT_CARD_ID }; break;
    case "STAGE": p.stage = collider; break;
    case "CHARACTER": p.characters[4] = collider; break;
    case "HAND": p.hand = [...p.hand, collider]; break;
    case "DECK": p.deck = [...p.deck, collider]; break;
    case "TRASH": p.trash = [...p.trash, collider]; break;
    case "LIFE": p.life = [...p.life, { instanceId: NEXT_CARD_ID, cardId: CARDS.VANILLA.id, face: "DOWN" }]; break;
    case "REMOVED_FROM_GAME": p.removedFromGame = [collider]; break;
  }
}

describe("OPT-891 transitionCards rejects a new identity that is already live", () => {
  it("control: with no collider the move succeeds and allocates the expected id", () => {
    const moved = transitionCards(collisionBase(), ["mover"], "TRASH");
    expect(moved.transitions.map((t) => t.fact.newInstanceId)).toEqual([NEXT_CARD_ID]);
  });

  for (const owner of [0, 1] as const) {
    for (const zone of COLLIDER_ZONES) {
      it(`throws when the allocated id is already on player ${owner}'s ${zone}`, () => {
        const state = collisionBase();
        placeCollider(state, owner, zone);
        const snapshot = structuredClone(state);
        expect(() => transitionCards(state, ["mover"], "TRASH")).toThrow(
          new RegExp(`instance id collision.*p${owner}\\.${zone}`),
        );
        expect(state).toEqual(snapshot);
      });
    }
  }

  const DESTINATIONS: Array<[TransitionDestination, string]> = [
    ["HAND", "mover-trash"],
    ["DECK", "mover"],
    ["TRASH", "mover"],
    ["LIFE", "mover"],
    ["REMOVED_FROM_GAME", "mover"],
    ["CHARACTER", "mover"],
    ["STAGE", "mover"],
  ];
  for (const [destination, source] of DESTINATIONS) {
    it(`throws for a move into ${destination} when the id is live in the opponent's deck`, () => {
      const state = collisionBase();
      placeCollider(state, 1, "DECK");
      expect(() => transitionCards(state, [source], destination)).toThrow(/instance id collision/);
    });
  }

  it("throws when the counter would re-issue the moving card's own id", () => {
    const state = collisionBase();
    state.players[0].hand = [card(NEXT_CARD_ID, "HAND")];
    expect(() => transitionCard(state, NEXT_CARD_ID, "TRASH")).toThrow(/instance id collision/);
  });

  it("throws when a detached card would be re-issued its own id", () => {
    const state = collisionBase();
    expect(() =>
      transitionDetachedCard(
        state,
        { instanceId: NEXT_CARD_ID, cardId: CARDS.VANILLA.id, source: "HAND", owner: 0 },
        "TRASH",
      ),
    ).toThrow(/instance id collision.*moving card/);
  });
});

// ─── Duplicate ids already in a zone ─────────────────────────────────────────

describe("OPT-891 removal never drops a same-id sibling", () => {
  const FILTERED: Array<[ColliderZone, TransitionDestination]> = [
    ["HAND", "TRASH"],
    ["DECK", "HAND"],
    ["TRASH", "HAND"],
    ["LIFE", "HAND"],
    ["REMOVED_FROM_GAME", "HAND"],
  ];
  for (const [zone, destination] of FILTERED) {
    it(`throws rather than removing two ${zone} cards that share an id`, () => {
      const state = collisionBase();
      const p = state.players[0];
      const dup = card("dup", zone);
      if (zone === "HAND") p.hand = [dup, { ...dup }];
      if (zone === "DECK") p.deck = [dup, { ...dup }, ...p.deck];
      if (zone === "TRASH") p.trash = [dup, { ...dup }];
      if (zone === "LIFE") {
        const life = { instanceId: "dup", cardId: CARDS.VANILLA.id, face: "DOWN" as const };
        p.life = [life, { ...life }];
      }
      if (zone === "REMOVED_FROM_GAME") p.removedFromGame = [dup, { ...dup }];
      expect(() => transitionCard(state, "dup", destination)).toThrow(/2 cards in .* share instance id 'dup'/);
    });
  }
});

// ─── Counter derivation on construct / restore ───────────────────────────────

describe("OPT-891 id-counter reconciliation", () => {
  it("parses only allocator-format ids in known namespaces", () => {
    expect(parseEngineIdCounter("card_0000000a")).toBe(10);
    expect(parseEngineIdCounter("active-effect_00000010")).toBe(36);
    expect(parseEngineIdCounter("don_requirement")).toBeNull();
    expect(parseEngineIdCounter("trigger_activated")).toBeNull();
    expect(parseEngineIdCounter("hand-0")).toBeNull();
    expect(parseEngineIdCounter("widget_00000001")).toBeNull();
    expect(parseEngineIdCounter("card_0000001")).toBeNull();
  });

  it("is the identity for engine-produced states (normal-game ids unchanged)", () => {
    const { state: setup, cardDb } = setupGame();
    expect(reconcileExecutionContextIdCounter(setup)).toBe(setup);
    expect(maxEngineIdCounter(setup)).toBeLessThanOrEqual(setup.executionContext.idCounter);
    const main = advanceToPhase(setup, "MAIN", cardDb);
    expect(main.turn.phase).toBe("MAIN");
    expect(reconcileExecutionContextIdCounter(main)).toBe(main);
  });

  it("raises a reset counter to the highest id in state, covering every id-bearing field", () => {
    const f = sasakiFixture();
    const reset = withResetContext(f.state);
    const floor = maxEngineIdCounter(f.state);
    expect(floor).toBeGreaterThan(0);
    expect(reconcileExecutionContextIdCounter(reset).executionContext.idCounter).toBe(floor);

    const high = (n: number) => n.toString(36).padStart(8, "0");
    const probes: Array<[string, (s: GameState) => void]> = [
      ["attached DON!!", (s) => { s.players[1].leader.attachedDon = [{ instanceId: `don_${high(5001)}`, state: "RESTED", attachedTo: s.players[1].leader.instanceId }]; }],
      ["DON!! deck", (s) => { s.players[1].donDeck = [{ instanceId: `don_${high(5002)}`, state: "ACTIVE", attachedTo: null }]; }],
      ["life", (s) => { s.players[1].life = [{ instanceId: `card_${high(5003)}`, cardId: CARDS.VANILLA.id, face: "DOWN" }]; }],
      ["trigger registry", (s) => { s.triggerRegistry = [{ ...(s.triggerRegistry[0] ?? {}), id: `trigger_${high(5004)}` } as GameState["triggerRegistry"][number]]; }],
      ["prompt id", (s) => { s.pendingPrompt = { promptId: `prompt_${high(5005)}` } as GameState["pendingPrompt"]; }],
      ["battle id", (s) => { s.turn.battle = { battleId: `battle_${high(5006)}` } as GameState["turn"]["battle"]; }],
    ];
    probes.forEach(([label, place], index) => {
      const probe = structuredClone(reset);
      place(probe);
      expect(
        reconcileExecutionContextIdCounter(probe).executionContext.idCounter,
        label,
      ).toBe(5001 + index);
    });
  });

  it("a legacy state without an execution context gets a counter past its ids", () => {
    const { state } = setupGame();
    const legacy = { ...state } as Partial<GameState>;
    delete legacy.executionContext;
    const hydrated = ensureExecutionContext(legacy as GameState);
    expect(hydrated.executionContext.seed).toBe(`legacy:${state.id}`);
    expect(hydrated.executionContext.idCounter).toBe(maxEngineIdCounter(state));
  });
});

// ─── Persisted reload ────────────────────────────────────────────────────────

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
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

function repository(storage: SessionStorage): SessionRepository {
  return new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
}

async function saveGame(storage: MemoryStorage) {
  const { state, cardDb } = setupGame();
  return repository(storage).save({
    state,
    cardDb,
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
    undoHistory: [state],
  });
}

describe("OPT-891 persisted reload restores the id-counter invariant", () => {
  it("an untampered session reloads with the identical counter", async () => {
    const storage = new MemoryStorage();
    const saved = await saveGame(storage);
    const loaded = await repository(storage).load();
    expect(loaded!.state.executionContext).toEqual(saved.state.executionContext);
    expect(loaded!.undoHistory[0].executionContext).toEqual(saved.undoHistory[0].executionContext);
  });

  it("a stored counter below the state's ids is raised on load, state and undo snapshots alike", async () => {
    const storage = new MemoryStorage();
    const saved = await saveGame(storage);
    const floor = maxEngineIdCounter(saved.state);
    const session = storage.data.get(SESSION_STORAGE_KEY) as { state: GameState };
    session.state.executionContext.idCounter = 0;
    const undo = storage.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY) as GameState[];
    undo[0].executionContext.idCounter = 3;

    const loaded = await repository(storage).load();
    expect(loaded!.state.executionContext.idCounter).toBe(floor);
    expect(loaded!.undoHistory[0].executionContext.idCounter).toBe(maxEngineIdCounter(undo[0]));
  });
});
