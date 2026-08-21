import { describe, expect, it } from "vitest";
import type { Cost, EffectBlock, EffectSchema } from "../engine/effect-types.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { applyCostTransactionState } from "../engine/effect-resolver/cost/transaction.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import type { CardData, DonInstance, GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function withActiveDon(state: GameState, count: number): GameState {
  const donCostArea: DonInstance[] = state.players[0].donCostArea
    .slice(0, count)
    .map((don) => ({ ...don, state: "ACTIVE", attachedTo: null }));
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], donCostArea };
  return { ...state, players };
}

function offer(
  state: GameState,
  block: EffectBlock,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId = state.players[0].leader.instanceId,
) {
  return resolveEffect(state, block, sourceCardInstanceId, 0, cardDb);
}

const SELECTION_COST_TYPES = new Set<Cost["type"]>([
  "TRASH_FROM_HAND",
  "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE",
  "KO_OWN_CHARACTER",
  "RETURN_OWN_CHARACTER_TO_HAND",
  "PLACE_OWN_CHARACTER_TO_DECK",
  "PLACE_HAND_TO_DECK",
  "REST_CARDS",
  "REST_NAMED_CARD",
  "TRASH_OWN_CHARACTER",
  "REVEAL_FROM_HAND",
  "CHOOSE_ONE_COST",
  "PLACE_FROM_TRASH_TO_DECK",
  "PLACE_SELF_AND_TRASH_TO_DECK",
  "PLACE_SELF_AND_HAND_TO_DECK",
  "ADD_OWN_CHARACTER_TO_LIFE",
]);

const REPLACEABLE_FIELD_EXIT_COST_TYPES = new Set<Cost["type"]>([
  "TRASH_SELF",
  "PLACE_SELF_TO_DECK",
  "PLACE_STAGE_TO_DECK",
  "TRASH_OWN_STAGE",
  "PLACE_SELF_AND_TRASH_TO_DECK",
  "PLACE_SELF_AND_HAND_TO_DECK",
  "KO_OWN_CHARACTER",
  "TRASH_OWN_CHARACTER",
  "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE",
  "RETURN_OWN_CHARACTER_TO_HAND",
  "PLACE_OWN_CHARACTER_TO_DECK",
  "ADD_OWN_CHARACTER_TO_LIFE",
]);

function isSelectionCost(cost: Cost): boolean {
  return SELECTION_COST_TYPES.has(cost.type) ||
    ((cost.type === "LIFE_TO_HAND" || cost.type === "TRASH_FROM_LIFE") &&
      cost.position === "TOP_OR_BOTTOM") ||
    ((cost.type === "REST_DON" || cost.type === "DON_REST") &&
      cost.amount === "ANY_NUMBER");
}

function restCostCanSelectSourceCharacter(cost: Cost): boolean {
  if (cost.type !== "REST_CARDS" || cost.filter?.exclude_self === true) {
    return false;
  }
  const rawCardTypes = cost.filter?.card_type;
  if (rawCardTypes === undefined) return true;
  const cardTypes = Array.isArray(rawCardTypes) ? rawCardTypes : [rawCardTypes];
  return cardTypes.some((cardType) => cardType.toUpperCase() === "CHARACTER");
}

function hasCurrentStrandingShape(
  schema: EffectSchema,
  costs: Cost[],
): boolean {
  const laterReplaceableExit = costs.some((cost, index) =>
    index > 0 && REPLACEABLE_FIELD_EXIT_COST_TYPES.has(cost.type)
  );
  const sequentialSelfOverlap = costs.some((cost, index) => {
    if (index === 0) return false;
    const prefix = costs.slice(0, index);
    if (cost.type === "TRASH_OWN_CHARACTER") {
      return cost.filter?.exclude_self !== true &&
        prefix.some((earlier) => earlier.type === "TRASH_SELF");
    }
    return schema.card_type === "Character" &&
      restCostCanSelectSourceCharacter(cost) &&
      prefix.some((earlier) => earlier.type === "REST_SELF");
  });
  return laterReplaceableExit || sequentialSelfOverlap;
}

describe("OPT-614 — transactional multi-cost payment", () => {
  it("rolls back fresh frames while legacy frames keep mutations and publish their events", () => {
    const cardDb = createTestCardDb();
    const state = withActiveDon(createBattleReadyState(cardDb), 3);
    const block: EffectBlock = {
      id: "opt614-decline",
      category: "activate",
      flags: { once_per_turn: true },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "REST_SELF" },
        { type: "REST_DON", amount: "ANY_NUMBER" },
      ],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };

    const prompted = offer(state, block, cardDb);
    expect(prompted.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(prompted.state.players[0].donCostArea.every((don) => don.state === "ACTIVE"))
      .toBe(true);

    const declined = resumeFromStack(
      prompted.state,
      { type: "PLAYER_CHOICE", choiceId: "skip" },
      cardDb,
    );
    expect(declined.state.players[0].donCostArea.every((don) => don.state === "ACTIVE"))
      .toBe(true);
    expect(declined.state.players[0].leader.state).toBe("ACTIVE");
    expect(declined.state.players[0].hand).toEqual(state.players[0].hand);
    expect(declined.state.turn.oncePerTurnUsed).toEqual(state.turn.oncePerTurnUsed);
    expect(declined.events).toEqual([]);

    const currentFrame = prompted.state.effectStack.at(-1)!;
    expect(currentFrame.costTransactionState).toBeDefined();
    const { costTransactionState, ...legacyFrame } = currentFrame;
    const legacyRoot = applyCostTransactionState(
      prompted.state,
      costTransactionState!,
    );
    const legacyPersisted = JSON.parse(JSON.stringify({
      ...legacyRoot,
      effectStack: [
        ...legacyRoot.effectStack.slice(0, -1),
        legacyFrame,
      ],
    })) as GameState;

    const legacyDeclined = resumeFromStack(
      legacyPersisted,
      { type: "PLAYER_CHOICE", choiceId: "skip" },
      cardDb,
    );
    expect(legacyDeclined.state.players[0].donCostArea.filter(
      (don) => don.state === "RESTED",
    )).toHaveLength(1);
    expect(legacyDeclined.state.players[0].leader.state).toBe("RESTED");
    expect(legacyDeclined.events.some((event) =>
      event.type === "CARD_STATE_CHANGED" &&
      event.payload?.targetInstanceId === state.players[0].leader.instanceId
    )).toBe(true);
  });

  it("restores a selected payment when a later cost becomes unpayable", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const source = state.players[0].characters[0]!;
    const block: EffectBlock = {
      id: "opt614-later-unpayable",
      category: "activate",
      flags: { once_per_turn: true },
      costs: [
        { type: "TRASH_OWN_CHARACTER", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };

    const prompted = offer(state, block, cardDb, source.instanceId);
    expect(prompted.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const abandoned = resumeFromStack(
      prompted.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [source.instanceId] },
      cardDb,
    );
    expect(abandoned.state.players[0].characters).toEqual(state.players[0].characters);
    expect(abandoned.state.players[0].trash).toEqual(state.players[0].trash);
    expect(abandoned.state.players[0].hand).toEqual(state.players[0].hand);
    expect(abandoned.state.turn.oncePerTurnUsed).toEqual(state.turn.oncePerTurnUsed);
    expect(abandoned.events).toEqual([]);
  });

  it("publishes staged cost events only after the complete chain commits", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const handCard = state.players[0].hand[0];
    const handBefore = state.players[0].hand.length;
    const trashBefore = state.players[0].trash.length;
    const block: EffectBlock = {
      id: "opt614-success",
      category: "activate",
      costs: [
        { type: "REST_SELF" },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };

    const prompted = offer(state, block, cardDb);
    expect(prompted.state.players[0].leader.state).toBe("ACTIVE");
    expect(prompted.events).toEqual([]);

    const restored = JSON.parse(JSON.stringify(prompted.state)) as GameState;
    const committed = resumeFromStack(
      restored,
      { type: "SELECT_TARGET", selectedInstanceIds: [handCard.instanceId] },
      cardDb,
    );
    expect(committed.state.players[0].leader.state).toBe("RESTED");
    expect(committed.state.players[0].hand).toHaveLength(handBefore);
    expect(committed.state.players[0].trash).toHaveLength(trashBefore + 1);
    expect(committed.events.some((event) =>
      event.type === "CARD_STATE_CHANGED" &&
      event.payload?.targetInstanceId === state.players[0].leader.instanceId
    )).toBe(true);
  });

  it("offers only amounts whose complete suffix can pay, then resolves the action", () => {
    const cardDb = createTestCardDb();
    const state = withActiveDon(createBattleReadyState(cardDb), 3);
    const handBefore = state.players[0].hand.length;
    const block: EffectBlock = {
      id: "opt614-sequential-feasibility",
      category: "activate",
      costs: [
        { type: "REST_DON", amount: "ANY_NUMBER" },
        { type: "REST_DON", amount: 1 },
        { type: "REST_DON", amount: 1 },
      ],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };

    const prompted = offer(state, block, cardDb);
    expect(prompted.pendingPrompt?.options).toMatchObject({
      promptType: "PLAYER_CHOICE",
      choices: [{ id: "don-rest:1", label: "Rest 1" }],
    });

    const committed = resumeFromStack(
      prompted.state,
      { type: "PLAYER_CHOICE", choiceId: "don-rest:1" },
      cardDb,
    );
    expect(committed.pendingPrompt).toBeUndefined();
    expect(committed.state.players[0].donCostArea.every((don) => don.state === "RESTED"))
      .toBe(true);
    expect(committed.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("keeps the authored multi-cost audit reproducible", () => {
    const mixedBlocks: string[] = [];
    const strandableCardIds = new Set<string>();

    for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) {
      for (const block of schema.effects) {
        const costs = block.costs ?? [];
        if (costs.length <= 1 || !costs.some(isSelectionCost)) continue;
        mixedBlocks.push(`${cardId}:${block.id}`);
        if (hasCurrentStrandingShape(schema, costs)) {
          strandableCardIds.add(cardId);
        }
      }
    }

    // When authored costs evolve, inspect every diff to this expectation and
    // update the PR/audit classification instead of accepting count drift.
    // OPT-727 adds OP17-057 Fullalead, OP17-077 Kundali Dragon Swarm, and
    // OP17-078 Drunken Dragon Bagua. Their selection costs use the
    // transactional path and add no stranding shape.
    expect(mixedBlocks).toHaveLength(58);
    expect([...strandableCardIds].sort()).toEqual([
      "EB01-011",
      "EB02-047",
      "EB03-062",
      "OP02-035",
      "OP04-055",
      "OP04-073",
      "OP05-089",
      "OP06-043",
      "OP09-089",
      "OP10-056",
      "OP15-039",
      "ST22-005",
      "ST25-004",
    ]);
  });
});
