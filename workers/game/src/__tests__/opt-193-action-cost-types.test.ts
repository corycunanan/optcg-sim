import { describe, expect, it } from "vitest";
import type { CardData, GameState } from "../types.js";
import { ALL_COST_TYPES, type Cost } from "../engine/effect-types.js";
import {
  costNeedsPlayerSelection,
  isCostPayable,
} from "../engine/effect-resolver/cost-handler.js";
import { lifeCardToTargetCandidate } from "../engine/effect-resolver/target-resolver.js";
import { runPipeline } from "../engine/pipeline.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

describe("OPT-193 LifeCard target adapter", () => {
  it("preserves identity while making ownership and engine-only visibility explicit", () => {
    const candidate = lifeCardToTargetCandidate(
      { instanceId: "life-1", cardId: "SECRET-001", face: "DOWN" },
      { owner: 1, visibility: "ENGINE_INTERNAL" }
    );

    expect(candidate).toEqual({
      instanceId: "life-1",
      cardId: "SECRET-001",
      zone: "LIFE",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 1,
      owner: 1,
    });
  });
});

describe("OPT-193 exhaustive cost narrowing", () => {
  const cases = [
    { cost: { type: "DON_MINUS" }, needsSelection: false },
    { cost: { type: "DON_REST" }, needsSelection: false },
    { cost: { type: "VARIABLE_DON_RETURN" }, needsSelection: false },
    { cost: { type: "REST_SELF" }, needsSelection: false },
    { cost: { type: "TRASH_SELF" }, needsSelection: false },
    { cost: { type: "TRASH_FROM_HAND" }, needsSelection: true },
    {
      cost: { type: "TRASH_FROM_LIFE", position: "TOP_OR_BOTTOM" },
      needsSelection: true,
    },
    { cost: { type: "PLACE_HAND_TO_DECK" }, needsSelection: true },
    { cost: { type: "REVEAL_FROM_HAND" }, needsSelection: true },
    { cost: { type: "PLAY_NAMED_CARD_FROM_HAND" }, needsSelection: false },
    { cost: { type: "REST_CARDS" }, needsSelection: true },
    { cost: { type: "REST_NAMED_CARD" }, needsSelection: true },
    { cost: { type: "KO_OWN_CHARACTER" }, needsSelection: true },
    { cost: { type: "TRASH_OWN_CHARACTER" }, needsSelection: true },
    { cost: { type: "RETURN_OWN_CHARACTER_TO_HAND" }, needsSelection: true },
    { cost: { type: "PLACE_OWN_CHARACTER_TO_DECK" }, needsSelection: true },
    { cost: { type: "PLACE_SELF_TO_DECK" }, needsSelection: false },
    { cost: { type: "PLACE_STAGE_TO_DECK" }, needsSelection: false },
    { cost: { type: "ADD_OWN_CHARACTER_TO_LIFE" }, needsSelection: true },
    { cost: { type: "TRASH_OWN_STAGE" }, needsSelection: false },
    { cost: { type: "PLACE_FROM_TRASH_TO_DECK" }, needsSelection: true },
    { cost: { type: "LEADER_POWER_REDUCTION" }, needsSelection: false },
    { cost: { type: "GIVE_OPPONENT_DON" }, needsSelection: false },
    { cost: { type: "RETURN_ATTACHED_DON_TO_COST" }, needsSelection: false },
    { cost: { type: "PLACE_SELF_AND_HAND_TO_DECK" }, needsSelection: true },
    { cost: { type: "PLACE_SELF_AND_TRASH_TO_DECK" }, needsSelection: true },
    {
      cost: { type: "LIFE_TO_HAND", position: "TOP_OR_BOTTOM" },
      needsSelection: true,
    },
    { cost: { type: "REST_DON" }, needsSelection: false },
    { cost: { type: "TURN_LIFE_FACE_UP" }, needsSelection: false },
    { cost: { type: "TURN_LIFE_FACE_DOWN" }, needsSelection: false },
    { cost: { type: "CHOOSE_ONE_COST", options: [] }, needsSelection: true },
    { cost: { type: "CHOICE", options: [] }, needsSelection: false },
  ] satisfies Array<{ cost: Cost; needsSelection: boolean }>;

  it("classifies every Cost.type through the exhaustive selection switch", () => {
    expect(cases.map(({ cost }) => cost.type)).toEqual([...ALL_COST_TYPES]);
    for (const { cost, needsSelection } of cases) {
      expect(costNeedsPlayerSelection(cost), cost.type).toBe(needsSelection);
    }
  });

  it("narrows choice, choose-one, life-position, and any-number branches", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const sourceId = state.players[0].characters[0]!.instanceId;

    const payableCosts: Cost[] = [
      {
        type: "CHOICE",
        options: [
          [{ type: "DON_REST", amount: 99 }],
          [{ type: "TRASH_FROM_HAND", amount: 1 }],
        ],
      },
      {
        type: "CHOOSE_ONE_COST",
        options: [
          { type: "DON_REST", amount: 99 },
          { type: "REST_CARDS", amount: "ANY_NUMBER" },
        ],
      },
      { type: "LIFE_TO_HAND", amount: 1, position: "TOP_OR_BOTTOM" },
      { type: "TRASH_FROM_LIFE", amount: 1, position: "TOP_OR_BOTTOM" },
    ];

    for (const cost of payableCosts) {
      expect(isCostPayable(state, cost, 0, cardDb, sourceId), cost.type).toBe(
        true
      );
    }
  });
});

describe("OPT-193 modifier persistence through the production pipeline", () => {
  it("persists a typed power modifier from ACTIVATE_EFFECT", () => {
    const cardDb = createTestCardDb();
    const leader: CardData = {
      ...CARDS.LEADER,
      effectText:
        "[Activate: Main] This Leader gains +1000 power during this turn.",
      effectSchema: {
        card_id: CARDS.LEADER.id,
        card_name: CARDS.LEADER.name,
        card_type: "Leader",
        effects: [
          {
            id: "opt193_typed_modifier",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            actions: [
              {
                type: "MODIFY_POWER",
                target: { type: "SELF" },
                params: { amount: 1000 },
                duration: { type: "THIS_TURN" },
              },
            ],
          },
        ],
      },
    };
    cardDb.set(leader.id, leader);
    const state: GameState = createBattleReadyState(cardDb);
    const leaderInstance = state.players[0].leader;

    const result = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: leaderInstance.instanceId,
        effectId: "opt193_typed_modifier",
      },
      cardDb,
      0
    );

    expect(result.valid).toBe(true);
    expect(result.state.activeEffects.at(-1)).toMatchObject({
      sourceCardInstanceId: leaderInstance.instanceId,
      appliesTo: [leaderInstance.instanceId],
      modifiers: [
        {
          type: "MODIFY_POWER",
          params: { amount: 1000 },
          duration: { type: "THIS_TURN" },
        },
      ],
    });
    expect(
      getEffectivePower(leaderInstance, leader, result.state, cardDb)
    ).toBe(6000);
  });
});
