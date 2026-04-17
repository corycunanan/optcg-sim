/**
 * OPT-227 — Leader "treated as all names/types/attributes" blanket.
 *
 * OP-15 Enel-archetype Leaders carry effect text like:
 *   "This Leader is treated as a card with all card names, types,
 *    and attributes."
 *
 * Per Bandai FAQ rulings (docs/FAQs/qa_rules.md §248–§262) the blanket
 * is omnidirectional — satisfied in BOTH directions:
 *   - Positive filters ({ name }, { traits }, { attribute }) → match.
 *   - Negative filters (exclude_name, traits_exclude, attribute_not)
 *     → exclude (defender protections like "cannot be K.O.'d by Slash"
 *     still apply when the blanket Leader attacks).
 *
 * This suite covers the four evaluator entry points wired in
 * conditions.ts: matchesFilter (positive + negative branches of trait /
 * name / attribute), LEADER_PROPERTY, MULTIPLE_NAMED_CARDS, and
 * NAMED_CARD_WITH_PROPERTY.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState, KeywordSet } from "../types.js";
import type { TreatedAsAllIdentities } from "../engine/effect-types.js";
import { matchesFilter, evaluateCondition } from "../engine/conditions.js";

// ─── Card + state factories ──────────────────────────────────────────────────

function noKeywords(): KeywordSet {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Yellow"],
    cost: 4,
    power: 5000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

/** Build a card whose effectSchema carries a TREATED_AS_ALL_IDENTITIES mod. */
function withBlanket(
  base: CardData,
  kinds: Partial<Pick<TreatedAsAllIdentities, "names" | "types" | "attributes">>,
): CardData {
  return {
    ...base,
    effectSchema: {
      card_id: base.id,
      rule_modifications: [
        { rule_type: "TREATED_AS_ALL_IDENTITIES", ...kinds },
      ],
      effects: [],
    },
  };
}

function makeInstance(cardId: string, instanceId: string, zone: "LEADER" | "CHARACTER", owner: 0 | 1): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: zone === "LEADER" ? null : 1,
    controller: owner,
    owner,
  };
}

function emptyPlayer(playerId: string, leader: CardInstance): PlayerState {
  return {
    playerId,
    leader,
    characters: [null, null, null, null, null],
    stage: null,
    hand: [],
    deck: [],
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

function makeState(p0: PlayerState, p1: PlayerState): GameState {
  return {
    id: "g",
    players: [p0, p1],
    turn: { number: 1, activePlayerIndex: 0, phase: "MAIN", battleSubPhase: null, battle: null, oncePerTurnUsed: {}, actionsPerformedThisTurn: [] },
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    pendingPrompt: null,
    effectStack: [],
    eventLog: [],
    status: "IN_PROGRESS",
    winner: null,
    winReason: null,
  };
}

/** Dummy state for matchesFilter calls — none of these tests exercise
 *  dynamic numeric filters that read from state, so a bare skeleton is fine. */
function dummyState(leaderId: string): GameState {
  const leader = makeInstance(leaderId, "DUMMY-L", "LEADER", 0);
  return makeState(emptyPlayer("p0", leader), emptyPlayer("p1", leader));
}

// ─── matchesFilter: positive identity checks ─────────────────────────────────

describe("OPT-227: matchesFilter positive identity branches", () => {
  it("matches { name } against a blanket-names card", () => {
    const base = makeCard("OP15-BLANKET", { name: "Enel" });
    const data = withBlanket(base, { names: true });
    const db = new Map([[data.id, data]]);
    const inst = makeInstance(data.id, "i1", "CHARACTER", 0);
    const state = dummyState(data.id);

    // Filter requires name "Luffy" — blanket says Enel is also "Luffy".
    expect(matchesFilter(inst, { name: "Luffy" }, db, state)).toBe(true);
  });

  it("matches { name_any_of } against a blanket-names card", () => {
    const data = withBlanket(makeCard("OP15-BLANKET", { name: "Enel" }), { names: true });
    const db = new Map([[data.id, data]]);
    const inst = makeInstance(data.id, "i1", "CHARACTER", 0);
    const state = dummyState(data.id);
    expect(matchesFilter(inst, { name_any_of: ["Luffy", "Kid"] }, db, state)).toBe(true);
  });

  it("matches { traits } against a blanket-types card", () => {
    const data = withBlanket(makeCard("OP15-BLANKET", { types: [] }), { types: true });
    const db = new Map([[data.id, data]]);
    const inst = makeInstance(data.id, "i1", "CHARACTER", 0);
    const state = dummyState(data.id);
    expect(matchesFilter(inst, { traits: ["Wano"] }, db, state)).toBe(true);
  });

  it("matches { attribute } against a blanket-attributes card", () => {
    const data = withBlanket(makeCard("OP15-BLANKET", { attribute: [] }), { attributes: true });
    const db = new Map([[data.id, data]]);
    const inst = makeInstance(data.id, "i1", "CHARACTER", 0);
    const state = dummyState(data.id);
    expect(matchesFilter(inst, { attribute: "SLASH" }, db, state)).toBe(true);
  });

  it("does NOT match { traits } when the blanket only covers names", () => {
    const data = withBlanket(makeCard("OP15-BLANKET", { types: [] }), { names: true });
    const db = new Map([[data.id, data]]);
    const inst = makeInstance(data.id, "i1", "CHARACTER", 0);
    const state = dummyState(data.id);
    // names-only blanket must NOT leak into trait matching.
    expect(matchesFilter(inst, { traits: ["Wano"] }, db, state)).toBe(false);
  });
});

// ─── matchesFilter: negative identity checks (FAQ asymmetry/protections) ─────

describe("OPT-227: matchesFilter negative identity branches", () => {
  it("exclude_name catches a blanket-names card (attacker treated as every name)", () => {
    const data = withBlanket(makeCard("OP15-BLANKET", { name: "Enel" }), { names: true });
    const db = new Map([[data.id, data]]);
    const inst = makeInstance(data.id, "i1", "CHARACTER", 0);
    const state = dummyState(data.id);
    // A defender's "cannot be K.O.'d by [any card named Luffy]" would use
    // exclude_name: "Luffy" on its protection filter. The blanket attacker
    // counts as Luffy → protection applies → card is excluded.
    expect(matchesFilter(inst, { exclude_name: "Luffy" }, db, state)).toBe(false);
  });

  it("traits_exclude catches a blanket-types card", () => {
    const data = withBlanket(makeCard("OP15-BLANKET", { types: [] }), { types: true });
    const db = new Map([[data.id, data]]);
    const inst = makeInstance(data.id, "i1", "CHARACTER", 0);
    const state = dummyState(data.id);
    expect(matchesFilter(inst, { traits_exclude: ["Wano"] }, db, state)).toBe(false);
  });

  it("attribute_not catches a blanket-attributes card (cannot be K.O.'d by Slash)", () => {
    const data = withBlanket(makeCard("OP15-BLANKET", { attribute: [] }), { attributes: true });
    const db = new Map([[data.id, data]]);
    const inst = makeInstance(data.id, "i1", "CHARACTER", 0);
    const state = dummyState(data.id);
    expect(matchesFilter(inst, { attribute_not: "SLASH" }, db, state)).toBe(false);
  });
});

// ─── LEADER_PROPERTY ─────────────────────────────────────────────────────────

describe("OPT-227: LEADER_PROPERTY recognises blanket Leaders", () => {
  it("trait check passes when Leader carries blanket types", () => {
    const leaderData = withBlanket(
      makeCard("OP15-LEADER", { type: "Leader", cost: null, power: 5000, life: 5, types: [] }),
      { types: true },
    );
    const otherLeader = makeCard("OPP-LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const db = new Map<string, CardData>([
      [leaderData.id, leaderData],
      [otherLeader.id, otherLeader],
    ]);
    const p0 = emptyPlayer("p0", makeInstance(leaderData.id, "L0", "LEADER", 0));
    const p1 = emptyPlayer("p1", makeInstance(otherLeader.id, "L1", "LEADER", 1));
    const state = makeState(p0, p1);

    const cond = {
      type: "LEADER_PROPERTY" as const,
      controller: "SELF" as const,
      property: { trait: "Wano" } as const,
    };
    expect(evaluateCondition(state, cond, { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(true);
  });

  it("attribute check passes when Leader carries blanket attributes", () => {
    const leaderData = withBlanket(
      makeCard("OP15-LEADER", { type: "Leader", cost: null, power: 5000, life: 5, attribute: [] }),
      { attributes: true },
    );
    const otherLeader = makeCard("OPP-LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const db = new Map<string, CardData>([
      [leaderData.id, leaderData],
      [otherLeader.id, otherLeader],
    ]);
    const p0 = emptyPlayer("p0", makeInstance(leaderData.id, "L0", "LEADER", 0));
    const p1 = emptyPlayer("p1", makeInstance(otherLeader.id, "L1", "LEADER", 1));
    const state = makeState(p0, p1);

    const cond = {
      type: "LEADER_PROPERTY" as const,
      controller: "SELF" as const,
      property: { attribute: "SLASH" } as const,
    };
    expect(evaluateCondition(state, cond, { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(true);
  });

  it("name check passes when Leader carries blanket names", () => {
    const leaderData = withBlanket(
      makeCard("OP15-LEADER", { type: "Leader", cost: null, power: 5000, life: 5, name: "Enel" }),
      { names: true },
    );
    const otherLeader = makeCard("OPP-LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const db = new Map<string, CardData>([
      [leaderData.id, leaderData],
      [otherLeader.id, otherLeader],
    ]);
    const p0 = emptyPlayer("p0", makeInstance(leaderData.id, "L0", "LEADER", 0));
    const p1 = emptyPlayer("p1", makeInstance(otherLeader.id, "L1", "LEADER", 1));
    const state = makeState(p0, p1);

    const cond = {
      type: "LEADER_PROPERTY" as const,
      controller: "SELF" as const,
      property: { name: "Monkey D. Luffy" } as const,
    };
    expect(evaluateCondition(state, cond, { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(true);
  });

  it("trait check FAILS when blanket covers only names (no leak)", () => {
    const leaderData = withBlanket(
      makeCard("OP15-LEADER", { type: "Leader", cost: null, power: 5000, life: 5, types: [] }),
      { names: true },
    );
    const otherLeader = makeCard("OPP-LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const db = new Map<string, CardData>([
      [leaderData.id, leaderData],
      [otherLeader.id, otherLeader],
    ]);
    const p0 = emptyPlayer("p0", makeInstance(leaderData.id, "L0", "LEADER", 0));
    const p1 = emptyPlayer("p1", makeInstance(otherLeader.id, "L1", "LEADER", 1));
    const state = makeState(p0, p1);

    const cond = {
      type: "LEADER_PROPERTY" as const,
      controller: "SELF" as const,
      property: { trait: "Wano" } as const,
    };
    expect(evaluateCondition(state, cond, { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(false);
  });
});

// ─── MULTIPLE_NAMED_CARDS ────────────────────────────────────────────────────

describe("OPT-227: MULTIPLE_NAMED_CARDS accepts blanket field cards", () => {
  it("field card with blanket-names satisfies a required name", () => {
    const leader = makeCard("LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const blanket = withBlanket(makeCard("OP15-FIELD", { name: "Enel" }), { names: true });
    const db = new Map<string, CardData>([[leader.id, leader], [blanket.id, blanket]]);

    const p0 = emptyPlayer("p0", makeInstance(leader.id, "L0", "LEADER", 0));
    p0.characters[0] = makeInstance(blanket.id, "B0", "CHARACTER", 0);
    const p1 = emptyPlayer("p1", makeInstance(leader.id, "L1", "LEADER", 1));
    const state = makeState(p0, p1);

    const cond = {
      type: "MULTIPLE_NAMED_CARDS" as const,
      controller: "SELF" as const,
      names: ["Luffy"],
    };
    expect(evaluateCondition(state, cond, { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(true);
  });
});

// ─── NAMED_CARD_WITH_PROPERTY ────────────────────────────────────────────────

describe("OPT-227: NAMED_CARD_WITH_PROPERTY matches blanket by name", () => {
  it("a blanket-names field card counts as the requested name for property check", () => {
    const leader = makeCard("LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const blanket = withBlanket(
      makeCard("OP15-FIELD", { name: "Enel", power: 6000 }),
      { names: true },
    );
    const db = new Map<string, CardData>([[leader.id, leader], [blanket.id, blanket]]);

    const p0 = emptyPlayer("p0", makeInstance(leader.id, "L0", "LEADER", 0));
    p0.characters[0] = makeInstance(blanket.id, "B0", "CHARACTER", 0);
    const p1 = emptyPlayer("p1", makeInstance(leader.id, "L1", "LEADER", 1));
    const state = makeState(p0, p1);

    const cond = {
      type: "NAMED_CARD_WITH_PROPERTY" as const,
      controller: "SELF" as const,
      name: "Kung Fu Jugon",
      property: { power: { operator: ">=" as const, value: 5000 } },
    };
    expect(evaluateCondition(state, cond, { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(true);
  });

  it("name mismatch is unchanged when no blanket is set", () => {
    const leader = makeCard("LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const plain = makeCard("PLAIN", { name: "Other", power: 6000 });
    const db = new Map<string, CardData>([[leader.id, leader], [plain.id, plain]]);

    const p0 = emptyPlayer("p0", makeInstance(leader.id, "L0", "LEADER", 0));
    p0.characters[0] = makeInstance(plain.id, "X0", "CHARACTER", 0);
    const p1 = emptyPlayer("p1", makeInstance(leader.id, "L1", "LEADER", 1));
    const state = makeState(p0, p1);

    const cond = {
      type: "NAMED_CARD_WITH_PROPERTY" as const,
      controller: "SELF" as const,
      name: "Kung Fu Jugon",
      property: { power: { operator: ">=" as const, value: 5000 } },
    };
    expect(evaluateCondition(state, cond, { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(false);
  });
});
