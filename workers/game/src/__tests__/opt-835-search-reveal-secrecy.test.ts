/**
 * OPT-835 — keep OP16-119's searched Life pick secret.
 *
 * Card (docs/cards/OP-16.md): "[On Play] Look at 3 cards from the top of your
 * deck; add up to 1 card to the top of your Life cards. Then, place the rest
 * at the bottom of your deck in any order."
 * FAQ (docs/FAQs/qa_op16.md, OP16-119): "Do I reveal the card I add to my Life
 * cards using this card's [On Play] effect to my opponent? — No, you add it to
 * your Life cards without revealing it to your opponent."
 *
 * Rule 11-2-1 otherwise requires a secret-to-secret move (deck → hand, deck →
 * face-down Life) to be revealed, so ordinary "reveal up to 1 … and add it to
 * your hand" searches must stay public. The engine represents the exception
 * with the explicit SEARCH_DECK / SEARCH_TRASH_THE_REST param `reveal: false`.
 *
 * Everything below drives the real pipeline with the registered authored
 * schemas and inspects every client-bound projection: the opponent's filtered
 * state (live update and reconnect snapshot share it), the spectator merge,
 * and a persisted JSON round-trip of the session state.
 */

import { describe, expect, it } from "vitest";
import type { Action } from "../engine/effect-types.js";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameEvent,
  GameState,
  PendingEvent,
  PlayerState,
} from "../types.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAllAuthoredSchemas, getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  handleArrangeSearchDeck,
  handleArrangeSearchTrashTheRest,
} from "../engine/effect-resolver/resume/deck.js";
import {
  visibleStateForPlayer,
  visibleStateForSpectator,
} from "../session/visibility.js";
import { validatePersistedGameStateCore } from "../session/persisted-game-state.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const SECRET = "OPT835-SECRET-PICK";
const REST_A = "OPT835-REST-A";
const REST_B = "OPT835-REST-B";
const DECK_TAIL = "OPT835-DECK-TAIL";

function deckCard(cardId: string, instanceId: string): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "DECK",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
}

interface SetupOptions {
  deckTypes?: string[];
  searcherData?: Partial<CardData>;
  /** Replace player 0's Leader with a card of this name (e.g. "Sanji"). */
  leaderName?: string;
}

function setup(
  searcherId: string,
  deckIds: [string, string, string],
  { deckTypes = [], searcherData = {}, leaderName }: SetupOptions = {},
) {
  const db = createTestCardDb();
  const schema = getEffectSchema(searcherId);
  if (!schema) throw new Error(`${searcherId} schema not registered`);
  db.set(searcherId, {
    ...CARDS.VANILLA,
    id: searcherId,
    name: schema.card_name ?? searcherId,
    cost: 1,
    ...searcherData,
    effectSchema: schema,
  });
  const LEADER_ID = "OPT835-LEADER";
  if (leaderName) db.set(LEADER_ID, { ...CARDS.LEADER, id: LEADER_ID, name: leaderName });
  for (const id of [...deckIds, DECK_TAIL]) {
    db.set(id, { ...CARDS.VANILLA, id, name: id, types: deckTypes });
  }

  const state = createBattleReadyState(db);
  for (const p of state.players) {
    p.characters = padChars([]);
    p.hand = [];
  }
  const searcher: CardInstance = {
    ...deckCard(searcherId, `${searcherId}-hand`),
    zone: "HAND",
  };
  state.players[0].hand = [searcher];
  if (leaderName) state.players[0].leader = { ...state.players[0].leader, cardId: LEADER_ID };
  state.players[0].deck = [
    deckCard(deckIds[0], "opt835-deck-0"),
    deckCard(deckIds[1], "opt835-deck-1"),
    deckCard(deckIds[2], "opt835-deck-2"),
    deckCard(DECK_TAIL, "opt835-deck-3"),
  ];
  state.eventLog = [];
  return { db, state, searcher };
}

function play(state: GameState, db: Map<string, CardData>, card: CardInstance): GameState {
  const r = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: card.instanceId }, db, 0);
  expect(r.valid, r.error).toBe(true);
  return r.state;
}

function respond(state: GameState, db: Map<string, CardData>, action: GameAction): GameState {
  const r = resumePromptLifecycle(state, action, db, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => s,
  });
  expect(r.responseRejected).toBe(false);
  return r.state;
}

function pickFirst(state: GameState, db: Map<string, CardData>): GameState {
  const prompt = state.pendingPrompt?.options;
  expect(prompt?.promptType).toBe("ARRANGE_TOP_CARDS");
  if (prompt?.promptType !== "ARRANGE_TOP_CARDS") throw new Error("missing arrange prompt");
  const ids = prompt.cards.map((c) => c.instanceId);
  expect(ids.slice(0, 3)).toEqual(["opt835-deck-0", "opt835-deck-1", "opt835-deck-2"]);
  return respond(state, db, {
    type: "ARRANGE_TOP_CARDS",
    keptCardInstanceId: ids[0],
    keptCardInstanceIds: [ids[0]],
    orderedInstanceIds: ids.slice(1).reverse(),
    destination: "bottom",
  });
}

function revealEvents(state: GameState): Extract<GameEvent, { type: "CARDS_REVEALED" }>[] {
  return state.eventLog.filter(
    (e): e is Extract<GameEvent, { type: "CARDS_REVEALED" }> => e.type === "CARDS_REVEALED",
  );
}

/** Every client-bound projection a non-owner can receive. */
function nonOwnerProjections(state: GameState, db: Map<string, CardData>): Record<string, GameState> {
  const persisted = JSON.parse(JSON.stringify(state)) as GameState;
  expect(validatePersistedGameStateCore(persisted)).toBeNull();
  return {
    opponent: visibleStateForPlayer(state, db, 1),
    spectator: visibleStateForSpectator(state, db),
    "opponent after persisted reload": visibleStateForPlayer(persisted, db, 1),
    "spectator after persisted reload": visibleStateForSpectator(persisted, db),
  };
}

describe("OPT-835: OP16-119 searched Life pick stays secret", () => {
  function resolveTeach() {
    const { db, state, searcher } = setup("OP16-119", [SECRET, REST_A, REST_B]);
    const afterPlay = play(state, db, searcher);
    const resolved = pickFirst(afterPlay, db);
    return { db, afterPlay, resolved };
  }

  it("keeps the looked-at cards hidden from non-owners while the arrange prompt is pending", () => {
    const { db, afterPlay } = resolveTeach();
    expect(afterPlay.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    for (const [label, view] of Object.entries(nonOwnerProjections(afterPlay, db))) {
      expect(JSON.stringify(view), label).not.toContain(SECRET);
    }
  });

  it("places the pick face-down on top of Life and bottoms the rest in chosen order", () => {
    const { resolved } = resolveTeach();
    expect(resolved.pendingPrompt).toBeNull();
    const p0 = resolved.players[0];
    expect(p0.life[0]).toMatchObject({ cardId: SECRET, face: "DOWN" });
    expect(p0.hand).toHaveLength(0);
    expect(p0.deck.map((c) => c.cardId)).toEqual([DECK_TAIL, REST_B, REST_A]);
  });

  it("never exposes the picked identity to the opponent, spectators, or persisted history", () => {
    const { db, resolved } = resolveTeach();
    const pickedInstanceIds = ["opt835-deck-0", resolved.players[0].life[0].instanceId];
    for (const [label, view] of Object.entries(nonOwnerProjections(resolved, db))) {
      const serialized = JSON.stringify(view);
      expect(serialized, label).not.toContain(SECRET);
      for (const id of pickedInstanceIds) expect(serialized, `${label}: ${id}`).not.toContain(id);
      // The search remains visible as an anonymous controller-only event.
      for (const event of revealEvents(view)) {
        expect(event.payload.visibility, label).not.toBe("BOTH");
      }
    }
  });

  it("still tells the owner which card they put into Life", () => {
    const { db, resolved } = resolveTeach();
    const ownerView = visibleStateForPlayer(resolved, db, 0);
    const reveals = revealEvents(ownerView);
    expect(reveals).toHaveLength(1);
    expect(reveals[0].payload).toMatchObject({
      visibility: "CONTROLLER_ONLY",
      visibleTo: 0,
      source: "search",
      cards: [{ instanceId: "opt835-deck-0", cardId: SECRET }],
    });
    expect(ownerView.players[0].life[0]).toMatchObject({ cardId: SECRET, face: "DOWN" });
  });
});

describe("OPT-835: OP12-079 searched hand pick stays secret", () => {
  // Card (docs/cards/OP-12.md): "[Main] If your Leader is [Sanji], look at 3
  // cards from the top of your deck and add up to 1 card to your hand. ..."
  // FAQ (docs/FAQs/qa_op12.md, OP12-079): "Do I reveal the card I add to my
  // hand using this [Main] effect to my opponent? — No, you do not reveal it."
  const PICK = "OPT835-SECRET-HAND-PICK";

  function resolveLuffyEvent() {
    const { db, state, searcher } = setup("OP12-079", [PICK, REST_A, REST_B], {
      searcherData: {
        type: "Event",
        cost: 1,
        power: null,
        counter: null,
        color: ["Purple"],
        effectText:
          "[Main] If your Leader is [Sanji], look at 3 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order.",
      },
      leaderName: "Sanji",
    });
    const afterPlay = play(state, db, searcher);
    const resolved = pickFirst(afterPlay, db);
    return { db, resolved };
  }

  it("adds the pick to hand, trashes the Event and bottoms the rest", () => {
    const { resolved } = resolveLuffyEvent();
    expect(resolved.pendingPrompt).toBeNull();
    const p0 = resolved.players[0];
    expect(p0.hand.map((c) => c.cardId)).toEqual([PICK]);
    expect(p0.trash.map((c) => c.cardId)).toContain("OP12-079");
    expect(p0.deck.map((c) => c.cardId)).toEqual([DECK_TAIL, REST_B, REST_A]);
  });

  it("never exposes the picked identity to the opponent or in spectator/persisted history", () => {
    const { db, resolved } = resolveLuffyEvent();
    const pickedInstanceIds = ["opt835-deck-0", resolved.players[0].hand[0].instanceId];
    for (const [label, view] of Object.entries(nonOwnerProjections(resolved, db))) {
      // Spectators see both hands by policy (session/visibility.ts union of
      // player views), so for them only the history must stay anonymous. The
      // opponent must not learn the pick from any field.
      const serialized = JSON.stringify(label.startsWith("spectator") ? view.eventLog : view);
      expect(serialized, label).not.toContain(PICK);
      for (const id of pickedInstanceIds) expect(serialized, `${label}: ${id}`).not.toContain(id);
      for (const event of revealEvents(view)) {
        expect(event.payload.visibility, label).not.toBe("BOTH");
      }
    }
  });

  it("still tells the owner which card they added", () => {
    const { db, resolved } = resolveLuffyEvent();
    const ownerView = visibleStateForPlayer(resolved, db, 0);
    const reveals = revealEvents(ownerView);
    expect(reveals).toHaveLength(1);
    expect(reveals[0].payload).toMatchObject({
      visibility: "CONTROLLER_ONLY",
      visibleTo: 0,
      source: "search",
      cards: [{ instanceId: "opt835-deck-0", cardId: PICK }],
    });
    expect(ownerView.players[0].hand.map((c) => c.cardId)).toEqual([PICK]);
  });
});

describe("OPT-835: ordinary reveal-to-hand searches stay public", () => {
  it("OP01-016 Nami reveals the {Straw Hat Crew} pick to the opponent and spectators", () => {
    const PICK = "OPT835-STRAW-HAT";
    const { db, state, searcher } = setup("OP01-016", [PICK, REST_A, REST_B], { deckTypes: ["Straw Hat Crew"] });
    const resolved = pickFirst(play(state, db, searcher), db);
    expect(resolved.players[0].hand.map((c) => c.cardId)).toEqual([PICK]);
    for (const [label, view] of Object.entries(nonOwnerProjections(resolved, db))) {
      const reveals = revealEvents(view);
      expect(reveals, label).toHaveLength(1);
      expect(reveals[0].payload, label).toMatchObject({
        visibility: "BOTH",
        source: "search",
        cards: [{ cardId: PICK }],
      });
      // Only the public reveal carries the identity; the hand move stays private.
      const drawn = view.eventLog.filter((e) => e.type === "CARD_DRAWN");
      expect(drawn.every((e) => e.payload.cardId === "hidden"), label).toBe(true);
    }
  });
});

// ─── Resume-handler contract for both search actions ───────────────────────

function makePlayer(deck: CardInstance[]): PlayerState {
  const leader: CardInstance = { ...deckCard("L", "leader-0"), zone: "LEADER" };
  return {
    playerId: "p0",
    leader,
    characters: [null, null, null, null, null],
    stage: null,
    hand: [],
    deck,
    life: [],
    donDeck: [],
    donCostArea: [],
    trash: [],
    removedFromGame: [],
    deckList: [],
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
    sleeveUrl: null,
    donArtUrl: null,
  };
}

function unitState(): GameState {
  const deck = ["A", "B", "C", "D"].map((id, i) => deckCard(id, `u${i}`));
  const p1 = makePlayer([]);
  return {
    id: "opt-835-unit",
    players: [makePlayer(deck), { ...p1, playerId: "p1" }],
    turn: { number: 1, activePlayerIndex: 0, phase: "MAIN", battleSubPhase: null, battle: null, oncePerTurnUsed: {}, actionsPerformedThisTurn: [], deckHitZeroThisTurn: [false, false] },
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    pregame: null,
    pendingPrompt: null,
    effectStack: [],
    eventLog: [],
    status: "IN_PROGRESS",
    winner: null,
  } as unknown as GameState;
}

const arrange: GameAction = {
  type: "ARRANGE_TOP_CARDS",
  keptCardInstanceId: "u0",
  keptCardInstanceIds: ["u0"],
  orderedInstanceIds: ["u1", "u2"],
  destination: "bottom",
};

function revealVisibility(events: PendingEvent[]) {
  return events
    .filter((e) => e.type === "CARDS_REVEALED")
    .map((e) => (e.payload as { visibility: string; visibleTo?: number }));
}

describe("OPT-835: search reveal param contract", () => {
  it.each([
    [undefined, { visibility: "BOTH" }],
    [true, { visibility: "BOTH" }],
    [false, { visibility: "CONTROLLER_ONLY", visibleTo: 0 }],
  ] as const)("SEARCH_DECK reveal=%s", (reveal, expected) => {
    const events: PendingEvent[] = [];
    const paused = {
      type: "SEARCH_DECK",
      params: { look_at: 3, pick: { up_to: 1 }, rest_destination: "BOTTOM", ...(reveal === undefined ? {} : { reveal }) },
    } as Action;
    const next = handleArrangeSearchDeck(unitState(), arrange, paused, 0, ["u0", "u1", "u2"], events);
    expect(next!.players[0].hand.map((c) => c.cardId)).toEqual(["A"]);
    const vis = revealVisibility(events);
    expect(vis).toHaveLength(1);
    expect(vis[0]).toEqual(expect.objectContaining(expected));
    if (reveal !== false) expect(vis[0]).not.toHaveProperty("visibleTo");
  });

  it.each([
    [undefined, { visibility: "BOTH" }],
    [false, { visibility: "CONTROLLER_ONLY", visibleTo: 0 }],
  ] as const)("SEARCH_TRASH_THE_REST reveal=%s", (reveal, expected) => {
    const events: PendingEvent[] = [];
    const paused = {
      type: "SEARCH_TRASH_THE_REST",
      params: { look_at: 3, pick: { up_to: 1 }, ...(reveal === undefined ? {} : { reveal }) },
    } as Action;
    const next = handleArrangeSearchTrashTheRest(unitState(), arrange, paused, 0, ["u0", "u1", "u2"], events);
    expect(next!.players[0].hand.map((c) => c.cardId)).toEqual(["A"]);
    const vis = revealVisibility(events);
    expect(vis).toHaveLength(1);
    expect(vis[0]).toEqual(expect.objectContaining(expected));
  });
});

// ─── Authored inventory ratchet ────────────────────────────────────────────

type SearchUse = { cardId: string; type: string; reveal: unknown };

function collectSearchUses(node: unknown, cardId: string, out: SearchUse[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectSearchUses(item, cardId, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (
    (record.type === "SEARCH_DECK" || record.type === "SEARCH_TRASH_THE_REST") &&
    record.params && typeof record.params === "object"
  ) {
    out.push({ cardId, type: record.type, reveal: (record.params as Record<string, unknown>).reveal });
  }
  for (const value of Object.values(record)) collectSearchUses(value, cardId, out);
}

function printedText(cardId: string): string {
  const set = cardId.split("-")[0].replace(/^([A-Z]+)(\d+)$/, "$1-$2");
  const doc = readFileSync(resolve(__dirname, `../../../../docs/cards/${set}.md`), "utf8");
  const start = doc.indexOf(`**${cardId}**`);
  expect(start, `${cardId} missing from docs/cards/${set}.md`).toBeGreaterThanOrEqual(0);
  const end = doc.indexOf("\n---", start);
  return doc.slice(start, end === -1 ? undefined : end);
}

describe("OPT-835: authored search reveal inventory", () => {
  const uses: SearchUse[] = [];
  for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) {
    collectSearchUses(schema.effects, cardId, uses);
  }

  it("only uses a boolean reveal param", () => {
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) {
      expect(["undefined", "boolean"], `${use.cardId} ${use.type}`).toContain(typeof use.reveal);
    }
  });

  it("marks only FAQ-backed secret searches as unrevealed, and their text never says reveal", () => {
    const secret = uses.filter((use) => use.reveal === false);
    // FAQ-derived: `grep -rniE "do not reveal|not revealed|without revealing"
    // docs/FAQs/*.md` finds exactly these search rulings. Adding a card here
    // requires a card/FAQ citation overriding rule 11-2-1.
    const FAQ_UNREVEALED_SEARCHES: Record<string, string> = {
      // docs/FAQs/qa_op12.md: "Do I reveal the card I add to my hand using
      // this [Main] effect to my opponent? — No, you do not reveal it."
      "OP12-079": "qa_op12",
      // docs/FAQs/qa_op16.md: "No, you add it to your Life cards without
      // revealing it to your opponent."
      "OP16-119": "qa_op16",
    };
    expect(secret.map((use) => use.cardId).sort()).toEqual(Object.keys(FAQ_UNREVEALED_SEARCHES).sort());
    for (const use of secret) {
      expect(printedText(use.cardId), use.cardId).not.toMatch(/reveal/i);
    }
  });
});
