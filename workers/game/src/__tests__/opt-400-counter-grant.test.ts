/**
 * OPT-400 — COUNTER_GRANT rule modification enforcement.
 *
 * EB01-001 Kouzuki Oden: "All of your {Land of Wano} type Character cards
 * without a Counter have a +1000 Counter, according to the rules."
 * OP16-118 Portgas.D.Ace: "The counter of all of your Character cards with
 * 8000 power in your hand becomes +2000."
 *
 * getEffectiveCounterValue applies grants from friendly on-field sources;
 * validateUseCounter and executeUseCounter read it instead of the printed
 * counter.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState, KeywordSet } from "../types.js";
import { getEffectiveCounterValue } from "../engine/counter-value.js";
import { validate } from "../engine/validation.js";

function noKeywords(): KeywordSet {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
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

function makeInstance(cardId: string, instanceId: string, zone: CardInstance["zone"], owner: 0 | 1): CardInstance {
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

/** EB01-001-style leader granting +1000 to counterless Land of Wano characters. */
const odenLeader = makeCard("EB01-001", {
  type: "Leader",
  cost: null,
  life: 5,
  effectSchema: {
    card_id: "EB01-001",
    effects: [
      {
        id: "counter_grant_rule",
        category: "rule_modification",
        rule: {
          rule_type: "COUNTER_GRANT",
          value: 1000,
          filter: { traits: ["Land of Wano"], card_type: "CHARACTER", has_counter: false },
        },
      },
    ],
  },
} as Partial<CardData>);

/** OP16-118-style on-field character: 8000-power hand cards' counter becomes +2000. */
const aceCharacter = makeCard("OP16-118", {
  power: 7000,
  effectSchema: {
    card_id: "OP16-118",
    effects: [
      {
        id: "counter_becomes_2000",
        category: "rule_modification",
        rule: {
          rule_type: "COUNTER_GRANT",
          value: 2000,
          filter: { card_type: "CHARACTER", power_exact: 8000 },
        },
      },
    ],
  },
} as Partial<CardData>);

const wanoNoCounter = makeCard("WANO-BIG", { types: ["Land of Wano"], counter: null, power: 6000 });
const wanoWithCounter = makeCard("WANO-SMALL", { types: ["Land of Wano"], counter: 2000, power: 3000 });
const otherNoCounter = makeCard("OTHER", { types: ["Straw Hat Crew"], counter: null });
const bigAce = makeCard("BIG-ACE", { power: 8000, counter: null });
const oppLeaderData = makeCard("OPP-LEADER", { type: "Leader", cost: null, life: 5 });

function buildState(leaderData: CardData, fieldChar?: CardData) {
  const db = new Map<string, CardData>(
    [leaderData, aceCharacter, wanoNoCounter, wanoWithCounter, otherNoCounter, bigAce, oppLeaderData]
      .map((c) => [c.id, c]),
  );
  const p0 = emptyPlayer("p0", makeInstance(leaderData.id, "L0", "LEADER", 0));
  if (fieldChar) p0.characters[0] = makeInstance(fieldChar.id, "field1", "CHARACTER", 0);
  p0.hand = [
    makeInstance(wanoNoCounter.id, "h1", "HAND", 0),
    makeInstance(wanoWithCounter.id, "h2", "HAND", 0),
    makeInstance(otherNoCounter.id, "h3", "HAND", 0),
    makeInstance(bigAce.id, "h4", "HAND", 0),
  ];
  const p1 = emptyPlayer("p1", makeInstance(oppLeaderData.id, "L1", "LEADER", 1));
  const state = {
    id: "g",
    players: [p0, p1],
    turn: {
      number: 2,
      activePlayerIndex: 1,
      phase: "MAIN",
      battleSubPhase: "COUNTER_STEP",
      battle: {
        attackerInstanceId: "L1",
        targetInstanceId: "L0",
        attackerPower: 5000,
        defenderPower: 5000,
        counterPowerAdded: 0,
      },
      oncePerTurnUsed: {},
      actionsPerformedThisTurn: [],
      deckHitZeroThisTurn: [false, false],
    },
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
  return { state, db };
}

describe("OPT-400: getEffectiveCounterValue", () => {
  it("grants +1000 to counterless Land of Wano characters (EB01-001)", () => {
    const { state, db } = buildState(odenLeader);
    const hand = state.players[0].hand;
    expect(getEffectiveCounterValue(hand[0], wanoNoCounter, state, db)).toBe(1000);
    // Printed counter is kept when higher than the grant.
    expect(getEffectiveCounterValue(hand[1], wanoWithCounter, state, db)).toBe(2000);
    // Non-matching trait: no grant.
    expect(getEffectiveCounterValue(hand[2], otherNoCounter, state, db)).toBe(0);
  });

  it("sets 8000-power cards to +2000 while the granting character is on the field (OP16-118)", () => {
    const { state, db } = buildState(oppLeaderData, aceCharacter);
    const hand = state.players[0].hand;
    expect(getEffectiveCounterValue(hand[3], bigAce, state, db)).toBe(2000);
    // 6000-power card unaffected.
    expect(getEffectiveCounterValue(hand[0], wanoNoCounter, state, db)).toBe(0);
  });

  it("no grant sources → printed counter only", () => {
    const { state, db } = buildState(oppLeaderData);
    const hand = state.players[0].hand;
    expect(getEffectiveCounterValue(hand[3], bigAce, state, db)).toBe(0);
    expect(getEffectiveCounterValue(hand[1], wanoWithCounter, state, db)).toBe(2000);
  });
});

describe("OPT-400: validateUseCounter honors grants", () => {
  it("accepts a counterless card with a matching grant", () => {
    const { state, db } = buildState(odenLeader);
    const error = validate(state, {
      type: "USE_COUNTER",
      cardInstanceId: "h1",
      counterTargetInstanceId: "L0",
    }, db, 0);
    expect(error).toBeNull();
  });

  it("still rejects a counterless card with no matching grant", () => {
    const { state, db } = buildState(odenLeader);
    const error = validate(state, {
      type: "USE_COUNTER",
      cardInstanceId: "h3",
      counterTargetInstanceId: "L0",
    }, db, 0);
    expect(error).toContain("no counter value");
  });
});
