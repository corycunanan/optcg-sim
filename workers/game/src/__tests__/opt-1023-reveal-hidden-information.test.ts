/**
 * OPT-1023 (Engine PR 9): reveal and hidden information.
 *
 * OPT-999 — OP10-058 Rebecca (docs/cards/OP-10.md): "[On Play] If there is a
 * Character with a cost of 8 or more, draw 1 card. Then, reveal up to 2
 * {Dressrosa} type Character cards with a cost of 7 or less other than
 * [Rebecca] from your hand. Play 1 of the revealed cards and play the other
 * card rested if it has a cost of 4 or less."
 * FAQ (docs/FAQs/qa_op10.md): revealing only one cost-4 card plays it active.
 *
 * OPT-916 — "Reveal 1 card from the top of your deck and play up to 1 …"
 * (ST12-010 and six siblings): the revealed card is public whether or not it
 * is played; a "look at" search stays private (rule 11-3-1).
 *
 * Everything drives the real pipeline with the registered authored schemas
 * and inspects the client-bound projections.
 */

import { describe, expect, it } from "vitest";
import type { ActionOf } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameAction, GameEvent, GameState } from "../types.js";
import { getAllAuthoredSchemas, getEffectSchema, validateEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { executeSearchAndPlay } from "../engine/effect-resolver/actions/hand-deck.js";
import { visibleStateForPlayer, visibleStateForSpectator } from "../session/visibility.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { findSearchAndPlayRevealIntentViolations } from "../engine/schema-search-reveal-lint.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function card(cardId: string, instanceId: string, zone: CardInstance["zone"]): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
}

function registerAuthored(db: Map<string, CardData>, cardId: string): void {
  const schema = getEffectSchema(cardId);
  if (!schema) throw new Error(`${cardId} schema not registered`);
  db.set(cardId, {
    ...CARDS.VANILLA,
    id: cardId,
    name: schema.card_name ?? cardId,
    cost: 1,
    effectSchema: schema,
  });
}

function play(state: GameState, db: Map<string, CardData>, instanceId: string): GameState {
  const r = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: instanceId }, db, 0);
  expect(r.valid, r.error).toBe(true);
  return r.state;
}

function respond(
  state: GameState,
  db: Map<string, CardData>,
  action: GameAction,
): { state: GameState; rejected: boolean } {
  const r = resumePromptLifecycle(state, action, db, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => s,
  });
  return { state: r.state, rejected: r.responseRejected };
}

function reload(state: GameState): GameState {
  return convertPersistedGameState(
    JSON.parse(JSON.stringify(toPersistedGameState(state))),
    "test reload",
  );
}

function reveals(state: GameState): Extract<GameEvent, { type: "CARDS_REVEALED" }>[] {
  return state.eventLog.filter(
    (e): e is Extract<GameEvent, { type: "CARDS_REVEALED" }> => e.type === "CARDS_REVEALED",
  );
}

// ─── OPT-999: OP10-058 Rebecca ─────────────────────────────────────────────

const REBECCA = "OP10-058";
const BIG = "OPT999-DRESSROSA-5";
const SMALL = "OPT999-DRESSROSA-3";
const FOUR = "OPT999-DRESSROSA-4";
const OTHER = "OPT999-NOT-DRESSROSA";
const DECK_TOP = "OPT999-DECK-TOP";
const EIGHT = "OPT999-COST-8";

// Rebecca's "Then, reveal…" follows "If there is a Character with a cost of
// 8 or more, draw 1 card." (rule 4-10-1, OPT-970), so the default setup puts
// a cost-8 Character on the opponent's field and the reveal tests expect
// Rebecca's draw of DECK_TOP first.
function rebeccaSetup(hand: [string, string][], { costEight = true } = {}) {
  const db = createTestCardDb();
  registerAuthored(db, REBECCA);
  const dressrosa = (id: string, cost: number) =>
    db.set(id, { ...CARDS.VANILLA, id, name: id, cost, types: ["Dressrosa"] });
  dressrosa(BIG, 5);
  dressrosa(SMALL, 3);
  dressrosa(FOUR, 4);
  db.set(OTHER, { ...CARDS.VANILLA, id: OTHER, name: OTHER, cost: 2, types: ["Navy"] });
  db.set(DECK_TOP, { ...CARDS.VANILLA, id: DECK_TOP, name: DECK_TOP, cost: 2 });
  db.set(EIGHT, { ...CARDS.VANILLA, id: EIGHT, name: EIGHT, cost: 8 });

  const state = createBattleReadyState(db);
  for (const p of state.players) {
    p.characters = padChars([]);
    p.hand = [];
  }
  if (costEight) {
    state.players[1].characters = padChars([
      { ...card(EIGHT, "opp-eight", "CHARACTER"), controller: 1, owner: 1 },
    ]);
  }
  state.players[0].hand = [
    card(REBECCA, "rebecca", "HAND"),
    ...hand.map(([cardId, instanceId]) => card(cardId, instanceId, "HAND")),
  ];
  state.players[0].deck = [
    card(DECK_TOP, "deck-top", "DECK"),
    ...state.players[0].deck.slice(0, 5),
  ];
  state.eventLog = [];
  return { db, state };
}

function revealPrompt(state: GameState) {
  const prompt = state.pendingPrompt?.options;
  if (prompt?.promptType !== "SELECT_TARGET") throw new Error("expected Rebecca's reveal selection");
  return prompt;
}

function fieldCardIds(state: GameState): { cardId: string; state: string }[] {
  return state.players[0].characters
    .filter((c): c is CardInstance => c !== null)
    .filter((c) => c.cardId !== REBECCA)
    .map((c) => ({ cardId: c.cardId, state: c.state }));
}

describe("OPT-999: OP10-058 Rebecca reveals chosen hand cards", () => {
  it("offers only eligible hand cards, up to 2, and reads the deck only for the draw", () => {
    const { db, state } = rebeccaSetup([[BIG, "big"], [SMALL, "small"], [OTHER, "other"]]);
    const deckBefore = state.players[0].deck.map((c) => c.instanceId);
    const afterPlay = play(state, db, "rebecca");
    const prompt = revealPrompt(afterPlay);
    expect([...prompt.validTargets].sort()).toEqual(["big", "small"]);
    expect(prompt.countMin).toBe(0);
    expect(prompt.countMax).toBe(2);
    expect(afterPlay.players[0].deck.map((c) => c.instanceId)).toEqual(deckBefore.slice(1));
    expect(reveals(afterPlay)).toHaveLength(0);
  });

  it("reveals both picks publicly, plays the chosen one active and the cost-4-or-less other rested", () => {
    const { db, state } = rebeccaSetup([[BIG, "big"], [SMALL, "small"], [OTHER, "other"]]);
    const deckBefore = state.players[0].deck.map((c) => c.instanceId);
    let next = play(state, db, "rebecca");
    let r = respond(next, db, { type: "SELECT_TARGET", selectedInstanceIds: ["big", "small"] });
    expect(r.rejected).toBe(false);
    next = r.state;

    // "Play 1 of the revealed cards": the player chooses which.
    const playPrompt = next.pendingPrompt?.options;
    if (playPrompt?.promptType !== "SELECT_TARGET") throw new Error("expected the play choice");
    expect([...playPrompt.validTargets].sort()).toEqual(["big", "small"]);
    r = respond(reload(next), db, { type: "SELECT_TARGET", selectedInstanceIds: ["big"] });
    expect(r.rejected).toBe(false);
    next = r.state;

    expect(next.pendingPrompt).toBeNull();
    expect(fieldCardIds(next)).toEqual([
      { cardId: BIG, state: "ACTIVE" },
      { cardId: SMALL, state: "RESTED" },
    ]);
    expect(next.players[0].hand.map((c) => c.cardId)).toEqual([OTHER, DECK_TOP]);
    expect(next.players[0].deck.map((c) => c.instanceId)).toEqual(deckBefore.slice(1));

    // Both picks are public through every projection, and the reveal
    // precedes both plays in the history.
    for (const view of [
      visibleStateForPlayer(next, db, 1),
      visibleStateForSpectator(next, db),
      visibleStateForPlayer(reload(next), db, 1),
    ]) {
      const [reveal] = reveals(view);
      expect(reveal?.payload).toEqual({
        visibility: "BOTH",
        source: "HAND",
        cards: [
          { instanceId: "big", cardId: BIG },
          { instanceId: "small", cardId: SMALL },
        ],
      });
      const order = view.eventLog
        .filter((e) => e.type === "CARDS_REVEALED" || (e.type === "CARD_PLAYED" && e.payload.cardId !== REBECCA))
        .map((e) => e.type);
      expect(order).toEqual(["CARDS_REVEALED", "CARD_PLAYED", "CARD_PLAYED"]);
    }
  });

  it("does not play the other card when it costs more than 4", () => {
    const { db, state } = rebeccaSetup([[BIG, "big"], [SMALL, "small"]]);
    let next = play(state, db, "rebecca");
    next = respond(next, db, { type: "SELECT_TARGET", selectedInstanceIds: ["big", "small"] }).state;
    next = respond(next, db, { type: "SELECT_TARGET", selectedInstanceIds: ["small"] }).state;
    expect(next.pendingPrompt).toBeNull();
    expect(fieldCardIds(next)).toEqual([{ cardId: SMALL, state: "ACTIVE" }]);
    expect(next.players[0].hand.map((c) => c.cardId)).toEqual([BIG, DECK_TOP]);
  });

  it("plays a single revealed cost-4 card active (qa_op10)", () => {
    const { db, state } = rebeccaSetup([[FOUR, "four"]]);
    let next = play(reload(state), db, "rebecca");
    const r = respond(reload(next), db, { type: "SELECT_TARGET", selectedInstanceIds: ["four"] });
    expect(r.rejected).toBe(false);
    next = r.state;
    expect(next.pendingPrompt).toBeNull();
    expect(fieldCardIds(next)).toEqual([{ cardId: FOUR, state: "ACTIVE" }]);
  });

  it("rejects an ineligible pick and keeps the selection pending", () => {
    const { db, state } = rebeccaSetup([[BIG, "big"], [OTHER, "other"]]);
    const afterPlay = play(state, db, "rebecca");
    const r = respond(reload(afterPlay), db, { type: "SELECT_TARGET", selectedInstanceIds: ["other"] });
    expect(r.rejected).toBe(true);
    expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(fieldCardIds(r.state)).toEqual([]);
    expect(reveals(r.state)).toHaveLength(0);
  });

  it("revealing nothing plays nothing and leaves the deck alone after the draw", () => {
    const { db, state } = rebeccaSetup([[BIG, "big"]]);
    const deckBefore = state.players[0].deck.map((c) => c.instanceId);
    const next = respond(play(state, db, "rebecca"), db, { type: "SELECT_TARGET", selectedInstanceIds: [] });
    expect(next.rejected).toBe(false);
    expect(next.state.pendingPrompt).toBeNull();
    expect(fieldCardIds(next.state)).toEqual([]);
    expect(reveals(next.state)).toHaveLength(0);
    expect(next.state.players[0].deck.map((c) => c.instanceId)).toEqual(deckBefore.slice(1));
  });

  it("without a cost-8 Character neither draws nor reveals (rule 4-10-1, OPT-970)", () => {
    const { db, state } = rebeccaSetup([[BIG, "big"], [SMALL, "small"]], { costEight: false });
    const deckBefore = state.players[0].deck.map((c) => c.instanceId);
    const next = play(state, db, "rebecca");
    expect(next.pendingPrompt).toBeNull();
    expect(fieldCardIds(next)).toEqual([]);
    expect(reveals(next)).toHaveLength(0);
    expect(next.players[0].hand.map((c) => c.instanceId)).toEqual(["big", "small"]);
    expect(next.players[0].deck.map((c) => c.instanceId)).toEqual(deckBefore);
  });

  it("is the only authored REVEAL with a hand target", () => {
    // Inventory for OPT-999: every other REVEAL reads the deck or Life top
    // from params (their CARD_ON_TOP_OF_DECK / LIFE_CARD targets only name
    // the owner).
    const handReveals: string[] = [];
    const visit = (node: unknown, cardId: string): void => {
      if (Array.isArray(node)) return node.forEach((child) => visit(child, cardId));
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record.type === "REVEAL" && (record.target as { type?: string } | undefined)?.type) {
        handReveals.push(`${cardId}:${(record.target as { type: string }).type}`);
      }
      Object.values(record).forEach((child) => visit(child, cardId));
    };
    for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) visit(schema.effects, cardId);
    expect(handReveals.filter((entry) => entry.endsWith(":CARD_IN_HAND"))).toEqual([`${REBECCA}:CARD_IN_HAND`]);
    expect(
      handReveals.filter((entry) => !/:(CARD_IN_HAND|CARD_ON_TOP_OF_DECK|LIFE_CARD)$/.test(entry)),
    ).toEqual([]);
  });
});

// ─── OPT-916: "reveal 1 card from the top of your deck, play up to 1" ───────

const IVANKOV = "ST12-010";
const TOP = "OPT916-TOP";

function ivankovSetup(topCost: number) {
  const db = createTestCardDb();
  registerAuthored(db, IVANKOV);
  db.set(TOP, { ...CARDS.VANILLA, id: TOP, name: TOP, cost: topCost });
  const state = createBattleReadyState(db);
  for (const p of state.players) {
    p.characters = padChars([]);
    p.hand = [];
  }
  state.players[0].hand = [card(IVANKOV, "ivankov", "HAND")];
  state.players[0].deck = [card(TOP, "opt916-top", "DECK"), ...state.players[0].deck.slice(0, 3)];
  state.eventLog = [];
  return { db, state };
}

describe("OPT-916: SEARCH_AND_PLAY reveal is public", () => {
  it.each([
    ["played", 2],
    ["not playable", 5],
  ] as const)("shows the revealed top card to the opponent and spectators when %s", (_label, cost) => {
    const { db, state } = ivankovSetup(cost);
    const afterPlay = play(state, db, "ivankov");
    expect(afterPlay.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    // While the controller arranges, the opponent sees no identity yet.
    expect(JSON.stringify(visibleStateForPlayer(afterPlay, db, 1).pendingPrompt)).not.toContain(TOP);

    const kept = cost === 2 ? ["opt916-top"] : [];
    const r = respond(afterPlay, db, {
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: kept[0] ?? "",
      keptCardInstanceIds: kept,
      orderedInstanceIds: kept.length ? [] : ["opt916-top"],
      destination: "bottom",
    });
    expect(r.rejected).toBe(false);
    const placed = r.state.players[0];
    if (cost === 2) {
      expect(placed.characters.some((c) => c?.cardId === TOP)).toBe(true);
    } else {
      expect(placed.deck.at(-1)?.cardId).toBe(TOP);
    }
    for (const view of [
      visibleStateForPlayer(r.state, db, 1),
      visibleStateForSpectator(r.state, db),
      visibleStateForPlayer(reload(r.state), db, 1),
    ]) {
      expect(reveals(view).map((e) => e.payload)).toEqual([
        { cards: [{ instanceId: "opt916-top", cardId: TOP }], source: "DECK_TOP", visibility: "BOTH" },
      ]);
    }
  });

  it("keeps a \"look at\" search private", () => {
    const { db, state } = ivankovSetup(2);
    const action = {
      type: "SEARCH_AND_PLAY",
      params: { look_at: 3, filter: { card_type: "CHARACTER" }, rest_destination: "BOTTOM" },
    } as ActionOf<"SEARCH_AND_PLAY">;
    const result = executeSearchAndPlay(state, action, "ivankov", 0, db, new Map());
    expect(result.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(result.events.filter((e) => e.type === "CARDS_REVEALED")).toEqual([]);
  });

  it("marks exactly the seven printed-reveal cards", () => {
    const revealed: string[] = [];
    const visit = (node: unknown, cardId: string): void => {
      if (Array.isArray(node)) return node.forEach((child) => visit(child, cardId));
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record.type === "SEARCH_AND_PLAY" && (record.params as { reveal?: unknown })?.reveal === true) {
        revealed.push(cardId);
      }
      Object.values(record).forEach((child) => visit(child, cardId));
    };
    for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) visit(schema.effects, cardId);
    expect(revealed.sort()).toEqual(
      ["OP06-057", "OP06-119", "OP08-052", "OP08-054", "ST12-010", "ST12-013", "ST12-017"],
    );
  });

  it("lints reveal against the printed verb", () => {
    const sap = (reveal?: boolean) => ({
      card_id: "X",
      effects: [{
        id: "e",
        category: "auto" as const,
        trigger: { keyword: "ON_PLAY" as const },
        actions: [{ type: "SEARCH_AND_PLAY" as const, params: { look_at: 1, ...(reveal ? { reveal } : {}) } }],
      }],
    });
    const revealText = [{ cardId: "X", text: "[On Play] Reveal 1 card from the top of your deck and play up to 1 Character card." }];
    const lookText = [{ cardId: "X", text: "[On Play] Look at 5 cards from the top of your deck and play up to 1 Character card." }];
    expect(findSearchAndPlayRevealIntentViolations(revealText, { X: sap() })).toHaveLength(1);
    expect(findSearchAndPlayRevealIntentViolations(revealText, { X: sap(true) })).toEqual([]);
    expect(findSearchAndPlayRevealIntentViolations(lookText, { X: sap(true) })).toHaveLength(1);
    expect(findSearchAndPlayRevealIntentViolations(lookText, { X: sap() })).toEqual([]);
  });
});

describe("OPT-999: REVEAL hand target is own-hand only", () => {
  it("rejects an opponent-hand REVEAL target in schema validation", () => {
    const schema = {
      card_id: "X",
      effects: [{
        id: "e",
        category: "auto" as const,
        trigger: { keyword: "ON_PLAY" as const },
        actions: [{
          type: "REVEAL" as const,
          target: { type: "CARD_IN_HAND" as const, controller: "OPPONENT" as const, count: { up_to: 1 } },
        }],
      }],
    };
    expect(validateEffectSchema(schema, "X").join("\n")).toMatch(/use REVEAL_HAND/);
  });
});
