/**
 * OPT-963 (PR 5a) version 3 reader fixtures.
 *
 * Version 3 moves the replacement and damage continuations into typed frames
 * (SAVED-STATE-COMPATIBILITY.md §8). This module builds the version 3 shape
 * of every version 2 record the engine writes today, by lifting the real
 * engine states of the OPT-940 golden into the frames PR 5b will write, plus
 * constructed shapes for every degraded lowering (§1.7). Every state here is
 * SYNTHETIC (§7). `liftToVersion3` is the fixture-side statement of the PR 5b
 * lifter: PR 5b's drift test holds the engine to it.
 */

import type {
  BattleDamageContinuation,
  CardInstance,
  EffectDamageContinuation,
  EffectStackFrame,
  GameState,
  LifeCard,
  PendingEvent,
  QueuedTrigger,
} from "../../types.js";
import type { ReplacementBatchResumeContext, ReplacementResumeContext } from "../../engine/replacements.js";
import { CONTINUATION_EFFECT_BLOCK } from "../../engine/effect-stack.js";
import { convertPersistedGameState } from "../../session/persistence.js";
import { GAME_STATE_SCHEMA_VERSION_KEY } from "../../session/game-state-schema.js";
import { loadGoldenFixture } from "./opt-940-golden.js";
import { CARDS } from "../helpers.js";

export const V3_FRAME_ID = {
  replacement: "v3-replacement",
  replacementBatch: "v3-replacement-batch",
  battleDamage: "v3-battle-damage",
  effectDamage: "v3-effect-damage",
} as const;

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

/** The version 2 coordinator's fallback REVEAL_TRIGGER description (coordinator.ts surfaceRevealTrigger). */
export const REVEAL_FALLBACK_DESCRIPTION = "You may reveal this Trigger card to activate its effect";

/** The prompt card the version 2 coordinator builds for a Trigger window (coordinator.ts surfaceRevealTrigger). */
export function revealPromptCard(lifeCard: LifeCard, responder: 0 | 1): CardInstance {
  return {
    instanceId: lifeCard.instanceId,
    cardId: lifeCard.cardId,
    zone: "LIFE",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: responder,
    owner: responder,
  };
}

function isReplacementContext(value: unknown): value is ReplacementResumeContext {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "REPLACEMENT";
}

function isBatchContext(value: unknown): value is ReplacementBatchResumeContext {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "REPLACEMENT_BATCH";
}

/**
 * Lift a version 2 runtime state into the version 3 frame shape (§8, "5b"):
 *   - `battle.pendingTriggerLifeCard` and `pendingBattleDamageContinuation`
 *     become one BATTLE_DAMAGE frame and `pendingTriggerFromEffect` an
 *     EFFECT_DAMAGE frame, inserted at the bottom of the stack in the order
 *     they opened (version 2 surfaced them only once the stack emptied);
 *   - a REPLACEMENT / REPLACEMENT_BATCH prompt context becomes a frame on top
 *     that owns the prompt;
 *   - a frame's `replacementBatchContinuation` becomes a REPLACEMENT_BATCH
 *     frame at INTERRUPTED_BY_TRIGGERS directly below that frame.
 * The two Trigger windows of `both-trigger-windows` nest (battle below, effect
 * above) and the prompt is re-pointed at the top frame's responder.
 */
export function liftToVersion3(state: GameState): GameState {
  const bottom: EffectStackFrame[] = [];
  const { turn } = state;
  const battle = turn.battle;
  let prompt = state.pendingPrompt;

  // The surfaced REVEAL_TRIGGER prompt belongs to the top-most window frame
  // (the one that opened last): with both windows open, the effect window.
  // A prompt re-pointed at another window is rebuilt from that window's own
  // Life card (never another player's card).
  const windowPrompt = (frame: EffectStackFrame, responder: 0 | 1, lifeCard: LifeCard) => {
    if (prompt?.options.promptType !== "REVEAL_TRIGGER") return;
    const shown = prompt.options.cards[0];
    const sameCard = prompt.respondingPlayer === responder && (!shown || shown.instanceId === lifeCard.instanceId);
    prompt = {
      ...prompt,
      respondingPlayer: responder,
      resumeContext: frame.id,
      options: sameCard
        ? prompt.options
        : { ...prompt.options, cards: [revealPromptCard(lifeCard, responder)], effectDescription: REVEAL_FALLBACK_DESCRIPTION },
    };
  };

  if (battle?.pendingTriggerLifeCard) {
    const damagedPlayerIndex: 0 | 1 = turn.activePlayerIndex === 0 ? 1 : 0;
    const battleDamage: BattleDamageContinuation = {
      stage: "TRIGGER_WINDOW",
      battleId: battle.battleId,
      damagedPlayerIndex,
      lifeCard: battle.pendingTriggerLifeCard,
    };
    const frame = continuationFrame({
      id: V3_FRAME_ID.battleDamage,
      sourceCardInstanceId: battle.attackerInstanceId,
      controller: turn.activePlayerIndex,
      phase: "AWAITING_TRIGGER_REVEAL",
      battleDamage,
    });
    bottom.push(frame);
    windowPrompt(frame, damagedPlayerIndex, battle.pendingTriggerLifeCard);
  }
  const continuation = turn.pendingBattleDamageContinuation;
  if (continuation) {
    const battleDamage: BattleDamageContinuation =
      continuation.stage === "CHARACTER_KO_REPLACEMENT"
        ? {
            stage: "CHARACTER_KO_REPLACEMENT",
            battleId: continuation.battleId,
            targetInstanceId: continuation.targetInstanceId,
            ...(continuation.replacementEffectId !== undefined
              ? { replacementEffectId: continuation.replacementEffectId }
              : {}),
            causingPlayerIndex: continuation.causingPlayerIndex,
            attackerIsCharacter: continuation.attackerIsCharacter,
            ...(continuation.resolution !== undefined ? { resolution: continuation.resolution } : {}),
          }
        : {
            stage: "TRIGGER_EFFECT",
            battleId: continuation.battleId,
            damagedPlayerIndex: continuation.damagedPlayerIndex,
            lifeCardInstanceId: continuation.lifeCardInstanceId,
          };
    bottom.push(
      continuationFrame({
        id: V3_FRAME_ID.battleDamage,
        sourceCardInstanceId: battle?.attackerInstanceId ?? "",
        controller: turn.activePlayerIndex,
        phase: "INTERRUPTED_BY_TRIGGERS",
        battleDamage,
        accumulatedEvents:
          continuation.stage === "LIFE_REMOVAL"
            ? [
                {
                  type: "CARD_REMOVED_FROM_LIFE",
                  playerIndex: continuation.damagedPlayerIndex,
                  payload: { cardInstanceId: continuation.lifeCardInstanceId },
                  propagation: { eventLogEmitted: true },
                },
              ]
            : [],
      })
    );
  }
  const effectWindow = turn.pendingTriggerFromEffect;
  if (effectWindow) {
    const effectDamage: EffectDamageContinuation = {
      stage: "TRIGGER_WINDOW",
      damagedPlayerIndex: effectWindow.damagedPlayerIndex,
      remainingDamages: effectWindow.remainingDamages,
      dealt: 0,
      sourceCardInstanceId: effectWindow.sourceCardInstanceId,
      controllerIndex: effectWindow.controllerIndex,
      lifeCard: effectWindow.lifeCard,
    };
    const frame = continuationFrame({
      id: V3_FRAME_ID.effectDamage,
      sourceCardInstanceId: effectWindow.sourceCardInstanceId,
      controller: effectWindow.controllerIndex,
      phase: "AWAITING_TRIGGER_REVEAL",
      effectDamage,
    });
    bottom.push(frame);
    windowPrompt(frame, effectWindow.damagedPlayerIndex, effectWindow.lifeCard);
  }

  const middle: EffectStackFrame[] = [];
  for (const frame of state.effectStack) {
    const rider = frame.replacementBatchContinuation;
    if (rider) {
      const { type: _type, ...replacementBatch } = rider;
      middle.push(
        continuationFrame({
          id: V3_FRAME_ID.replacementBatch,
          sourceCardInstanceId: frame.sourceCardInstanceId,
          controller: rider.causingController,
          phase: "INTERRUPTED_BY_TRIGGERS",
          replacementBatch,
        })
      );
      const { replacementBatchContinuation: _rider, ...rest } = frame;
      middle.push(rest);
    } else {
      middle.push(frame);
    }
  }

  const top: EffectStackFrame[] = [];
  if (prompt && isReplacementContext(prompt.resumeContext)) {
    const { effectId, targetInstanceId, event } = prompt.resumeContext;
    const effect = state.activeEffects.find((candidate) => candidate.id === effectId);
    top.push(
      continuationFrame({
        id: V3_FRAME_ID.replacement,
        sourceCardInstanceId: effect?.sourceCardInstanceId ?? targetInstanceId,
        controller: prompt.respondingPlayer,
        phase: "AWAITING_OPTIONAL_RESPONSE",
        replacement: { effectId, targetInstanceId, event },
      })
    );
    prompt = { ...prompt, resumeContext: V3_FRAME_ID.replacement };
  } else if (prompt && isBatchContext(prompt.resumeContext)) {
    const { type: _type, ...replacementBatch } = prompt.resumeContext;
    top.push(
      continuationFrame({
        id: V3_FRAME_ID.replacementBatch,
        sourceCardInstanceId: replacementBatch.allTargetIds[0] ?? "",
        controller: prompt.respondingPlayer,
        phase: "AWAITING_OPTIONAL_RESPONSE",
        replacementBatch,
      })
    );
    prompt = { ...prompt, resumeContext: V3_FRAME_ID.replacementBatch };
  }

  const { pendingTriggerFromEffect: _effect, pendingBattleDamageContinuation: _cont, ...turnRest } = turn;
  const { pendingTriggerLifeCard: _life, ...battleRest } = battle ?? {};
  return {
    ...state,
    turn: { ...turnRest, battle: battle ? (battleRest as NonNullable<GameState["turn"]["battle"]>) : null },
    effectStack: [...bottom, ...middle, ...top],
    pendingPrompt: prompt,
  };
}

/** The version 3 persisted object of a runtime state (what the PR 5b writer emits). */
export function persistedV3(state: GameState): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ [GAME_STATE_SCHEMA_VERSION_KEY]: 3, ...state })) as Record<string, unknown>;
}

export function goldenV2State(name: string): GameState {
  const entry = loadGoldenFixture().cases[name];
  if (!entry) throw new Error(`no golden case named ${name}`);
  const raw = (JSON.parse(entry.sessionJson) as { state: unknown }).state;
  return convertPersistedGameState(raw, "state");
}

/** Golden version 2 cases whose records lift losslessly to version 3 and lower back to themselves. */
export const LOSSLESS_GOLDEN_CASES = [
  "battle-trigger-window",
  "effect-damage-trigger-window",
  "replacement-prompt",
  "replacement-batch-prompt",
  "stuck-damage-step",
] as const;

export interface V3SyntheticState {
  name: string;
  shape: string;
  /** The version 3 runtime state (frames). */
  state: GameState;
  /** The version 2 runtime state the 5a reader must lower it to. */
  lowered: GameState;
  /** Lowering reports the 5a reader must log, in stack order. */
  reports: string[];
}

function queuedTrigger(controller: 0 | 1): QueuedTrigger {
  return {
    sourceCardInstanceId: `char-${controller}-v1`,
    controller,
    effectBlock: { id: "v3-deferred", category: "auto", actions: [] },
    triggeringEvent: { type: "DAMAGE_DEALT", playerIndex: controller === 0 ? 1 : 0, payload: { amount: 1, attackerInstanceId: "x", attackerType: "LEADER" } },
  };
}

/** Constructed version 3 shapes beyond the goldens: nested frames, parents, and every degraded lowering. */
export function buildV3SyntheticStates(): V3SyntheticState[] {
  const states: V3SyntheticState[] = [];
  for (const name of LOSSLESS_GOLDEN_CASES) {
    const lowered = goldenV2State(name);
    const state = liftToVersion3(lowered);
    const kinds = state.effectStack.map((frame) =>
      frame.replacement ? "lowered.replacement"
        : frame.replacementBatch ? "lowered.replacement_batch"
        : frame.battleDamage ? "lowered.battle_damage"
        : "lowered.effect_damage"
    );
    states.push({ name, shape: `golden ${name} lifted to version 3`, state, lowered, reports: kinds });
  }

  const battleWindow = goldenV2State("battle-trigger-window");
  const effectWindow = goldenV2State("effect-damage-trigger-window");
  const liftedBattle = liftToVersion3(battleWindow);
  const liftedEffect = liftToVersion3(effectWindow);
  const p0Char = battleWindow.players[0].characters[0]!.instanceId;

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
  const effectFrame = liftedEffect.effectStack[0];
  const withParent: GameState = {
    ...liftedEffect,
    effectStack: [parent, { ...effectFrame, effectDamage: { ...effectFrame.effectDamage!, parentFrameId: parent.id } }],
  };
  states.push({
    name: "effect-window-with-parent-chain",
    shape: "EFFECT_DAMAGE at TRIGGER_WINDOW with its parent chain frame below (version 2 has no chain pause here: the parent is dropped)",
    state: withParent,
    lowered: effectWindow,
    reports: ["lowered.effect_damage_parent_dropped", "lowered.effect_damage"],
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
  states.push({
    name: "effect-trigger-effect-remaining",
    shape: "EFFECT_DAMAGE at TRIGGER_EFFECT with remaining damage, its Trigger effect prompting above, the parent chain below (version 2 abandons the remaining point; the parent stays, its lifecycle drains it)",
    state: {
      ...effectWindow,
      turn: { ...effectWindow.turn, pendingTriggerFromEffect: undefined },
      effectStack: [parent, { ...effectFrame, phase: "INTERRUPTED_BY_TRIGGERS", effectDamage: effectInProgress }, triggerFrame],
      pendingPrompt: triggerPrompt,
    },
    lowered: {
      ...effectWindow,
      turn: { ...effectWindow.turn, pendingTriggerFromEffect: undefined },
      effectStack: [parent, triggerFrame],
      pendingPrompt: triggerPrompt,
    },
    reports: ["lowered.effect_damage_remaining_dropped", "lowered.effect_damage"],
  });

  // Battle window with rule 8-6-2 deferred watchers queued on the frame.
  const battleFrame = liftedBattle.effectStack[0];
  states.push({
    name: "battle-window-deferred-triggers",
    shape: "BATTLE_DAMAGE at TRIGGER_WINDOW holding rule 8-6-2 deferred watchers (version 2 fires watchers only from its own Step 5: after a rollback these never fire; dropped and classified)",
    state: { ...liftedBattle, effectStack: [{ ...battleFrame, pendingTriggers: [queuedTrigger(1)] }] },
    lowered: battleWindow,
    reports: ["lowered.deferred_triggers_dropped", "lowered.battle_damage"],
  });

  // Two effect windows nested (a Trigger effect dealt effect damage of its own).
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
  const innerLifted = liftToVersion3({
    ...effectWindow,
    turn: {
      ...effectWindow.turn,
      pendingTriggerFromEffect: { ...effectWindow.turn.pendingTriggerFromEffect!, damagedPlayerIndex: 0, controllerIndex: 1 },
    },
    pendingPrompt: { ...effectWindow.pendingPrompt!, respondingPlayer: 0 },
  });
  const innerFrame = innerLifted.effectStack[0];
  states.push({
    name: "nested-effect-windows",
    shape: "an EFFECT_DAMAGE window above another at TRIGGER_EFFECT (the outer is draining its Trigger; both lower, nothing dropped)",
    state: { ...innerLifted, effectStack: [outerEffect, innerFrame] },
    lowered: {
      ...effectWindow,
      turn: {
        ...effectWindow.turn,
        pendingTriggerFromEffect: { ...effectWindow.turn.pendingTriggerFromEffect!, damagedPlayerIndex: 0, controllerIndex: 1 },
      },
      pendingPrompt: { ...effectWindow.pendingPrompt!, respondingPlayer: 0 },
    },
    reports: ["lowered.effect_damage", "lowered.effect_damage"],
  });

  // A battle window whose battle is gone (constructed; no engine path writes it).
  states.push({
    name: "orphan-battle-window",
    shape: "BATTLE_DAMAGE at TRIGGER_WINDOW naming another battle (version 2 keeps the Life card on the battle: dropped)",
    state: {
      ...liftedBattle,
      effectStack: [{ ...battleFrame, battleDamage: { ...battleFrame.battleDamage!, battleId: "another-battle" } as BattleDamageContinuation }],
    },
    lowered: {
      ...battleWindow,
      turn: { ...battleWindow.turn, battle: { ...battleWindow.turn.battle!, pendingTriggerLifeCard: undefined } },
    },
    reports: ["lowered.orphan_battle_damage_dropped"],
  });

  // A battle Trigger effect prompting above a BATTLE_DAMAGE frame: the retained Life removal
  // is unscanned (version 2 LIFE_REMOVAL) or already scanned (version 2 DAMAGE).
  const battleTriggerEffectBase = (scanned: boolean): GameState => {
    const continuation = {
      battleId: battleWindow.turn.battle!.battleId,
      lifeCardInstanceId: "life-trigger-golden",
      damagedPlayerIndex: 1 as const,
      stage: scanned ? ("DAMAGE" as const) : ("LIFE_REMOVAL" as const),
    };
    return {
      ...battleWindow,
      turn: {
        ...battleWindow.turn,
        battle: { ...battleWindow.turn.battle!, pendingTriggerLifeCard: undefined, damagesRemaining: 0 },
        pendingBattleDamageContinuation: continuation,
      },
      effectStack: [triggerFrame],
      pendingPrompt: triggerPrompt,
    };
  };
  for (const scanned of [false, true]) {
    const lowered = battleTriggerEffectBase(scanned);
    const lifted = liftToVersion3(lowered);
    const frame = lifted.effectStack[0];
    const state = scanned
      ? {
          ...lifted,
          effectStack: [
            {
              ...frame,
              accumulatedEvents: [
                {
                  type: "CARD_REMOVED_FROM_LIFE" as const,
                  playerIndex: 1 as const,
                  payload: { cardInstanceId: "life-trigger-golden" },
                  propagation: { eventLogEmitted: true as const, triggerScanned: true as const },
                },
              ],
            },
            ...lifted.effectStack.slice(1),
          ],
        }
      : lifted;
    states.push({
      name: scanned ? "battle-trigger-effect-scanned" : "battle-trigger-effect-unscanned",
      shape: `BATTLE_DAMAGE at TRIGGER_EFFECT with the Life removal ${scanned ? "already scanned (version 2 DAMAGE)" : "retained unscanned (version 2 LIFE_REMOVAL)"}`,
      state,
      lowered,
      reports: ["lowered.battle_damage"],
    });
  }

  // The version 2 rider on a substitute's frame becomes a REPLACEMENT_BATCH frame below it.
  const batchGolden = goldenV2State("replacement-batch-prompt");
  const batchContext = batchGolden.pendingPrompt!.resumeContext as ReplacementBatchResumeContext;
  const substitute = continuationFrame({
    id: "v3-substitute",
    sourceCardInstanceId: p0Char,
    controller: 1,
    phase: "AWAITING_TARGET_SELECTION",
    pausedAction: { type: "TRASH_CARD", target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 } } },
    validTargets: batchGolden.players[1].hand.map((card) => card.instanceId),
    replacementBatchContinuation: { ...batchContext, protectedIds: batchContext.allTargetIds.slice(0, 1) },
  });
  const substitutePrompt = {
    ...triggerPrompt,
    options: { ...triggerPrompt.options, validTargets: substitute.validTargets, countMin: 1, countMax: 1, effectDescription: "Trash 1 card instead" },
    resumeContext: substitute.id,
  };
  const batchLowered: GameState = { ...batchGolden, effectStack: [substitute], pendingPrompt: substitutePrompt };
  states.push({
    name: "replacement-batch-substitute",
    shape: "REPLACEMENT_BATCH at INTERRUPTED_BY_TRIGGERS below an accepted substitute's prompt frame (version 2: the rider on that frame)",
    state: liftToVersion3(batchLowered),
    lowered: batchLowered,
    reports: ["lowered.replacement_batch"],
  });

  // An End Phase parked beneath effect damage dealt by a wave effect (§5 of the design note).
  const endPhase = goldenV2State("end-phase-parked");
  const phaseFrame = endPhase.effectStack.find((frame) => frame.phaseBoundaryContinuation)!;
  const waveParent = { ...parent, id: "v3-wave-parent", sourceCardInstanceId: endPhase.players[0].leader.instanceId };
  const waveEffect: EffectDamageContinuation = {
    stage: "TRIGGER_WINDOW",
    damagedPlayerIndex: 1,
    remainingDamages: 0,
    dealt: 1,
    sourceCardInstanceId: waveParent.sourceCardInstanceId,
    controllerIndex: 0,
    parentFrameId: waveParent.id,
    lifeCard: { instanceId: "life-golden-wave", cardId: CARDS.TRIGGER.id, face: "DOWN" },
  };
  const waveFrame = continuationFrame({
    id: V3_FRAME_ID.effectDamage,
    sourceCardInstanceId: waveParent.sourceCardInstanceId,
    controller: 0,
    phase: "AWAITING_TRIGGER_REVEAL",
    effectDamage: waveEffect,
  });
  const wavePrompt = { ...effectWindow.pendingPrompt!, resumeContext: waveFrame.id };
  states.push({
    name: "end-phase-below-effect-window",
    shape: "PHASE_BOUNDARY parked beneath a wave effect's chain and its EFFECT_DAMAGE window",
    state: { ...endPhase, effectStack: [phaseFrame, waveParent, waveFrame], pendingPrompt: wavePrompt },
    lowered: {
      ...endPhase,
      turn: {
        ...endPhase.turn,
        pendingTriggerFromEffect: {
          lifeCard: waveEffect.lifeCard,
          damagedPlayerIndex: 1,
          remainingDamages: 0,
          sourceCardInstanceId: waveEffect.sourceCardInstanceId,
          controllerIndex: 0,
        },
      },
      effectStack: [phaseFrame],
      pendingPrompt: { ...wavePrompt, resumeContext: null },
    },
    reports: ["lowered.effect_damage_parent_dropped", "lowered.effect_damage"],
  });

  // Both Trigger windows (golden): the lowering keeps the two version 2 records
  // and gives the battle defender their own prompt, rebuilt from the battle
  // Life card (OPT-974 base deadlock, no hidden-information leak).
  const bothGolden = goldenV2State("both-trigger-windows");
  const bothLifted = liftToVersion3(bothGolden);
  const bothBattleCard = bothGolden.turn.battle!.pendingTriggerLifeCard!;
  states.push({
    name: "both-trigger-windows",
    shape: "golden both-trigger-windows lifted to nested frames (battle below, effect above, the prompt on the effect window)",
    state: bothLifted,
    lowered: {
      ...bothGolden,
      pendingPrompt: {
        ...bothGolden.pendingPrompt!,
        respondingPlayer: bothGolden.turn.activePlayerIndex === 0 ? 1 : 0,
        resumeContext: null,
        options: {
          promptType: "REVEAL_TRIGGER",
          cards: [revealPromptCard(bothBattleCard, bothGolden.turn.activePlayerIndex === 0 ? 1 : 0)],
          effectDescription: REVEAL_FALLBACK_DESCRIPTION,
          optional: false,
          timeoutMs: 30_000,
        },
      },
    },
    reports: ["lowered.battle_damage", "lowered.effect_damage"],
  });

  // CHARACTER_KO_REPLACEMENT with both optional fields (OPT-884's evidence): lifted and lowered intact.
  const stuck = goldenV2State("stuck-damage-step");
  const stuckRecord = stuck.turn.pendingBattleDamageContinuation!;
  if (stuckRecord.stage !== "CHARACTER_KO_REPLACEMENT") throw new Error("stuck-damage-step golden is not a K.O. replacement");
  const koWithFields: GameState = {
    ...stuck,
    turn: {
      ...stuck.turn,
      pendingBattleDamageContinuation: { ...stuckRecord, replacementEffectId: "ko-replacement-effect", resolution: "REPLACED" },
    },
  };
  states.push({
    name: "battle-ko-replacement-fields",
    shape: "BATTLE_DAMAGE at CHARACTER_KO_REPLACEMENT carrying replacementEffectId and resolution (lossless, every field)",
    state: liftToVersion3(koWithFields),
    lowered: koWithFields,
    reports: ["lowered.battle_damage"],
  });

  // Two effect windows both open: the outer window's record is the one version 2 loses.
  const outerOpen = continuationFrame({
    id: "v3-effect-window-outer",
    sourceCardInstanceId: p0Char,
    controller: 0,
    phase: "AWAITING_TRIGGER_REVEAL",
    effectDamage: {
      stage: "TRIGGER_WINDOW",
      damagedPlayerIndex: 1,
      remainingDamages: 1,
      dealt: 1,
      sourceCardInstanceId: p0Char,
      controllerIndex: 0,
      lifeCard: { instanceId: "life-golden-outer", cardId: CARDS.TRIGGER.id, face: "DOWN" },
    },
  });
  states.push({
    name: "nested-effect-windows-both-open",
    shape: "an EFFECT_DAMAGE window at TRIGGER_WINDOW above another at TRIGGER_WINDOW (version 2 has one slot: the outer window is dropped)",
    state: { ...innerLifted, effectStack: [outerOpen, innerFrame] },
    lowered: {
      ...effectWindow,
      turn: {
        ...effectWindow.turn,
        pendingTriggerFromEffect: { ...effectWindow.turn.pendingTriggerFromEffect!, damagedPlayerIndex: 0, controllerIndex: 1 },
      },
      pendingPrompt: { ...effectWindow.pendingPrompt!, respondingPlayer: 0 },
    },
    reports: ["lowered.effect_damage", "lowered.second_effect_damage_dropped", "lowered.effect_damage"],
  });

  // A batch waiting on top with nothing above it (transient: substitute finished, batch not yet continued).
  const batchOnTop = liftToVersion3(batchLowered).effectStack.find((frame) => frame.replacementBatch)!;
  states.push({
    name: "replacement-batch-on-top-transient",
    shape: "REPLACEMENT_BATCH at INTERRUPTED_BY_TRIGGERS as the top frame with no prompt (no frame can carry the version 2 rider: dropped)",
    state: { ...batchGolden, effectStack: [batchOnTop], pendingPrompt: null },
    lowered: { ...batchGolden, effectStack: [], pendingPrompt: null },
    reports: ["lowered.replacement_batch", "lowered.replacement_batch_dropped"],
  });

  // An effect window at TRIGGER_EFFECT holding the point's still-pending events:
  // they move to the Trigger's frame above, which the version 2 resolver drains.
  const retainedEvents: PendingEvent[] = [
    { type: "TRIGGER_ACTIVATED", playerIndex: 1, payload: { cardId: CARDS.TRIGGER.id, activated: true } } as PendingEvent,
    { type: "CARD_REMOVED_FROM_LIFE", playerIndex: 1, payload: { cardInstanceId: "life-golden-effect" } } as PendingEvent,
  ];
  const effectDone: EffectDamageContinuation = { ...effectInProgress, remainingDamages: 0 };
  states.push({
    name: "effect-trigger-effect-retained-events",
    shape: "EFFECT_DAMAGE at TRIGGER_EFFECT retaining the point's unpublished events, its Trigger effect prompting above (the events ride up to the Trigger's frame)",
    state: {
      ...effectWindow,
      turn: { ...effectWindow.turn, pendingTriggerFromEffect: undefined },
      effectStack: [parent, { ...effectFrame, phase: "INTERRUPTED_BY_TRIGGERS", effectDamage: effectDone, accumulatedEvents: retainedEvents }, triggerFrame],
      pendingPrompt: triggerPrompt,
    },
    lowered: {
      ...effectWindow,
      turn: { ...effectWindow.turn, pendingTriggerFromEffect: undefined },
      effectStack: [parent, { ...triggerFrame, accumulatedEvents: retainedEvents }],
      pendingPrompt: triggerPrompt,
    },
    reports: ["lowered.effect_damage"],
  });
  states.push({
    name: "effect-trigger-effect-events-no-carrier",
    shape: "EFFECT_DAMAGE at TRIGGER_EFFECT retaining events with no frame above (transient) and no parent: the events are dropped and classified",
    state: {
      ...effectWindow,
      turn: { ...effectWindow.turn, pendingTriggerFromEffect: undefined },
      effectStack: [{ ...effectFrame, phase: "INTERRUPTED_BY_TRIGGERS", effectDamage: { ...effectDone, parentFrameId: undefined }, accumulatedEvents: retainedEvents }],
      pendingPrompt: null,
    },
    lowered: { ...effectWindow, turn: { ...effectWindow.turn, pendingTriggerFromEffect: undefined }, effectStack: [], pendingPrompt: null },
    reports: ["lowered.effect_damage", "lowered.effect_damage_events_dropped"],
  });

  return states;
}
