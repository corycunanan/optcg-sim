/**
 * OPT-226 — OP-15 Enel/God archetype: effects that give DON!! TO an
 * opponent's Leader/Character ("cross-field DON!! redirect").
 *
 * Engine semantics (Bandai FAQ, docs/FAQs/faq_op15-eb04.md §OP15-003,
 * §OP15-008, §OP15-010, §OP15-023, §OP15-028):
 *
 *   1. Source and destination are always the SAME SIDE — you give
 *      opp's DON to opp's Character, or your DON to your own Character.
 *      Cross-side transfers ("my DON → opp Character") are not allowed.
 *
 *   2. Activator chooses both which DON!! to take (from the source
 *      cost area) and which Character to give it to.
 *
 *   3. `GIVE_OPPONENT_DON_TO_OPPONENT` with no `source_filter` defaults
 *      to RESTED DON (OP15-008 style). When the FAQ says a card may
 *      pull either state (OP15-023, OP15-028), the schema author sets
 *      `params.source_filter.is_rested = false` (or omits is_rested
 *      and sets is_active = true) to widen the pool.
 *
 *   4. After attachment the DON!! remains on the owner's side — opp's
 *      DON!! count, cost, and power calculations update as if they
 *      had given it themselves.
 */

import { describe, it, expect } from "vitest";
import { attachDonToCard } from "../engine/effect-resolver/card-mutations.js";
import { executeGiveOpponentDonToOpponent } from "../engine/effect-resolver/actions/don.js";
import type { CardData, CardInstance, DonInstance, GameState, PlayerState, KeywordSet } from "../types.js";
import type { Action } from "../engine/effect-types.js";

// ─── Factories ──────────────────────────────────────────────────────────────

function noKeywords(): KeywordSet {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Yellow"],
    cost: 3,
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

function makeDon(id: string, state: "ACTIVE" | "RESTED" = "RESTED"): DonInstance {
  return { instanceId: id, state, attachedTo: null };
}

function emptyPlayer(playerId: string, leader: CardInstance, don: DonInstance[] = []): PlayerState {
  return {
    playerId,
    leader,
    characters: [null, null, null, null, null],
    stage: null,
    hand: [],
    deck: [],
    life: [],
    donDeck: [],
    donCostArea: don,
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

// ─── attachDonToCard: ownership inferred from target ─────────────────────────

describe("OPT-226: attachDonToCard infers owner from target", () => {
  it("same-side: activator's DON attaches to activator's Character", () => {
    const leader = makeCard("LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const body = makeCard("CHAR", { power: 4000 });
    const p0Char = makeInstance(body.id, "p0c1", "CHARACTER", 0);
    const p0 = emptyPlayer("p0", makeInstance(leader.id, "p0L", "LEADER", 0), [makeDon("p0d1", "ACTIVE")]);
    p0.characters[0] = p0Char;
    const p1 = emptyPlayer("p1", makeInstance(leader.id, "p1L", "LEADER", 1));
    const state = makeState(p0, p1);

    const next = attachDonToCard(state, 0, "p0c1", "ACTIVE");
    expect(next).not.toBeNull();

    // DON moved off p0's cost area and onto p0's character 0
    expect(next!.players[0].donCostArea).toHaveLength(0);
    expect(next!.players[0].characters[0]!.attachedDon).toHaveLength(1);
    expect(next!.players[1].donCostArea).toHaveLength(0);
  });

  it("cross-side: target on opp's field pulls from opp's cost area — activator's DON untouched", () => {
    const leader = makeCard("LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const body = makeCard("CHAR", { power: 4000 });
    const p0 = emptyPlayer("p0", makeInstance(leader.id, "p0L", "LEADER", 0), [
      makeDon("p0d1", "ACTIVE"),
      makeDon("p0d2", "RESTED"),
    ]);
    const p1Char = makeInstance(body.id, "p1c1", "CHARACTER", 1);
    const p1 = emptyPlayer("p1", makeInstance(leader.id, "p1L", "LEADER", 1), [
      makeDon("p1d1", "RESTED"),
    ]);
    p1.characters[0] = p1Char;
    const state = makeState(p0, p1);

    // Activator is p0 but target is on p1's field.
    const next = attachDonToCard(state, 0, "p1c1", "RESTED");
    expect(next).not.toBeNull();

    // p0's DON pool is unchanged
    expect(next!.players[0].donCostArea).toHaveLength(2);
    // p1's DON was pulled and attached to p1's char
    expect(next!.players[1].donCostArea).toHaveLength(0);
    expect(next!.players[1].characters[0]!.attachedDon).toHaveLength(1);
    expect(next!.players[1].characters[0]!.attachedDon[0].instanceId).toBe("p1d1");
  });

  it("returns null when the owning side has no matching DON in state", () => {
    const leader = makeCard("LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const body = makeCard("CHAR", { power: 4000 });
    const p0 = emptyPlayer("p0", makeInstance(leader.id, "p0L", "LEADER", 0));
    const p1Char = makeInstance(body.id, "p1c1", "CHARACTER", 1);
    const p1 = emptyPlayer("p1", makeInstance(leader.id, "p1L", "LEADER", 1)); // no DON
    p1.characters[0] = p1Char;
    const state = makeState(p0, p1);

    expect(attachDonToCard(state, 0, "p1c1", "RESTED")).toBeNull();
  });

  it("cross-side attach to an opp Leader works", () => {
    const leader = makeCard("LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
    const p0 = emptyPlayer("p0", makeInstance(leader.id, "p0L", "LEADER", 0));
    const p1 = emptyPlayer("p1", makeInstance(leader.id, "p1L", "LEADER", 1), [
      makeDon("p1d1", "ACTIVE"),
    ]);
    const state = makeState(p0, p1);

    const next = attachDonToCard(state, 0, "p1L", "ACTIVE");
    expect(next).not.toBeNull();
    expect(next!.players[1].leader.attachedDon).toHaveLength(1);
    expect(next!.players[1].donCostArea).toHaveLength(0);
  });
});

// ─── GIVE_OPPONENT_DON_TO_OPPONENT: source_filter semantics ──────────────────

describe("OPT-226: GIVE_OPPONENT_DON_TO_OPPONENT source_filter honors FAQ rulings", () => {
  const leader = makeCard("LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
  const body = makeCard("CHAR", { power: 4000 });
  const cardDb = new Map<string, CardData>([[leader.id, leader], [body.id, body]]);

  function oneOnOneField() {
    const p0 = emptyPlayer("p0", makeInstance(leader.id, "p0L", "LEADER", 0));
    const p1Char = makeInstance(body.id, "p1c1", "CHARACTER", 1);
    const p1 = emptyPlayer("p1", makeInstance(leader.id, "p1L", "LEADER", 1), [
      makeDon("p1-active", "ACTIVE"),
      makeDon("p1-rested", "RESTED"),
    ]);
    p1.characters[0] = p1Char;
    return makeState(p0, p1);
  }

  it("default (no source_filter) → picks a RESTED DON (OP15-008 pattern)", () => {
    const state = oneOnOneField();
    const action: Action = {
      type: "GIVE_OPPONENT_DON_TO_OPPONENT",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
      params: { amount: 1 },
    } as unknown as Action;

    const res = executeGiveOpponentDonToOpponent(state, action, "src", 0, cardDb, new Map(), ["p1c1"]);
    expect(res.succeeded).toBe(true);

    const attachedId = res.state.players[1].characters[0]!.attachedDon[0].instanceId;
    expect(attachedId).toBe("p1-rested");
    // Active DON stays in cost area
    expect(res.state.players[1].donCostArea.map((d) => d.instanceId)).toEqual(["p1-active"]);
  });

  it("is_rested: false → may pull an ACTIVE DON (OP15-023 / OP15-028 pattern)", () => {
    // Move active to front so it's picked first once the filter widens.
    const state = oneOnOneField();
    state.players[1].donCostArea = [makeDon("p1-active", "ACTIVE"), makeDon("p1-rested", "RESTED")];

    const action: Action = {
      type: "GIVE_OPPONENT_DON_TO_OPPONENT",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
      params: { amount: 1, source_filter: { is_rested: false } },
    } as unknown as Action;

    const res = executeGiveOpponentDonToOpponent(state, action, "src", 0, cardDb, new Map(), ["p1c1"]);
    expect(res.succeeded).toBe(true);

    const attachedId = res.state.players[1].characters[0]!.attachedDon[0].instanceId;
    expect(attachedId).toBe("p1-active");
  });

  it("is_rested: true → only pulls RESTED; fails when opp has only ACTIVE DON", () => {
    const p0 = emptyPlayer("p0", makeInstance(leader.id, "p0L", "LEADER", 0));
    const p1Char = makeInstance(body.id, "p1c1", "CHARACTER", 1);
    const p1 = emptyPlayer("p1", makeInstance(leader.id, "p1L", "LEADER", 1), [
      makeDon("p1-active", "ACTIVE"),
    ]);
    p1.characters[0] = p1Char;
    const state = makeState(p0, p1);

    const action: Action = {
      type: "GIVE_OPPONENT_DON_TO_OPPONENT",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
      params: { amount: 1, source_filter: { is_rested: true } },
    } as unknown as Action;

    const res = executeGiveOpponentDonToOpponent(state, action, "src", 0, cardDb, new Map(), ["p1c1"]);
    expect(res.succeeded).toBe(false);
    expect(res.state.players[1].donCostArea).toHaveLength(1);
    expect(res.state.players[1].characters[0]!.attachedDon).toHaveLength(0);
  });

  it("amount > 1 keeps pulling matching DONs until the source dries up", () => {
    const p0 = emptyPlayer("p0", makeInstance(leader.id, "p0L", "LEADER", 0));
    const p1Char = makeInstance(body.id, "p1c1", "CHARACTER", 1);
    const p1 = emptyPlayer("p1", makeInstance(leader.id, "p1L", "LEADER", 1), [
      makeDon("r1", "RESTED"),
      makeDon("r2", "RESTED"),
      makeDon("a1", "ACTIVE"),
    ]);
    p1.characters[0] = p1Char;
    const state = makeState(p0, p1);

    const action: Action = {
      type: "GIVE_OPPONENT_DON_TO_OPPONENT",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
      params: { amount: 3, source_filter: { is_rested: true } },
    } as unknown as Action;

    const res = executeGiveOpponentDonToOpponent(state, action, "src", 0, cardDb, new Map(), ["p1c1"]);
    // Only 2 rested DONs available — we attach 2 and stop; the ACTIVE one stays.
    expect(res.succeeded).toBe(true);
    expect(res.state.players[1].characters[0]!.attachedDon).toHaveLength(2);
    expect(res.state.players[1].donCostArea.map((d) => d.instanceId)).toEqual(["a1"]);
  });
});
