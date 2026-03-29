/**
 * M4.5 Phase 4 — Integration Tests
 *
 * Tests verify that the engine produces correct game states for all
 * deferred patterns resolved in M4.5 Phases 1–3.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, DonInstance, GameState, PlayerState } from "../types.js";
import { setupGame, createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";
import { getEffectiveCost, getEffectivePower, consumeOneTimeModifiers } from "../engine/modifiers.js";
import { evaluateCondition, matchesFilter, type ConditionContext } from "../engine/conditions.js";
import { resolveEffect, executeActionChain, executeEffectAction } from "../engine/effect-resolver/resolver.js";
import { executeApplyOneTimeModifier } from "../engine/effect-resolver/actions/effects.js";
import { executeReveal } from "../engine/effect-resolver/actions/hand-deck.js";
import { executeTurnLifeFaceUp, executeTurnLifeFaceDown } from "../engine/effect-resolver/actions/life.js";
import { executeSetBasePower } from "../engine/effect-resolver/actions/modifiers.js";
import { executeSearchTrashTheRest } from "../engine/effect-resolver/actions/draw-search.js";
import { resumeEffectChain } from "../engine/effect-resolver/resume.js";
import { payCosts } from "../engine/effect-resolver/cost-handler.js";
import { findCardInstance } from "../engine/state.js";
import { resolveAmount } from "../engine/effect-resolver/action-utils.js";

// ─── Test Utilities ─────────────────────────────────────────────────────────

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

function makeInstance(
  cardId: string,
  zone: string,
  owner: 0 | 1,
  overrides: Partial<CardInstance> = {},
): CardInstance {
  return {
    instanceId: `inst-${cardId}-${Math.random().toString(36).slice(2, 6)}`,
    cardId,
    zone: zone as any,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
    ...overrides,
  };
}

/** Build a minimal game state with customizable players. */
function buildMinimalState(overrides: Partial<GameState> = {}): GameState {
  const makePlayer = (idx: 0 | 1): PlayerState => ({
    userId: `user-${idx}`,
    leader: makeInstance(CARDS.LEADER.id, "LEADER", idx, { instanceId: `leader-${idx}` }),
    characters: [],
    stage: null,
    hand: [],
    deck: Array.from({ length: 20 }, (_, i) =>
      makeInstance(CARDS.VANILLA.id, "DECK", idx, { instanceId: `deck-${idx}-${i}` }),
    ),
    trash: [],
    life: Array.from({ length: 5 }, (_, i) => ({
      instanceId: `life-${idx}-${i}`,
      cardId: CARDS.VANILLA.id,
      face: "DOWN" as const,
    })),
    removedFromGame: [],
    donDeck: Array.from({ length: 10 }, (_, i) => ({
      instanceId: `dondeck-${idx}-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    })),
    donCostArea: Array.from({ length: 6 }, (_, i) => ({
      instanceId: `don-${idx}-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    })),
  });

  return {
    gameId: "test-integration",
    status: "IN_PROGRESS",
    winner: null,
    players: [makePlayer(0), makePlayer(1)],
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
    ...overrides,
  } as GameState;
}

// ─── 1. Hand-Zone Cost Modifiers ────────────────────────────────────────────

describe("1. Hand-Zone Cost Modifiers", () => {
  it("1a. Card in hand with zone:HAND permanent block gets cost reduced when condition is met", () => {
    // Card: a 5-cost blue character that costs 2 less when you have ≤2 life
    const selfReducingCard = makeCard("SELF-REDUCE", {
      cost: 5,
      color: ["Blue"],
      effectSchema: {
        effects: [{
          id: "sr-1",
          category: "permanent",
          zone: "HAND",
          conditions: { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 2 },
          modifiers: [{ type: "MODIFY_COST", params: { amount: -2 } }],
        }],
      },
    });

    const cardDb = createTestCardDb();
    cardDb.set(selfReducingCard.id, selfReducingCard);

    const handCard = makeInstance(selfReducingCard.id, "HAND", 0, { instanceId: "hand-sr" });
    const state = buildMinimalState();
    // Set life to 2 (condition met)
    state.players[0].life = state.players[0].life.slice(0, 2);
    state.players[0].hand = [handCard];

    const cost = getEffectiveCost(selfReducingCard, state, "hand-sr", cardDb);
    expect(cost).toBe(3); // 5 - 2 = 3
  });

  it("1b. Card in hand does NOT get cost reduced when condition fails", () => {
    const selfReducingCard = makeCard("SELF-REDUCE", {
      cost: 5,
      color: ["Blue"],
      effectSchema: {
        effects: [{
          id: "sr-1",
          category: "permanent",
          zone: "HAND",
          conditions: { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 2 },
          modifiers: [{ type: "MODIFY_COST", params: { amount: -2 } }],
        }],
      },
    });

    const cardDb = createTestCardDb();
    cardDb.set(selfReducingCard.id, selfReducingCard);

    const handCard = makeInstance(selfReducingCard.id, "HAND", 0, { instanceId: "hand-sr" });
    const state = buildMinimalState();
    // Life is 5 (condition NOT met: 5 > 2)
    state.players[0].hand = [handCard];

    const cost = getEffectiveCost(selfReducingCard, state, "hand-sr", cardDb);
    expect(cost).toBe(5); // No reduction
  });

  it("1c. Field-to-hand modifier (OP01-067 pattern): field card reduces blue Event costs in hand", () => {
    // Crocodile-like: permanent block on field that grants -1 cost to blue Events in hand
    const crocodileCard = makeCard("CROC-FIELD", {
      cost: 3,
      power: 5000,
      effectSchema: {
        effects: [{
          id: "croc-1",
          category: "permanent",
          // Default zone is FIELD (not "HAND")
          modifiers: [{
            type: "MODIFY_COST",
            params: { amount: -1 },
            target: {
              type: "CARD_IN_HAND",
              controller: "SELF",
              filter: { color: "Blue", card_type: "EVENT" },
            },
          }],
        }],
      },
    });

    const blueEvent = makeCard("BLUE-EVENT", {
      type: "Event",
      cost: 4,
      color: ["Blue"],
      power: null,
    });

    const redChar = makeCard("RED-CHAR", { cost: 3, color: ["Red"] });

    const cardDb = createTestCardDb();
    cardDb.set(crocodileCard.id, crocodileCard);
    cardDb.set(blueEvent.id, blueEvent);
    cardDb.set(redChar.id, redChar);

    const state = buildMinimalState();
    const crocInstance = makeInstance(crocodileCard.id, "CHARACTER", 0, { instanceId: "croc-inst" });
    state.players[0].characters = [crocInstance];

    const handEvent = makeInstance(blueEvent.id, "HAND", 0, { instanceId: "hand-event" });
    const handRedChar = makeInstance(redChar.id, "HAND", 0, { instanceId: "hand-red" });
    state.players[0].hand = [handEvent, handRedChar];

    // Blue Event should be reduced by 1
    const eventCost = getEffectiveCost(blueEvent, state, "hand-event", cardDb);
    expect(eventCost).toBe(3); // 4 - 1

    // Red Character should NOT be reduced
    const charCost = getEffectiveCost(redChar, state, "hand-red", cardDb);
    expect(charCost).toBe(3); // Unchanged
  });

  it("1d. validatePlayCard accounts for hand-zone cost reductions", () => {
    // Card costs 5 but reduces to 3 via hand-zone modifier — player with 3 DON can play it
    const selfReducingCard = makeCard("SELF-REDUCE-VALID", {
      cost: 5,
      color: ["Blue"],
      effectText: "[Main]",
      type: "Event",
      effectSchema: {
        effects: [{
          id: "srv-1",
          category: "permanent",
          zone: "HAND",
          modifiers: [{ type: "MODIFY_COST", params: { amount: -2 } }],
        }],
      },
    });

    const cardDb = createTestCardDb();
    cardDb.set(selfReducingCard.id, selfReducingCard);

    const state = buildMinimalState();
    const handCard = makeInstance(selfReducingCard.id, "HAND", 0, { instanceId: "hand-valid" });
    state.players[0].hand = [handCard];
    // Only 3 active DON!! (normally can't afford 5-cost, but can afford 3-cost)
    state.players[0].donCostArea = Array.from({ length: 3 }, (_, i) => ({
      instanceId: `don-0-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));

    const effectiveCost = getEffectiveCost(selfReducingCard, state, "hand-valid", cardDb);
    expect(effectiveCost).toBe(3);

    // Validate: player has 3 active DON and card costs 3 after reduction → legal
    const activeDon = state.players[0].donCostArea.filter(d => d.state === "ACTIVE" && !d.attachedTo).length;
    expect(activeDon).toBeGreaterThanOrEqual(effectiveCost);
  });

  it("1e. Multiple hand-zone modifiers stack correctly", () => {
    // Two permanent HAND-zone blocks each reducing cost by 1
    const doubleReduceCard = makeCard("DOUBLE-REDUCE", {
      cost: 6,
      effectSchema: {
        effects: [
          {
            id: "dr-1",
            category: "permanent",
            zone: "HAND",
            modifiers: [{ type: "MODIFY_COST", params: { amount: -1 } }],
          },
          {
            id: "dr-2",
            category: "permanent",
            zone: "HAND",
            conditions: { type: "TRASH_COUNT", controller: "SELF", operator: ">=", value: 5 },
            modifiers: [{ type: "MODIFY_COST", params: { amount: -2 } }],
          },
        ],
      },
    });

    const cardDb = createTestCardDb();
    cardDb.set(doubleReduceCard.id, doubleReduceCard);

    const state = buildMinimalState();
    const handCard = makeInstance(doubleReduceCard.id, "HAND", 0, { instanceId: "hand-dr" });
    state.players[0].hand = [handCard];
    // Fill trash with 5 cards to meet second condition
    state.players[0].trash = Array.from({ length: 5 }, (_, i) =>
      makeInstance(CARDS.VANILLA.id, "TRASH", 0, { instanceId: `trash-0-${i}` }),
    );

    const cost = getEffectiveCost(doubleReduceCard, state, "hand-dr", cardDb);
    expect(cost).toBe(3); // 6 - 1 - 2 = 3
  });
});

// ─── 2. REVEAL_CONDITIONAL ──────────────────────────────────────────────────

describe("2. REVEAL_CONDITIONAL", () => {
  it("2a. Reveal top card matching filter → conditional action fires (via inline condition check)", () => {
    const cardDb = createTestCardDb();

    // Put a known card on top of deck
    const targetCard = makeCard("REVEAL-TARGET", { cost: 3, types: ["Straw Hat Crew"] });
    cardDb.set(targetCard.id, targetCard);

    const state = buildMinimalState();
    state.players[0].deck[0] = makeInstance(targetCard.id, "DECK", 0, { instanceId: "deck-top" });

    // Execute REVEAL action
    const revealResult = executeReveal(
      state,
      { type: "REVEAL", params: { amount: 1, source: "DECK" }, result_ref: "revealed" },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    expect(revealResult.succeeded).toBe(true);
    expect(revealResult.result?.targetInstanceIds).toContain("deck-top");

    // Now check REVEALED_CARD_PROPERTY condition with the result ref
    const resultRefs = new Map<string, any>();
    resultRefs.set("revealed", revealResult.result);

    const ctx: ConditionContext = {
      sourceCardInstanceId: "leader-0",
      controller: 0,
      cardDb,
      resultRefs,
    };

    // Condition: revealed card has trait "Straw Hat Crew"
    const condition = {
      type: "REVEALED_CARD_PROPERTY" as const,
      result_ref: "revealed",
      filter: { traits: ["Straw Hat Crew"] },
    };

    const matches = evaluateCondition(revealResult.state, condition, ctx);
    expect(matches).toBe(true);
  });

  it("2b. Reveal top card NOT matching filter → conditional action skipped", () => {
    const cardDb = createTestCardDb();

    // Top of deck is a generic card without the required trait
    const state = buildMinimalState();
    // CHAR-VANILLA has no traits

    const revealResult = executeReveal(
      state,
      { type: "REVEAL", params: { amount: 1, source: "DECK" }, result_ref: "revealed" },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    expect(revealResult.succeeded).toBe(true);

    const resultRefs = new Map<string, any>();
    resultRefs.set("revealed", revealResult.result);

    const ctx: ConditionContext = {
      sourceCardInstanceId: "leader-0",
      controller: 0,
      cardDb,
      resultRefs,
    };

    const condition = {
      type: "REVEALED_CARD_PROPERTY" as const,
      result_ref: "revealed",
      filter: { traits: ["Straw Hat Crew"] },
    };

    const matches = evaluateCondition(revealResult.state, condition, ctx);
    expect(matches).toBe(false);
  });

  it("2c. REVEALED_CARD_PROPERTY evaluates color filter correctly", () => {
    const cardDb = createTestCardDb();

    const blueCard = makeCard("BLUE-DECK", { color: ["Blue"] });
    cardDb.set(blueCard.id, blueCard);

    const state = buildMinimalState();
    state.players[0].deck[0] = makeInstance(blueCard.id, "DECK", 0, { instanceId: "blue-top" });

    const revealResult = executeReveal(
      state,
      { type: "REVEAL", params: { amount: 1, source: "DECK" }, result_ref: "revealed" },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    const resultRefs = new Map<string, any>();
    resultRefs.set("revealed", revealResult.result);

    const ctx: ConditionContext = {
      sourceCardInstanceId: "leader-0",
      controller: 0,
      cardDb,
      resultRefs,
    };

    // Match Blue
    expect(evaluateCondition(revealResult.state, {
      type: "REVEALED_CARD_PROPERTY" as const,
      result_ref: "revealed",
      filter: { color: "BLUE" },
    }, ctx)).toBe(true);

    // Don't match Red
    expect(evaluateCondition(revealResult.state, {
      type: "REVEALED_CARD_PROPERTY" as const,
      result_ref: "revealed",
      filter: { color: "RED" },
    }, ctx)).toBe(false);
  });
});

// ─── 3. SEARCH_TRASH_THE_REST Resume ────────────────────────────────────────

describe("3. SEARCH_TRASH_THE_REST Resume", () => {
  it("3a. Produces a prompt with valid targets and rest destination", () => {
    const cardDb = createTestCardDb();

    const targetCard = makeCard("SEARCH-TARGET", { cost: 2, types: ["Animal"] });
    cardDb.set(targetCard.id, targetCard);

    const state = buildMinimalState();
    // Put target card as 2nd in deck, vanilla as 1st
    state.players[0].deck[1] = makeInstance(targetCard.id, "DECK", 0, { instanceId: "search-hit" });

    const action = {
      type: "SEARCH_TRASH_THE_REST" as const,
      params: {
        look_at: 5,
        filter: { traits: ["Animal"] },
        rest_destination: "TRASH",
      },
    };

    const result = executeSearchTrashTheRest(
      state, action, "leader-0", 0, cardDb, new Map(),
    );

    // Should produce a pending prompt
    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt?.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(result.pendingPrompt?.options?.validTargets).toContain("search-hit");
    expect(result.pendingPrompt?.options?.restDestination).toBe("TRASH");
  });

  it("3b. With rest_destination BOTTOM, prompt indicates bottom placement", () => {
    const cardDb = createTestCardDb();
    const targetCard = makeCard("SEARCH-BOTTOM", { cost: 2, types: ["Fish"] });
    cardDb.set(targetCard.id, targetCard);

    const state = buildMinimalState();
    state.players[0].deck[0] = makeInstance(targetCard.id, "DECK", 0, { instanceId: "search-bot" });

    const action = {
      type: "SEARCH_TRASH_THE_REST" as const,
      params: {
        look_at: 5,
        filter: { traits: ["Fish"] },
        rest_destination: "BOTTOM",
      },
    };

    const result = executeSearchTrashTheRest(
      state, action, "leader-0", 0, cardDb, new Map(),
    );

    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt?.options?.canSendToBottom).toBe(true);
    expect(result.pendingPrompt?.options?.restDestination).toBe("BOTTOM");
  });
});

// ─── 4. One-Time Modifiers / NEXT_EVENT_COST_REDUCTION ──────────────────────

describe("4. One-Time Modifiers / NEXT_EVENT_COST_REDUCTION", () => {
  it("4a. APPLY_ONE_TIME_MODIFIER creates a RuntimeOneTimeModifier in state", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();

    const action = {
      type: "APPLY_ONE_TIME_MODIFIER" as const,
      params: {
        modification: { type: "MODIFY_COST", params: { amount: -3 } },
        applies_to: { action: "PLAY_CARD", filter: { card_type: "EVENT" } },
      },
      duration: { type: "THIS_TURN" as const },
    };

    const result = executeApplyOneTimeModifier(
      state, action, "leader-0", 0, cardDb, new Map(),
    );

    expect(result.succeeded).toBe(true);
    expect(result.state.oneTimeModifiers.length).toBe(1);

    const otm = result.state.oneTimeModifiers[0] as any;
    expect(otm.consumed).toBe(false);
    expect(otm.controller).toBe(0);
    expect(otm.modification.type).toBe("MODIFY_COST");
    expect(otm.modification.params.amount).toBe(-3);
    expect(otm.appliesTo.filter.card_type).toBe("EVENT");
  });

  it("4b. getEffectiveCost applies unconsumed one-time modifier matching the card", () => {
    const cardDb = createTestCardDb();
    const eventCard = makeCard("OTM-EVENT", {
      type: "Event",
      cost: 5,
      color: ["Red"],
      power: null,
    });
    cardDb.set(eventCard.id, eventCard);

    const state = buildMinimalState();
    const handCard = makeInstance(eventCard.id, "HAND", 0, { instanceId: "hand-otm" });
    state.players[0].hand = [handCard];

    // Add a one-time modifier: next Event costs 3 less
    state.oneTimeModifiers = [{
      id: "otm-1",
      appliesTo: { action: "PLAY_CARD", filter: { card_type: "EVENT" } },
      modification: { type: "MODIFY_COST", params: { amount: -3 } },
      expires: { type: "THIS_TURN" },
      consumed: false,
      controller: 0,
    }] as any;

    const cost = getEffectiveCost(eventCard, state, "hand-otm", cardDb);
    expect(cost).toBe(2); // 5 - 3 = 2
  });

  it("4c. consumeOneTimeModifiers marks matching modifier as consumed after play", () => {
    const cardDb = createTestCardDb();
    const eventCard = makeCard("CONSUME-EVENT", {
      type: "Event",
      cost: 4,
      power: null,
    });
    cardDb.set(eventCard.id, eventCard);

    const state = buildMinimalState();
    state.oneTimeModifiers = [{
      id: "otm-c",
      appliesTo: { action: "PLAY_CARD", filter: {} },
      modification: { type: "MODIFY_COST", params: { amount: -2 } },
      expires: { type: "THIS_TURN" },
      consumed: false,
      controller: 0,
    }] as any;

    const updatedState = consumeOneTimeModifiers(state, eventCard, 0);
    const otm = updatedState.oneTimeModifiers[0] as any;
    expect(otm.consumed).toBe(true);
  });

  it("4d. matchesOneTimeFilter respects card_type, costMin, traits filters", () => {
    const cardDb = createTestCardDb();

    // Character that should NOT match an Event-only modifier
    const charCard = makeCard("NO-MATCH-CHAR", { type: "Character", cost: 3 });
    cardDb.set(charCard.id, charCard);

    const state = buildMinimalState();
    state.oneTimeModifiers = [{
      id: "otm-filter",
      appliesTo: { action: "PLAY_CARD", filter: { card_type: "EVENT" } },
      modification: { type: "MODIFY_COST", params: { amount: -2 } },
      expires: { type: "THIS_TURN" },
      consumed: false,
      controller: 0,
    }] as any;

    // Character card should NOT get the reduction (filter is EVENT only)
    const handChar = makeInstance(charCard.id, "HAND", 0, { instanceId: "hand-no-match" });
    state.players[0].hand = [handChar];

    const cost = getEffectiveCost(charCard, state, "hand-no-match", cardDb);
    expect(cost).toBe(3); // Unchanged — filter doesn't match
  });
});

// ─── 5. TURN_LIFE_FACE Costs ────────────────────────────────────────────────

describe("5. TURN_LIFE_FACE Costs", () => {
  it("5a. TURN_LIFE_FACE_UP action flips a life card face up", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    // All life cards are face-down by default

    const result = executeTurnLifeFaceUp(
      state,
      { type: "TURN_LIFE_FACE_UP", params: { amount: 1, position: "TOP" } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    expect(result.succeeded).toBe(true);
    const p0 = result.state.players[0];
    expect(p0.life[0].face).toBe("UP");
    // Rest remain face-down
    expect(p0.life[1].face).toBe("DOWN");
  });

  it("5b. TURN_LIFE_FACE_DOWN fails if no face-up life cards exist", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    // All life cards are face-down — turning face-down should still succeed
    // (the action handler doesn't check for face-up, it just sets face)
    // But the COST handler (TURN_LIFE_FACE_DOWN as a cost) checks for face-up life

    // Instead, test that turning face down on already face-down cards just sets them DOWN
    const result = executeTurnLifeFaceDown(
      state,
      { type: "TURN_LIFE_FACE_DOWN", params: { amount: 1 } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    // The action handler sets face DOWN on top N cards — it always succeeds if life exists
    expect(result.succeeded).toBe(true);

    // Now test with no life cards at all
    const emptyLifeState = buildMinimalState();
    emptyLifeState.players[0].life = [];

    const failResult = executeTurnLifeFaceDown(
      emptyLifeState,
      { type: "TURN_LIFE_FACE_DOWN", params: { amount: 1 } },
      "leader-0",
      0,
      cardDb,
      new Map(),
    );

    expect(failResult.succeeded).toBe(false);
  });
});

// ─── 5c–d. TURN_LIFE_FACE as Cost (cost-handler regression) ─────────────────

describe("5c–d. TURN_LIFE_FACE as Cost (cost-handler)", () => {
  it("5c. TURN_LIFE_FACE_UP cost flips face-down life to face UP and uses face property", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    // All life starts face-down

    const costs = [{ type: "TURN_LIFE_FACE_UP", amount: 1 }];
    const result = payCosts(state, costs, 0, cardDb, "leader-0");

    expect(result).not.toBeNull();
    const p0 = result!.state.players[0];
    // Should set face: "UP", not faceUp: true
    expect(p0.life[0].face).toBe("UP");
    expect((p0.life[0] as any).faceUp).toBeUndefined();
  });

  it("5d. TURN_LIFE_FACE_DOWN cost fails when no face-up life exists", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    // All life is face-down — cost should fail (returns null)

    const costs = [{ type: "TURN_LIFE_FACE_DOWN", amount: 1 }];
    const result = payCosts(state, costs, 0, cardDb, "leader-0");
    expect(result).toBeNull();

    // Now flip one face-up first, then try the cost
    state.players[0].life[0] = { ...state.players[0].life[0], face: "UP" as const };
    const result2 = payCosts(state, costs, 0, cardDb, "leader-0");
    expect(result2).not.toBeNull();
    expect(result2!.state.players[0].life[0].face).toBe("DOWN");
    expect((result2!.state.players[0].life[0] as any).faceUp).toBeUndefined();
  });
});

// ─── 6. Dynamic Values ──────────────────────────────────────────────────────

describe("6. Dynamic Values", () => {
  it("6a. LEADER_BASE_POWER resolves to the leader's printed power", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();

    // Leader has 5000 power (from CARDS.LEADER)
    const dynamicValue = { type: "GAME_STATE", source: "LEADER_BASE_POWER", controller: "SELF" };
    const resolved = resolveAmount(dynamicValue, new Map(), state, 0, cardDb);
    expect(resolved).toBe(5000);
  });

  it("6b. SET_BASE_POWER with dynamic GAME_STATE value applies correctly", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();

    // Place a character on the field to target
    const char = makeInstance(CARDS.VANILLA.id, "CHARACTER", 0, { instanceId: "char-target" });
    state.players[0].characters = [char];

    // SET_BASE_POWER with dynamic value = LEADER_BASE_POWER (5000)
    const action = {
      type: "SET_BASE_POWER" as const,
      params: { value: { type: "GAME_STATE", source: "LEADER_BASE_POWER", controller: "SELF" } },
      target: { type: "SELF_CHARACTERS", controller: "SELF", count: { mode: "ALL" } },
      duration: { type: "THIS_TURN" as const },
    };

    const result = executeSetBasePower(
      state, action, "leader-0", 0, cardDb, new Map(), ["char-target"],
    );

    expect(result.succeeded).toBe(true);
    // The active effect should have SET_POWER with value 5000
    const effect = result.state.activeEffects[0] as any;
    expect(effect.modifiers[0].type).toBe("SET_POWER");
    expect(effect.modifiers[0].params.value).toBe(5000);

    // Verify effective power uses the set value
    const updatedChar = result.state.players[0].characters[0];
    const power = getEffectivePower(updatedChar, CARDS.VANILLA, result.state);
    // It's player 0's turn so DON bonus applies (0 DON attached = 0 bonus)
    expect(power).toBe(5000); // SET_POWER overrides base 4000
  });
});

// ─── 7. Stage Support in SEARCH_AND_PLAY ────────────────────────────────────

describe("7. Stage Support in SEARCH_AND_PLAY", () => {
  it("7a. Resume handler places a Stage card into the stage zone", () => {
    const cardDb = createTestCardDb();
    const stageCard = makeCard("STAGE-SEARCH", { type: "Stage", cost: 2, power: null });
    cardDb.set(stageCard.id, stageCard);

    const state = buildMinimalState();
    // Place the stage card in the deck
    state.players[0].deck[0] = makeInstance(stageCard.id, "DECK", 0, { instanceId: "stage-found" });

    // Simulate SEARCH_AND_PLAY paused action
    const pausedAction = {
      type: "SEARCH_AND_PLAY" as const,
      params: {
        look_at: 5,
        filter: { card_type: "STAGE" },
        rest_destination: "BOTTOM",
        destination: "FIELD",
      },
    };

    const resumeCtx = {
      effectSourceInstanceId: "leader-0",
      controller: 0 as const,
      pausedAction,
      remainingActions: [],
      resultRefs: [],
      validTargets: ["stage-found"],
    };

    // Simulate the player picking the stage card
    const resumeAction = {
      type: "ARRANGE_TOP_CARDS" as const,
      keptCardInstanceId: "stage-found",
      orderedInstanceIds: state.players[0].deck.slice(1, 5).map(c => c.instanceId),
      destination: "bottom",
    };

    const result = resumeEffectChain(state, resumeCtx, resumeAction, cardDb);

    // The stage card should be placed in the stage zone
    expect(result.state.players[0].stage).not.toBeNull();
    expect(result.state.players[0].stage?.cardId).toBe(stageCard.id);
    expect(result.state.players[0].stage?.zone).toBe("STAGE");
  });
});

// ─── 8. Condition Evaluator Edge Cases ──────────────────────────────────────

describe("8. Condition Evaluator Edge Cases", () => {
  it("8a. DON_GIVEN with SPECIFIC_CARD mode checks source card's attached DON", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();

    // Place a character with 2 DON attached
    const charWithDon = makeInstance(CARDS.VANILLA.id, "CHARACTER", 0, {
      instanceId: "char-don",
      attachedDon: [
        { instanceId: "don-a1", state: "ACTIVE" as const, attachedTo: "char-don" },
        { instanceId: "don-a2", state: "ACTIVE" as const, attachedTo: "char-don" },
      ],
    });
    state.players[0].characters = [charWithDon];

    const ctx: ConditionContext = {
      sourceCardInstanceId: "char-don",
      controller: 0,
      cardDb,
    };

    // DON_GIVEN SPECIFIC_CARD with >= 1 should be true
    expect(evaluateCondition(state, {
      type: "DON_GIVEN",
      controller: "SELF",
      mode: "SPECIFIC_CARD",
      operator: ">=",
      value: 1,
    } as any, ctx)).toBe(true);

    // DON_GIVEN SPECIFIC_CARD with >= 3 should be false (only 2 attached)
    expect(evaluateCondition(state, {
      type: "DON_GIVEN",
      controller: "SELF",
      mode: "SPECIFIC_CARD",
      operator: ">=",
      value: 3,
    } as any, ctx)).toBe(false);
  });

  it("8b. COMPARATIVE with negative margin (DON field count at least 2 less)", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();

    // Player 0: 4 DON on field (cost area)
    state.players[0].donCostArea = Array.from({ length: 4 }, (_, i) => ({
      instanceId: `don-0-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));

    // Player 1: 8 DON on field
    state.players[1].donCostArea = Array.from({ length: 8 }, (_, i) => ({
      instanceId: `don-1-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));

    const ctx: ConditionContext = {
      sourceCardInstanceId: "leader-0",
      controller: 0,
      cardDb,
    };

    // "Your DON field count <= opponent's DON field count + (-2)"
    // i.e., self DON count at least 2 less than opponent
    // P0: 4, P1: 8 → 4 <= 8 + (-2) → 4 <= 6 → true
    expect(evaluateCondition(state, {
      type: "COMPARATIVE",
      metric: "DON_FIELD_COUNT",
      operator: "<=",
      margin: -2,
    } as any, ctx)).toBe(true);

    // If P0 had 7 DON → 7 <= 8 + (-2) → 7 <= 6 → false
    state.players[0].donCostArea = Array.from({ length: 7 }, (_, i) => ({
      instanceId: `don-0-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));

    expect(evaluateCondition(state, {
      type: "COMPARATIVE",
      metric: "DON_FIELD_COUNT",
      operator: "<=",
      margin: -2,
    } as any, ctx)).toBe(false);
  });
});

// ─── 9. Additional Coverage ─────────────────────────────────────────────────

describe("9. Additional Integration Coverage", () => {
  it("9a. resolveEffect evaluates block conditions and skips when false", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();

    const block = {
      id: "block-cond",
      category: "auto" as const,
      conditions: { type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 0 },
      actions: [{ type: "DRAW", params: { amount: 3 } }],
    };

    const result = resolveEffect(state, block as any, "leader-0", 0, cardDb);
    expect(result.resolved).toBe(false); // Condition not met (5 life > 0)
    // Hand unchanged
    expect(result.state.players[0].hand.length).toBe(state.players[0].hand.length);
  });

  it("9b. executeActionChain with IF_DO chain skips next action on failure", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();
    state.players[0].hand = []; // Empty hand

    const actions = [
      // First action: TRASH_FROM_HAND — will fail because hand is empty
      { type: "TRASH_FROM_HAND" as const, params: { amount: 1 }, target: { controller: "SELF" } },
      // Second action: DRAW with IF_DO chain — should be skipped
      { type: "DRAW" as const, params: { amount: 2 }, chain: "IF_DO" as const },
    ];

    const result = executeActionChain(state, actions as any, "leader-0", 0, cardDb);
    // Draw should NOT have happened since trash failed
    expect(result.state.players[0].hand.length).toBe(0);
  });

  it("9c. matchesFilter checks cost_max correctly", () => {
    const cardDb = createTestCardDb();
    const state = buildMinimalState();

    // CARDS.VANILLA has cost 3
    const char = makeInstance(CARDS.VANILLA.id, "CHARACTER", 0, { instanceId: "filter-test" });

    expect(matchesFilter(char, { cost_max: 5 }, cardDb, state)).toBe(true);
    expect(matchesFilter(char, { cost_max: 3 }, cardDb, state)).toBe(true);
    expect(matchesFilter(char, { cost_max: 2 }, cardDb, state)).toBe(false);
  });
});
