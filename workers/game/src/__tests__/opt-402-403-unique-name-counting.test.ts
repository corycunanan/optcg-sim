/**
 * OPT-402 / OPT-403 — unique-card-name counting.
 *
 * OP16-034 Monkey.D.Luffy: "+1000 power for each of your Characters with a
 * different card name" → PER_COUNT MATCHING_CHARACTERS_ON_FIELD must apply
 * its filter and count distinct names when filter.unique_names is set.
 *
 * OP16-038 Let's Go!! To the Navy Headquarters!!: "If you have 5 {Impel Down}
 * type Characters with different card names" → CARD_ON_FIELD must dedupe
 * matches by card name when filter.unique_names is set.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState, KeywordSet } from "../types.js";
import { evaluateCondition } from "../engine/conditions.js";
import { resolveAmount } from "../engine/effect-resolver/action-utils.js";

function noKeywords(): KeywordSet {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Green"],
    cost: 3,
    power: 4000,
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

/** Board: Luffy, Luffy, Buggy, Ivankov (Impel Down) + Zoro (non-Impel Down). */
function buildBoard() {
  const luffy = makeCard("GRN-LUFFY", { name: "Monkey.D.Luffy", types: ["Impel Down"] });
  const buggy = makeCard("GRN-BUGGY", { name: "Buggy", types: ["Impel Down"] });
  const ivankov = makeCard("GRN-IVANKOV", { name: "Emporio.Ivankov", types: ["Impel Down"] });
  const zoro = makeCard("GRN-ZORO", { name: "Roronoa Zoro", types: ["Straw Hat Crew"] });
  const leaderData = makeCard("GRN-LEADER", { type: "Leader", cost: null, life: 5 });
  const oppLeaderData = makeCard("OPP-LEADER", { type: "Leader", cost: null, life: 5 });

  const db = new Map<string, CardData>(
    [luffy, buggy, ivankov, zoro, leaderData, oppLeaderData].map((c) => [c.id, c]),
  );

  const p0 = emptyPlayer("p0", makeInstance(leaderData.id, "L0", "LEADER", 0));
  p0.characters = [
    makeInstance(luffy.id, "c1", "CHARACTER", 0),
    makeInstance(luffy.id, "c2", "CHARACTER", 0),
    makeInstance(buggy.id, "c3", "CHARACTER", 0),
    makeInstance(ivankov.id, "c4", "CHARACTER", 0),
    makeInstance(zoro.id, "c5", "CHARACTER", 0),
  ];
  const p1 = emptyPlayer("p1", makeInstance(oppLeaderData.id, "L1", "LEADER", 1));
  return { db, state: makeState(p0, p1) };
}

describe("OPT-403: CARD_ON_FIELD unique_names counting (OP16-038)", () => {
  it("counts distinct card names, not instances", () => {
    const { db, state } = buildBoard();
    // 4 Impel Down instances but only 3 distinct names.
    const cond = {
      type: "CARD_ON_FIELD" as const,
      controller: "SELF" as const,
      filter: { traits: ["Impel Down"], unique_names: true },
      count: { operator: ">=" as const, value: 4 },
    };
    expect(evaluateCondition(state, cond, { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(false);

    const cond3 = { ...cond, count: { operator: ">=" as const, value: 3 } };
    expect(evaluateCondition(state, cond3, { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(true);
  });

  it("still counts instances without unique_names", () => {
    const { db, state } = buildBoard();
    const cond = {
      type: "CARD_ON_FIELD" as const,
      controller: "SELF" as const,
      filter: { traits: ["Impel Down"] },
      count: { operator: ">=" as const, value: 4 },
    };
    expect(evaluateCondition(state, cond, { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(true);
  });
});

describe("OPT-402: PER_COUNT MATCHING_CHARACTERS_ON_FIELD filter + unique_names (OP16-034)", () => {
  const refs = new Map();

  it("applies the filter when counting", () => {
    const { db, state } = buildBoard();
    const amount = {
      type: "PER_COUNT" as const,
      source: "MATCHING_CHARACTERS_ON_FIELD" as const,
      multiplier: 1,
      filter: { traits: ["Impel Down"] },
    };
    expect(resolveAmount(amount, refs, state, 0, db)).toBe(4);
  });

  it("counts distinct names with filter.unique_names", () => {
    const { db, state } = buildBoard();
    // OP16-034: all 5 characters, 4 distinct names, ×1000 power.
    const amount = {
      type: "PER_COUNT" as const,
      source: "MATCHING_CHARACTERS_ON_FIELD" as const,
      multiplier: 1000,
      filter: { unique_names: true },
    };
    expect(resolveAmount(amount, refs, state, 0, db)).toBe(4000);
  });

  it("remains unfiltered when no filter is provided (legacy schemas)", () => {
    const { db, state } = buildBoard();
    const amount = {
      type: "PER_COUNT" as const,
      source: "MATCHING_CHARACTERS_ON_FIELD" as const,
      multiplier: 1,
    };
    expect(resolveAmount(amount, refs, state, 0, db)).toBe(5);
  });
});
