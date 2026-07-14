import { describe, expect, it } from "vitest";
import type { Action, ActionType } from "../engine/effect-types.js";
import {
  buildActionCoverageInventory,
  collectAuthoredActionCounts,
  EXECUTED_ACTION_TYPES,
} from "../engine/action-coverage-contract.js";
import {
  executeActionChain,
  executeEffectAction,
  listRegisteredActionTypes,
} from "../engine/effect-resolver/resolver.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import {
  expireEndOfTurnEffects,
  processScheduledActions,
} from "../engine/duration-tracker.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function setup() {
  const cardDb = createTestCardDb();
  const state = createBattleReadyState(cardDb);
  return {
    state,
    cardDb,
    sourceId: state.players[0].leader.instanceId,
    opponentCharacter: state.players[1].characters.find(
      (card) => card !== null
    )!,
  };
}

describe("OPT-473 authored action inventory", () => {
  it("reports every authored action as handled and execution-tested", () => {
    const inventory = buildActionCoverageInventory(
      getAllAuthoredSchemas(),
      listRegisteredActionTypes()
    );

    expect(inventory.missingHandlers).toEqual([]);
    expect(inventory.missingExecutionTests).toEqual([]);
    expect(inventory.authoredUses).toBeGreaterThan(0);
    expect(inventory).toMatchObject({
      authoredTypes: expect.arrayContaining([...EXECUTED_ACTION_TYPES]),
      handledTypes: inventory.authoredTypes,
      executedTypes: inventory.authoredTypes,
    });
  });

  it("keeps the execution contract free of duplicate action types", () => {
    expect(new Set<ActionType>(EXECUTED_ACTION_TYPES).size).toBe(
      EXECUTED_ACTION_TYPES.length
    );
  });

  it("walks action containers on rule modifications", () => {
    const counts = collectAuthoredActionCounts({
      "RULE-MOD": {
        effects: [],
        rule_modifications: [
          {
            rule_type: "START_OF_GAME_EFFECT",
            actions: [
              {
                type: "SCHEDULE_ACTION",
                params: {
                  action: { type: "DRAW", params: { amount: 1 } },
                },
              },
            ],
          },
        ],
      },
    });

    expect(counts.get("SCHEDULE_ACTION")).toBe(1);
    expect(counts.get("DRAW")).toBe(1);
  });
});

describe("OPT-473 effects action handlers", () => {
  it("applies a player-level prohibition without a card target", () => {
    const { state, cardDb, sourceId } = setup();
    const result = executeActionChain(
      state,
      [
        {
          type: "APPLY_PROHIBITION",
          params: {
            prohibition_type: "CANNOT_PLAY_FROM_HAND",
            scope: { controller: "SELF" },
          },
          duration: { type: "THIS_TURN" },
        },
      ],
      sourceId,
      0,
      cardDb
    );

    expect(result.state.prohibitions.at(-1)).toMatchObject({
      sourceCardInstanceId: sourceId,
      prohibitionType: "CANNOT_PLAY_FROM_HAND",
      controller: 0,
      appliesTo: [],
      duration: { type: "THIS_TURN" },
    });
  });

  it("schedules an action and executes it at the requested timing", () => {
    const { state, cardDb, sourceId } = setup();
    const scheduled = executeActionChain(
      state,
      [
        {
          type: "SCHEDULE_ACTION",
          params: {
            timing: "END_OF_THIS_TURN",
            action: { type: "DRAW", params: { amount: 1 } },
          },
        },
      ],
      sourceId,
      0,
      cardDb
    );
    expect(scheduled.state.scheduledActions).toHaveLength(1);

    const due = processScheduledActions(scheduled.state, "END_OF_THIS_TURN");
    expect(due.state.scheduledActions).toEqual([]);
    expect(due.actionsToRun).toHaveLength(1);
    const handBefore = due.state.players[0].hand.length;
    const executed = executeActionChain(
      due.state,
      [due.actionsToRun[0].action],
      due.actionsToRun[0].sourceEffectId,
      due.actionsToRun[0].controller,
      cardDb
    );
    expect(executed.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("prompts, resumes, and expires action-form SET_COST", () => {
    const { state, cardDb, sourceId, opponentCharacter } = setup();
    const pending = executeActionChain(
      state,
      [
        {
          type: "SET_COST",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { value: 0 },
          duration: { type: "THIS_TURN" },
        },
      ],
      sourceId,
      0,
      cardDb
    );
    expect(pending.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const resumed = resumeFromStack(
      pending.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: [opponentCharacter.instanceId],
      },
      cardDb
    );
    expect(resumed.state.activeEffects.at(-1)).toMatchObject({
      appliesTo: [opponentCharacter.instanceId],
      modifiers: [{ type: "SET_COST", params: { value: 0 } }],
    });
    expect(expireEndOfTurnEffects(resumed.state).activeEffects).toHaveLength(0);
  });

  it("fails SET_COST cleanly when no target is selected", () => {
    const { state, cardDb, sourceId } = setup();
    const result = executeEffectAction(
      state,
      {
        type: "SET_COST",
        target: { type: "CHARACTER", controller: "OPPONENT" },
        params: { value: 0 },
      },
      sourceId,
      0,
      cardDb,
      new Map(),
      []
    );
    expect(result.succeeded).toBe(false);
    expect(result.state.activeEffects).toEqual(state.activeEffects);
  });

  it("wins through the resolver and emits a terminal event", () => {
    const { state, cardDb, sourceId } = setup();
    const result = executeActionChain(
      state,
      [{ type: "WIN_GAME" }],
      sourceId,
      0,
      cardDb
    );
    expect(result.state).toMatchObject({ status: "FINISHED", winner: 0 });
    expect(result.events).toContainEqual({
      type: "GAME_OVER",
      playerIndex: 0,
      payload: { reason: "card_effect" },
    });
  });

  it("registers trigger-type negation against the affected controller", () => {
    const { state, cardDb, sourceId } = setup();
    const result = executeActionChain(
      state,
      [
        {
          type: "NEGATE_TRIGGER_TYPE",
          params: {
            trigger_type: "ON_PLAY",
            affected_controller: "OPPONENT",
          },
          duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
        },
      ],
      sourceId,
      0,
      cardDb
    );
    expect(result.state.prohibitions.at(-1)).toMatchObject({
      prohibitionType: "CANNOT_ACTIVATE_ON_PLAY",
      controller: 1,
      scope: { triggerType: "ON_PLAY" },
      duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" },
    });
  });

  it("grants an extra turn and emits the public event", () => {
    const { state, cardDb, sourceId } = setup();
    const result = executeActionChain(
      state,
      [{ type: "EXTRA_TURN" }],
      sourceId,
      0,
      cardDb
    );
    expect(result.state.turn.extraTurnsPending).toBe(1);
    expect(result.events).toContainEqual({
      type: "EXTRA_TURN_GRANTED",
      playerIndex: state.turn.activePlayerIndex,
      payload: {},
    });
  });

  it("accepts and rejects one-time modifier registration by contract", () => {
    const { state, cardDb, sourceId } = setup();
    const valid: Action = {
      type: "APPLY_ONE_TIME_MODIFIER",
      params: {
        modification: { type: "MODIFY_COST", params: { amount: -1 } },
        applies_to: { action: "PLAY_CARD" },
      },
      duration: { type: "THIS_TURN" },
    };
    const applied = executeEffectAction(
      state,
      valid,
      sourceId,
      0,
      cardDb,
      new Map()
    );
    expect(applied.succeeded).toBe(true);
    expect(applied.state.oneTimeModifiers).toHaveLength(1);

    const rejected = executeEffectAction(
      state,
      { type: "APPLY_ONE_TIME_MODIFIER", params: {} } as unknown as Action,
      sourceId,
      0,
      cardDb,
      new Map()
    );
    expect(rejected.succeeded).toBe(false);
    expect(rejected.state.oneTimeModifiers).toEqual(state.oneTimeModifiers);
    expect(rejected.state.engineActionCount).toBe(1);
  });
});
