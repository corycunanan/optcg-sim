import { describe, expect, it } from "vitest";
import {
  getNestedActions,
  type Action,
  type EffectSchema,
  type RuntimeActiveEffect,
} from "../engine/effect-types.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { getEffectiveCost, getEffectivePower } from "../engine/modifiers.js";
import { getAllAuthoredSchemas, validateEffectSchema } from "../engine/schema-registry.js";
import type { CardInstance, GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function character(
  state: GameState,
  player: 0 | 1,
  handIndex: number,
  instanceId: string,
): CardInstance {
  return {
    ...state.players[player].hand[handIndex],
    instanceId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: player,
    owner: player,
  };
}

function withCharacters(
  state: GameState,
  player: 0 | 1,
  characters: CardInstance[],
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[player] = { ...players[player], characters: padChars(characters) };
  return { ...state, players };
}

function walkActions(schema: EffectSchema): Action[] {
  const found: Action[] = [];
  const visit = (actions: Action[]): void => {
    for (const action of actions) {
      found.push(action);
      visit(getNestedActions(action));
    }
  };
  for (const block of schema.effects) {
    if (block.actions) visit(block.actions);
    if (block.replacement_actions) visit(block.replacement_actions);
  }
  return found;
}

describe("OPT-472 simultaneous AND transactions", () => {
  it("locks eligibility against the group-start snapshot instead of observing prior writes", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const target = character(base, 1, 0, "snapshot-target");
    const state = withCharacters(base, 1, [target]);
    const targetData = cardDb.get(target.cardId)!;
    const common: Action[] = [
      {
        type: "MODIFY_POWER",
        target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
        params: { amount: 2000 },
        duration: { type: "THIS_TURN" },
      },
      {
        type: "MODIFY_COST",
        target: {
          type: "CHARACTER",
          controller: "OPPONENT",
          filter: { power_min: 6000 },
          count: { exact: 1 },
        },
        params: { amount: -1 },
        duration: { type: "THIS_TURN" },
      },
    ];

    const thenResult = executeActionChain(
      state,
      [common[0], { ...common[1], chain: "THEN" }],
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    const andResult = executeActionChain(
      state,
      [common[0], { ...common[1], chain: "AND" }],
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );

    expect(thenResult.state.activeEffects).toHaveLength(state.activeEffects.length + 2);
    expect(andResult.state.activeEffects).toHaveLength(state.activeEffects.length + 1);
    expect(getEffectivePower(target, targetData, andResult.state, cardDb)).toBe(targetData.power! + 2000);
  });

  it("collects every target choice before exposing any partially committed state", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    const first = character(state, 0, 0, "first-choice");
    const second = character(state, 0, 1, "second-choice");
    state = withCharacters(state, 0, [first, second]);
    const actions: Action[] = [
      {
        type: "MODIFY_POWER",
        target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 } },
        params: { amount: 1000 },
        duration: { type: "THIS_TURN" },
      },
      {
        type: "MODIFY_COST",
        target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 } },
        params: { amount: -1 },
        duration: { type: "THIS_TURN" },
        chain: "AND",
      },
    ];

    const firstPrompt = executeActionChain(
      state,
      actions,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(firstPrompt.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(firstPrompt.state.activeEffects).toHaveLength(state.activeEffects.length);

    const secondPrompt = resumeFromStack(
      firstPrompt.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [first.instanceId] },
      cardDb,
    );
    expect(secondPrompt.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(secondPrompt.state.activeEffects).toHaveLength(state.activeEffects.length);

    const committed = resumeFromStack(
      secondPrompt.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [second.instanceId] },
      cardDb,
    );
    expect(committed.resolved).toBe(true);
    expect(getEffectivePower(
      first,
      cardDb.get(first.cardId)!,
      committed.state,
      cardDb,
    )).toBe(cardDb.get(first.cardId)!.power! + 1000);
    expect(getEffectiveCost(
      cardDb.get(second.cardId)!,
      committed.state,
      second.instanceId,
      cardDb,
    )).toBe(cardDb.get(second.cardId)!.cost! - 1);
    expect(committed.state.effectStack).toHaveLength(0);
  });

  it("skips a complete AND group when its leading IF_DO dependency failed", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const result = executeActionChain(
      state,
      [
        {
          type: "MODIFY_POWER",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            filter: { base_cost_max: 0 },
          },
          params: { amount: 1000 },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: { amount: 1000 },
          chain: "IF_DO",
        },
        {
          type: "MODIFY_COST",
          target: { type: "YOUR_LEADER" },
          params: { amount: -1 },
          chain: "AND",
        },
      ],
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );

    expect(result.state.activeEffects).toHaveLength(state.activeEffects.length);
  });

  it("locks dynamic values against the group-start snapshot", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const rested = {
      ...character(base, 0, 0, "dynamic-source"),
      state: "RESTED" as const,
    };
    const state = withCharacters(base, 0, [rested]);
    const result = executeActionChain(
      state,
      [
        {
          type: "SET_ACTIVE",
          target: { type: "CHARACTER", controller: "SELF" },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "YOUR_LEADER" },
          params: {
            amount: { type: "GAME_STATE", source: "RESTED_CARD_COUNT" },
          },
          chain: "AND",
        },
      ],
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );

    expect(getEffectivePower(
      state.players[0].leader,
      cardDb.get(state.players[0].leader.cardId)!,
      result.state,
      cardDb,
    )).toBe(cardDb.get(state.players[0].leader.cardId)!.power! + 1);
  });

  it("resumes a locked multi-target member before committing its AND sibling", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    const first = character(state, 0, 0, "multi-first");
    const second = character(state, 0, 1, "multi-second");
    const third = character(state, 0, 2, "multi-third");
    state = withCharacters(state, 0, [first, second, third]);
    const pending = executeActionChain(
      state,
      [
        {
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "SELF", count: { exact: 2 } },
          params: { amount: 1000 },
        },
        {
          type: "MODIFY_COST",
          target: { type: "YOUR_LEADER" },
          params: { amount: -1 },
          chain: "AND",
        },
      ],
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(pending.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(pending.state.activeEffects).toHaveLength(state.activeEffects.length);

    const rejected = resumeFromStack(
      pending.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [] },
      cardDb,
    );
    expect(rejected.rejected).toBe(true);
    expect(rejected.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(rejected.state.activeEffects).toHaveLength(state.activeEffects.length);

    const committed = resumeFromStack(
      rejected.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [first.instanceId, second.instanceId] },
      cardDb,
    );
    expect(committed.resolved).toBe(true);
    const committedEffects = committed.state.activeEffects as RuntimeActiveEffect[];
    expect(committedEffects.at(-2)?.appliesTo).toEqual([
      first.instanceId,
      second.instanceId,
    ]);
    expect(committedEffects.at(-1)?.appliesTo).toEqual([
      state.players[0].leader.instanceId,
    ]);
  });

});

describe("OPT-472 connector validation and authored migration", () => {
  it("rejects unsupported AND actions and same-group result dependencies", () => {
    const unsupported: EffectSchema = {
      effects: [{
        id: "unsupported",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [
          { type: "MODIFY_POWER", target: { type: "YOUR_LEADER" }, params: { amount: 1000 } },
          { type: "DRAW", params: { amount: 1 }, chain: "AND" },
        ],
      }],
    };
    const dependent: EffectSchema = {
      effects: [{
        id: "dependent",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [
          {
            type: "MODIFY_POWER",
            target: { type: "YOUR_LEADER" },
            params: { amount: 1000 },
            result_ref: "inside",
          },
          {
            type: "SET_REST",
            target_ref: "inside",
            chain: "AND",
          },
        ],
      }],
    };

    expect(validateEffectSchema(unsupported).join("\n")).toContain(
      "Action type 'DRAW' cannot be used in an AND transaction",
    );
    expect(validateEffectSchema(dependent).join("\n")).toContain(
      "depends on result_ref 'inside' produced inside the same simultaneous group",
    );

    const nestedConsumers: Action[] = [
      {
        type: "MODIFY_COST",
        target: { type: "YOUR_LEADER" },
        params: { amount: { type: "ACTION_RESULT", ref: "inside" } },
        chain: "AND",
      },
      {
        type: "MODIFY_COST",
        target: { type: "YOUR_LEADER" },
        params: { amount: -1 },
        conditions: {
          type: "REVEALED_CARD_PROPERTY",
          result_ref: "inside",
          filter: { card_type: "CHARACTER" },
        },
        chain: "AND",
      },
      {
        type: "MODIFY_COST",
        target: {
          type: "CHARACTER",
          count: { exact: 1 },
          filter: { exclude_ref: "inside" },
        },
        params: { amount: -1 },
        chain: "AND",
      },
    ];
    for (const consumer of nestedConsumers) {
      const nestedDependent: EffectSchema = {
        effects: [{
          id: "nested-dependent",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [dependent.effects[0]!.actions![0]!, consumer],
        }],
      };
      expect(validateEffectSchema(nestedDependent).join("\n")).toContain(
        "depends on result_ref 'inside' produced inside the same simultaneous group",
      );
    }

    const valid: EffectSchema = {
      effects: [{
        id: "valid",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [
          {
            type: "MODIFY_POWER",
            target: { type: "YOUR_LEADER" },
            params: { amount: 1000 },
          },
          {
            type: "MODIFY_COST",
            target: { type: "YOUR_LEADER" },
            params: { amount: -1 },
            chain: "AND",
          },
        ],
      }],
    };
    expect(validateEffectSchema(valid)).toEqual([]);
  });

  it("classifies every formerly-authored AND as ordered THEN", () => {
    const authoredActions = Object.values(getAllAuthoredSchemas()).flatMap(walkActions);
    expect(authoredActions.filter((action) => action.chain === "AND")).toEqual([]);
    expect(authoredActions.filter((action) => action.chain === "THEN").length).toBeGreaterThanOrEqual(626);
  });
});
