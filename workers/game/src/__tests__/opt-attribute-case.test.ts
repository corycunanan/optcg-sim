/**
 * Attribute case-normalization regression tests.
 *
 * Schemas use uppercase attribute values (e.g. `"SLASH"`) while card data
 * stores title-case (`["Slash"]`). Engine comparisons must be
 * case-insensitive for LEADER_PROPERTY, matchesFilter, and trigger filters.
 *
 * Covers OP12-034 Perona's [On Play] SEARCH_DECK prompt, which silently
 * never fired before the fix because the LEADER_PROPERTY check compared
 * `"SLASH"` against `["Slash"]` with strict `Array.includes`.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { evaluateCondition, matchesFilter, type ConditionContext } from "../engine/conditions.js";
import { OP12_034_PERONA } from "../engine/schemas/op12.js";
import { CARDS, createTestCardDb } from "./helpers.js";

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
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

function makeInstance(cardId: string, zone: string, owner: 0 | 1, overrides: Partial<CardInstance> = {}): CardInstance {
  return {
    instanceId: `inst-${cardId}-${Math.random().toString(36).slice(2, 8)}`,
    cardId,
    zone: zone as CardInstance["zone"],
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
    ...overrides,
  };
}

function buildState(leaderCardId: string, deckCardIds: string[]): GameState {
  const makePlayer = (idx: 0 | 1, leaderId: string, deckIds: string[]): PlayerState => ({
    userId: `user-${idx}`,
    leader: makeInstance(leaderId, "LEADER", idx, { instanceId: `leader-${idx}` }),
    characters: [null, null, null, null, null],
    stage: null,
    hand: [],
    deck: deckIds.map((cid, i) =>
      makeInstance(cid, "DECK", idx, { instanceId: `deck-${idx}-${i}` }),
    ),
    trash: [],
    life: [],
    removedFromGame: [],
    donDeck: [],
    donCostArea: [],
  });

  return {
    gameId: "test-op12-034",
    status: "IN_PROGRESS",
    winner: null,
    players: [
      makePlayer(0, leaderCardId, deckCardIds),
      makePlayer(1, CARDS.LEADER.id, []),
    ],
    turn: {
      number: 3,
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
      actionsPerformedThisTurn: [],
      oncePerTurnUsed: {},
      extraTurnsPending: 0,
    },
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    effectStack: [],
    pendingPrompt: null,
  } as GameState;
}

describe("Attribute case-insensitive comparison (OPT-210)", () => {
  it("evaluateCondition LEADER_PROPERTY { attribute: 'SLASH' } matches leader with ['Slash']", () => {
    const cardDb = createTestCardDb();
    const slashLeader = makeCard("LEADER-SLASH", {
      type: "Leader", cost: null, power: 5000, life: 5, attribute: ["Slash"],
    });
    cardDb.set(slashLeader.id, slashLeader);

    const state = buildState(slashLeader.id, []);
    const ctx: ConditionContext = { sourceCardInstanceId: "leader-0", controller: 0, cardDb };

    const result = evaluateCondition(
      state,
      { type: "LEADER_PROPERTY", controller: "SELF", property: { attribute: "SLASH" } },
      ctx,
    );

    expect(result).toBe(true);
  });

  it("evaluateCondition LEADER_PROPERTY { attribute: 'SLASH' } fails for leader with ['Strike']", () => {
    const cardDb = createTestCardDb();
    const strikeLeader = makeCard("LEADER-STRIKE", {
      type: "Leader", cost: null, power: 5000, life: 5, attribute: ["Strike"],
    });
    cardDb.set(strikeLeader.id, strikeLeader);

    const state = buildState(strikeLeader.id, []);
    const ctx: ConditionContext = { sourceCardInstanceId: "leader-0", controller: 0, cardDb };

    const result = evaluateCondition(
      state,
      { type: "LEADER_PROPERTY", controller: "SELF", property: { attribute: "SLASH" } },
      ctx,
    );

    expect(result).toBe(false);
  });

  it("matchesFilter treats uppercase filter attribute as case-insensitive", () => {
    const cardDb = createTestCardDb();
    const slashChar = makeCard("CHAR-SLASH", { attribute: ["Slash"] });
    cardDb.set(slashChar.id, slashChar);

    const state = buildState(CARDS.LEADER.id, []);
    const instance = makeInstance(slashChar.id, "DECK", 0);

    expect(matchesFilter(instance, { attribute: "SLASH" }, cardDb, state)).toBe(true);
    expect(matchesFilter(instance, { attribute_not: "SLASH" }, cardDb, state)).toBe(false);
    expect(matchesFilter(instance, { attribute: "STRIKE" }, cardDb, state)).toBe(false);
  });
});

describe("OP12-034 Perona ON_PLAY produces ARRANGE_TOP_CARDS prompt", () => {
  const perona_on_play = OP12_034_PERONA.effects[0] as EffectBlock;

  it("with SLASH leader, resolves to an ARRANGE_TOP_CARDS prompt with matching validTargets", () => {
    const cardDb = createTestCardDb();

    const slashLeader = makeCard("LEADER-SLASH", {
      type: "Leader", cost: null, power: 5000, life: 5, color: ["Green"], attribute: ["Slash"],
    });
    const slashChar = makeCard("DECK-SLASH", { attribute: ["Slash"], color: ["Green"] });
    const greenEvent = makeCard("DECK-GREEN-EVENT", { type: "Event", color: ["Green"], power: null });
    const nonMatch = makeCard("DECK-NONMATCH", { attribute: ["Strike"], color: ["Red"] });

    cardDb.set(slashLeader.id, slashLeader);
    cardDb.set(slashChar.id, slashChar);
    cardDb.set(greenEvent.id, greenEvent);
    cardDb.set(nonMatch.id, nonMatch);

    // Top 5 of deck: slash, green event, non-match, non-match, non-match
    const state = buildState(slashLeader.id, [
      slashChar.id, greenEvent.id, nonMatch.id, nonMatch.id, nonMatch.id,
      // Padding so deck has >5 cards; these should not appear in the prompt.
      nonMatch.id, nonMatch.id,
    ]);

    const perona = makeCard("OP12-034", {
      name: "Perona", color: ["Green"], effectText: "", effectSchema: OP12_034_PERONA,
    });
    cardDb.set(perona.id, perona);
    const peronaInstance = makeInstance(perona.id, "CHARACTER", 0, { instanceId: "perona-0" });
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: [peronaInstance, null, null, null, null],
    };
    const stateWithPerona: GameState = { ...state, players: newPlayers };

    const result = resolveEffect(stateWithPerona, perona_on_play, "perona-0", 0, cardDb);

    expect(result.pendingPrompt).toBeDefined();
    const opts = result.pendingPrompt!.options;
    expect(opts.promptType).toBe("ARRANGE_TOP_CARDS");
    if (opts.promptType !== "ARRANGE_TOP_CARDS") return;

    expect(opts.cards.length).toBe(5);
    expect(opts.canSendToBottom).toBe(true);
    expect(result.pendingPrompt!.respondingPlayer).toBe(0);

    // Slash character and green Event are valid picks; non-matches are not.
    const top5Instances = opts.cards.map((c) => c.instanceId);
    const slashInstance = stateWithPerona.players[0].deck[0].instanceId;
    const eventInstance = stateWithPerona.players[0].deck[1].instanceId;
    const nonMatchInstance = stateWithPerona.players[0].deck[2].instanceId;

    expect(top5Instances).toContain(slashInstance);
    expect(top5Instances).toContain(eventInstance);
    expect(opts.validTargets).toContain(slashInstance);
    expect(opts.validTargets).toContain(eventInstance);
    expect(opts.validTargets).not.toContain(nonMatchInstance);
  });

  it("with non-SLASH leader, the condition blocks the effect and no prompt is produced", () => {
    const cardDb = createTestCardDb();

    const strikeLeader = makeCard("LEADER-STRIKE", {
      type: "Leader", cost: null, power: 5000, life: 5, color: ["Green"], attribute: ["Strike"],
    });
    const slashChar = makeCard("DECK-SLASH", { attribute: ["Slash"], color: ["Green"] });
    cardDb.set(strikeLeader.id, strikeLeader);
    cardDb.set(slashChar.id, slashChar);

    const state = buildState(strikeLeader.id, [slashChar.id, slashChar.id, slashChar.id, slashChar.id, slashChar.id]);

    const perona = makeCard("OP12-034", { name: "Perona", color: ["Green"], effectSchema: OP12_034_PERONA });
    cardDb.set(perona.id, perona);
    const peronaInstance = makeInstance(perona.id, "CHARACTER", 0, { instanceId: "perona-0" });
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: [peronaInstance, null, null, null, null] };
    const stateWithPerona: GameState = { ...state, players: newPlayers };

    const result = resolveEffect(stateWithPerona, perona_on_play, "perona-0", 0, cardDb);

    expect(result.resolved).toBe(false);
    expect(result.pendingPrompt).toBeUndefined();
  });
});
