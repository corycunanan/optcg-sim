/**
 * OPT-963 version 3 fixtures.
 *
 * Version 3 moves the replacement and damage continuations into typed frames
 * (SAVED-STATE-COMPATIBILITY.md §8). PR 5a read it by lowering to version 2;
 * PR 5b (this build) raises the runtime to version 3 and lifts version 2
 * records into frames in `convertFromV2`. This module provides:
 *   - the version 2 golden cases whose records lift (`LIFTED_GOLDEN_CASES`),
 *     loaded through the real reader;
 *   - constructed version 3 shapes the lift cannot produce from a golden
 *     (a parent chain below an effect window, a Trigger effect in progress
 *     with remaining damage, nested effect windows, a batch substitute, an End
 *     Phase parked beneath a wave effect's window, deferred watchers).
 * Every state is SYNTHETIC (§7).
 */

import type {
  BattleDamageContinuation,
  EffectDamageContinuation,
  EffectStackFrame,
  GameState,
  QueuedTrigger,
} from "../../types.js";
import { CONTINUATION_EFFECT_BLOCK } from "../../engine/effect-stack.js";
import { convertPersistedGameState } from "../../session/persistence.js";
import { GAME_STATE_SCHEMA_VERSION_KEY } from "../../session/game-state-schema.js";
import { loadGoldenFixture, loadV2WriterGolden } from "./opt-940-golden.js";
import { CARDS } from "../helpers.js";

function continuationFrame(
  overrides: Partial<EffectStackFrame> & Pick<EffectStackFrame, "id" | "sourceCardInstanceId" | "controller" | "phase">
): EffectStackFrame {
  return {
    effectBlock: CONTINUATION_EFFECT_BLOCK,
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
    ...overrides,
  };
}

/** The version 3 persisted object of a runtime state (what this build's writer emits). */
export function persistedV3(state: GameState): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ [GAME_STATE_SCHEMA_VERSION_KEY]: 3, ...state })) as Record<string, unknown>;
}

/** The raw version 1 golden object of a case (base writer bytes). */
export function goldenV1Raw(name: string): Record<string, unknown> {
  const entry = loadGoldenFixture().cases[name];
  if (!entry) throw new Error(`no golden case named ${name}`);
  return (JSON.parse(entry.sessionJson) as { state: Record<string, unknown> }).state;
}

/** The raw version 2 golden object of a case (OPT-924 writer bytes). */
export function goldenV2Raw(name: string): Record<string, unknown> {
  const entry = loadV2WriterGolden().cases[name];
  if (!entry) throw new Error(`no version 2 golden case named ${name}`);
  return (JSON.parse(entry.sessionJson) as { state: Record<string, unknown> }).state;
}

/** A golden case loaded through the real reader (lifted to version 3). */
export function liftedGolden(name: string): GameState {
  return convertPersistedGameState(goldenV2Raw(name), "state");
}

/** Version 2 golden cases whose records lift into frames. */
export const LIFTED_GOLDEN_CASES = [
  "battle-trigger-window",
  "effect-damage-trigger-window",
  "both-trigger-windows",
  "replacement-prompt",
  "replacement-batch-prompt",
  "stuck-damage-step",
] as const;

export interface V3SyntheticState {
  name: string;
  shape: string;
  /** The version 3 runtime state (frames). */
  state: GameState;
}

function queuedTrigger(controller: 0 | 1): QueuedTrigger {
  return {
    sourceCardInstanceId: `char-${controller}-v1`,
    controller,
    effectBlock: { id: "v3-deferred", category: "auto", actions: [] },
    triggeringEvent: { type: "DAMAGE_DEALT", playerIndex: controller === 0 ? 1 : 0, payload: { amount: 1, attackerInstanceId: "x", attackerType: "LEADER" } },
  };
}

/** Lifted goldens plus constructed version 3 shapes. */
export function buildV3SyntheticStates(): V3SyntheticState[] {
  const states: V3SyntheticState[] = LIFTED_GOLDEN_CASES.map((name) => ({
    name,
    shape: `version 2 golden ${name} lifted to version 3`,
    state: liftedGolden(name),
  }));

  const battleWindow = liftedGolden("battle-trigger-window");
  const effectWindow = liftedGolden("effect-damage-trigger-window");
  const p0Char = battleWindow.players[0].characters[0]!.instanceId;
  const effectFrame = effectWindow.effectStack[0];
  const battleFrame = battleWindow.effectStack[0];

  // A chain paused on DEAL_DAMAGE below its EFFECT_DAMAGE frame (the OP06-116 shape).
  const parent = continuationFrame({
    id: "v3-parent-chain",
    sourceCardInstanceId: p0Char,
    controller: 0,
    phase: "INTERRUPTED_BY_TRIGGERS",
    pausedAction: { type: "DEAL_DAMAGE", params: { amount: 1 }, result_ref: "dmg" },
    remainingActions: [{ type: "LIFE_TO_HAND", params: { amount: 1 }, chain: "THEN" }],
    priorActionSucceeded: false,
  });
  states.push({
    name: "effect-window-with-parent-chain",
    shape: "EFFECT_DAMAGE at TRIGGER_WINDOW with its parent chain frame below",
    state: {
      ...effectWindow,
      effectStack: [parent, { ...effectFrame, effectDamage: { ...effectFrame.effectDamage!, parentFrameId: parent.id } }],
    },
  });

  // The Trigger's effect is prompting above the EFFECT_DAMAGE frame with one point still owed.
  const triggerFrame = continuationFrame({
    id: "v3-trigger-effect",
    sourceCardInstanceId: "life-golden-effect",
    controller: 1,
    phase: "AWAITING_TARGET_SELECTION",
    pausedAction: { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } },
    validTargets: [p0Char],
  });
  const triggerPrompt = {
    options: {
      promptType: "SELECT_TARGET" as const,
      cards: [],
      validTargets: [p0Char],
      effectDescription: "K.O. up to 1 Character",
      countMin: 0,
      countMax: 1,
      ctaLabel: "Confirm",
    },
    respondingPlayer: 1 as const,
    resumeContext: triggerFrame.id,
  };
  const effectInProgress: EffectDamageContinuation = {
    stage: "TRIGGER_EFFECT",
    damagedPlayerIndex: 1,
    remainingDamages: 1,
    dealt: 1,
    sourceCardInstanceId: p0Char,
    controllerIndex: 0,
    parentFrameId: parent.id,
    lifeCardInstanceId: "life-golden-effect",
  };
  states.push({
    name: "effect-trigger-effect-remaining",
    shape: "EFFECT_DAMAGE at TRIGGER_EFFECT with remaining damage, its Trigger effect prompting above, the parent chain below",
    state: {
      ...effectWindow,
      effectStack: [parent, { ...effectFrame, phase: "INTERRUPTED_BY_TRIGGERS", effectDamage: effectInProgress }, triggerFrame],
      pendingPrompt: triggerPrompt,
    },
  });

  states.push({
    name: "battle-window-deferred-triggers",
    shape: "BATTLE_DAMAGE at TRIGGER_WINDOW holding ordinary triggers deferred by rule 8-6-2",
    state: { ...battleWindow, effectStack: [{ ...battleFrame, pendingTriggers: [queuedTrigger(1)] }] },
  });

  const outerEffect = continuationFrame({
    id: "v3-effect-damage-outer",
    sourceCardInstanceId: p0Char,
    controller: 0,
    phase: "INTERRUPTED_BY_TRIGGERS",
    effectDamage: {
      stage: "TRIGGER_EFFECT",
      damagedPlayerIndex: 1,
      remainingDamages: 0,
      dealt: 1,
      sourceCardInstanceId: p0Char,
      controllerIndex: 0,
      lifeCardInstanceId: "life-golden-outer",
    },
  });
  const innerWindow: EffectDamageContinuation = {
    ...(effectFrame.effectDamage as Extract<EffectDamageContinuation, { stage: "TRIGGER_WINDOW" }>),
    damagedPlayerIndex: 0,
    controllerIndex: 1,
  };
  states.push({
    name: "nested-effect-windows",
    shape: "an EFFECT_DAMAGE window above another EFFECT_DAMAGE frame at TRIGGER_EFFECT (a Trigger effect dealt damage of its own)",
    state: {
      ...effectWindow,
      effectStack: [outerEffect, { ...effectFrame, id: "v3-effect-damage-inner", controller: 1, effectDamage: innerWindow }],
      pendingPrompt: { ...effectWindow.pendingPrompt!, respondingPlayer: 0, resumeContext: "v3-effect-damage-inner" },
    },
  });

  // A battle Trigger effect prompting above a BATTLE_DAMAGE frame: the retained Life removal
  // is unscanned or already scanned.
  for (const scanned of [false, true]) {
    const continuation: BattleDamageContinuation = {
      stage: "TRIGGER_EFFECT",
      battleId: battleWindow.turn.battle!.battleId,
      damagedPlayerIndex: 1,
      lifeCardInstanceId: "life-trigger-golden",
    };
    states.push({
      name: scanned ? "battle-trigger-effect-scanned" : "battle-trigger-effect-unscanned",
      shape: `BATTLE_DAMAGE at TRIGGER_EFFECT with the Life removal ${scanned ? "already scanned" : "retained unscanned"}`,
      state: {
        ...battleWindow,
        turn: { ...battleWindow.turn, battle: { ...battleWindow.turn.battle!, damagesRemaining: 0 } },
        effectStack: [
          {
            ...battleFrame,
            phase: "INTERRUPTED_BY_TRIGGERS",
            battleDamage: continuation,
            accumulatedEvents: [
              {
                type: "CARD_REMOVED_FROM_LIFE" as const,
                playerIndex: 1 as const,
                payload: { cardInstanceId: "life-trigger-golden" },
                propagation: scanned ? { eventLogEmitted: true as const, triggerScanned: true as const } : { eventLogEmitted: true as const },
              },
            ],
          },
          triggerFrame,
        ],
        pendingPrompt: triggerPrompt,
      },
    });
  }

  // A REPLACEMENT_BATCH frame waiting below its accepted substitute's prompt frame.
  const batchGolden = liftedGolden("replacement-batch-prompt");
  const batchFrame = batchGolden.effectStack[0];
  const substitute = continuationFrame({
    id: "v3-substitute",
    sourceCardInstanceId: p0Char,
    controller: 1,
    phase: "AWAITING_TARGET_SELECTION",
    pausedAction: { type: "TRASH_CARD", target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 } } },
    validTargets: batchGolden.players[1].hand.map((card) => card.instanceId),
  });
  states.push({
    name: "replacement-batch-substitute",
    shape: "REPLACEMENT_BATCH at INTERRUPTED_BY_TRIGGERS below an accepted substitute's prompt frame",
    state: {
      ...batchGolden,
      effectStack: [
        {
          ...batchFrame,
          phase: "INTERRUPTED_BY_TRIGGERS",
          replacementBatch: { ...batchFrame.replacementBatch!, protectedIds: batchFrame.replacementBatch!.allTargetIds.slice(0, 1) },
        },
        substitute,
      ],
      pendingPrompt: {
        ...triggerPrompt,
        options: { ...triggerPrompt.options, validTargets: substitute.validTargets, effectDescription: "Trash 1 card instead" },
        resumeContext: substitute.id,
      },
    },
  });

  // An End Phase parked beneath effect damage dealt by a wave effect (design note §5).
  const endPhase = convertPersistedGameState(goldenV1Raw("end-phase-parked"), "state");
  const phaseFrame = endPhase.effectStack.find((frame) => frame.phaseBoundaryContinuation)!;
  const waveParent = { ...parent, id: "v3-wave-parent", sourceCardInstanceId: endPhase.players[0].leader.instanceId };
  const waveFrame = continuationFrame({
    id: "v3-wave-effect-damage",
    sourceCardInstanceId: waveParent.sourceCardInstanceId,
    controller: 0,
    phase: "AWAITING_TRIGGER_REVEAL",
    effectDamage: {
      stage: "TRIGGER_WINDOW",
      damagedPlayerIndex: 1,
      remainingDamages: 0,
      dealt: 1,
      sourceCardInstanceId: waveParent.sourceCardInstanceId,
      controllerIndex: 0,
      parentFrameId: waveParent.id,
      lifeCard: { instanceId: "life-golden-wave", cardId: CARDS.TRIGGER.id, face: "DOWN" },
    },
  });
  states.push({
    name: "end-phase-below-effect-window",
    shape: "PHASE_BOUNDARY parked beneath a wave effect's chain and its EFFECT_DAMAGE window",
    state: {
      ...endPhase,
      effectStack: [phaseFrame, waveParent, waveFrame],
      pendingPrompt: { ...effectWindow.pendingPrompt!, resumeContext: waveFrame.id },
    },
  });

  return states;
}
