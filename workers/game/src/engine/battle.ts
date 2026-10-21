import { advanceLifeTriggerExecution, triggerExecutionOwner } from "./trigger-executor.js";
/**
 * Battle system
 *
 * Attack → Block → Counter → Damage → End of Battle.
 * All battle-related execution logic, extracted from execute.ts.
 */

import { isGameTerminated } from "./terminal.js";
import { publishCommittedEvents } from "./effect-resolver/resume/events.js";
import type {
  BattleDamageContinuation,
  CardData,
  EffectStackFrame,
  GameState,
  PendingEvent,
  ExecuteResult,
  QueuedTrigger,
} from "../types.js";
import {
  continuationFrame,
  insertFrameAt,
  openBattleTriggerWindow,
  updateFrameById,
} from "./damage-frames.js";
import { generateFrameId } from "./effect-stack.js";
import { materializeReplacementOffer } from "./replacements.js";
import { popFrame } from "./effect-stack.js";
import {
  getActivePlayerIndex,
  getInactivePlayerIndex,
  findCardInState,
  restDonForCost,
  pushTriggerStaging,
} from "./state.js";
import {
  getEffectivePower,
  getEffectiveCost,
  getBattleDefenderPower,
} from "./modifiers.js";
import { getEffectiveCounterValue } from "./counter-value.js";
import { expireBattleEffects } from "./duration-tracker.js";
import { hasEffectiveKeyword } from "./keywords.js";
import { checkReplacementForKO } from "./replacements.js";
import {
  resolveEffect,
  resolverExecutionServices,
} from "./effect-resolver/index.js";
import { koCharacter } from "./effect-resolver/card-mutations.js";
import { isRemovalProhibited } from "./prohibitions.js";
import { emitPendingEvent } from "./events.js";
import { transitionCard, transitionDetachedCard } from "./zone-transition.js";
import { allocateEngineId, takeEngineTimestamp } from "./execution-context.js";
import {
  redirectDamageLifeCard,
  canOfferTrigger as canOfferTriggerQuery,
  moveLifeCardToHand as moveLifeCardToHandQuery,
  popLifeForDamage as popLifeForDamageQuery,
} from "./effect-damage.js";

function restoreTriggerStaging(
  state: GameState,
  baseline: readonly string[]
): GameState {
  const keep = new Set(baseline);
  return {
    ...state,
    turn: {
      ...state.turn,
      triggerStagingInstanceIds: (
        state.turn.triggerStagingInstanceIds ?? []
      ).filter((id) => keep.has(id)),
    },
  };
}

// ─── Declare Attack ───────────────────────────────────────────────────────────

export function executeDeclareAttack(
  state: GameState,
  attackerInstanceId: string,
  targetInstanceId: string,
  cardDb: Map<string, CardData>
): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);

  // Rest the attacker
  let nextState = setCardState(state, pi, attackerInstanceId, "RESTED");
  events.push({
    type: "CARD_STATE_CHANGED",
    playerIndex: pi,
    payload: { cardInstanceId: attackerInstanceId, newState: "RESTED" },
  });

  const attackerFound = findCardInState(nextState, attackerInstanceId)!;
  const attackerData = cardDb.get(attackerFound.card.cardId)!;
  const attackerPower = getEffectivePower(
    attackerFound.card,
    attackerData,
    nextState,
    cardDb
  );

  const defenderFound = findCardInState(nextState, targetInstanceId)!;
  const defenderData = cardDb.get(defenderFound.card.cardId)!;
  const defenderPower = getEffectivePower(
    defenderFound.card,
    defenderData,
    nextState,
    cardDb
  );

  const allocatedBattle = allocateEngineId(nextState, "battle");
  nextState = allocatedBattle.state;
  const battle = {
    battleId: allocatedBattle.id,
    attackerInstanceId,
    targetInstanceId,
    attackerPower,
    defenderPower,
    counterPowerAdded: 0,
    blockerActivated: false,
    step: "ATTACK_STEP" as const,
    redirectWindow: false,
    blockerLocked: false,
    targetLocked: false,
  };

  nextState = {
    ...nextState,
    turn: { ...nextState.turn, battle, battleSubPhase: "ATTACK_STEP" },
  };

  events.push({
    type: "ATTACK_DECLARED",
    playerIndex: pi,
    payload: { attackerInstanceId, targetInstanceId, attackerPower },
  });

  // OPT-243: CHARACTER_BATTLES does NOT fire here. Per Bandai rulings, it fires
  // only when the Damage Step actually begins with both combatants still on the
  // field. Mid-battle removal (e.g. [On Block] trashing the attacker or target)
  // aborts the battle before Damage Step and CHARACTER_BATTLES must not publish.
  // Emission is deferred to executeDamageStep.

  // [When Attacking] and [On Your Opponent's Attack] fire here in M4

  // Advance to BLOCK_STEP
  nextState = {
    ...nextState,
    turn: {
      ...nextState.turn,
      battle: nextState.turn.battle
        ? { ...nextState.turn.battle, step: "BLOCK_STEP" }
        : null,
      battleSubPhase: "BLOCK_STEP",
    },
  };
  events.push({
    type: "PHASE_CHANGED",
    playerIndex: pi,
    payload: { from: "ATTACK_STEP", to: "BLOCK_STEP" },
  });

  return { state: nextState, events };
}

// ─── Declare Blocker ──────────────────────────────────────────────────────────

export function executeDeclareBlocker(
  state: GameState,
  blockerInstanceId: string,
  cardDb: Map<string, CardData>
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);

  // Rest the blocker
  let nextState = setCardState(state, inactiveIdx, blockerInstanceId, "RESTED");
  events.push({
    type: "CARD_STATE_CHANGED",
    playerIndex: inactiveIdx,
    payload: { cardInstanceId: blockerInstanceId, newState: "RESTED" },
  });

  // Replace the target in BattleContext
  const battle = nextState.turn.battle!;
  const updatedBattle = {
    ...battle,
    targetInstanceId: blockerInstanceId,
    blockerActivated: true,
    blockerLocked: true,
    targetLocked: true,
  };

  // Recalculate defender power with new target
  const blockerFound = findCardInState(nextState, blockerInstanceId)!;
  const blockerData = cardDb.get(blockerFound.card.cardId)!;
  const blockerPower = getEffectivePower(
    blockerFound.card,
    blockerData,
    nextState,
    cardDb
  );

  nextState = {
    ...nextState,
    turn: {
      ...nextState.turn,
      battle: { ...updatedBattle, defenderPower: blockerPower },
    },
  };

  events.push({
    type: "BLOCK_DECLARED",
    playerIndex: inactiveIdx,
    payload: { blockerInstanceId },
  });
  // [On Block] fires in M4

  // OPT-246: Block Step closed with the target redirected to the blocker.
  // Emit ATTACK_TARGET_FINAL so [When Attacked] effects on the new (blocker)
  // target can fire before Counter Step — and so the original target's
  // [When Attacked] does NOT fire (qa_op03.md:18-20).
  events.push({
    type: "ATTACK_TARGET_FINAL",
    playerIndex: inactiveIdx,
    payload: {
      attackerInstanceId: battle.attackerInstanceId,
      targetInstanceId: blockerInstanceId,
      redirected: true,
    },
  });

  // Advance to COUNTER_STEP
  nextState = {
    ...nextState,
    turn: {
      ...nextState.turn,
      battle: nextState.turn.battle
        ? {
            ...nextState.turn.battle,
            step: "COUNTER_STEP",
            blockerLocked: true,
            targetLocked: true,
          }
        : null,
      battleSubPhase: "COUNTER_STEP",
    },
  };
  events.push({
    type: "PHASE_CHANGED",
    playerIndex: inactiveIdx,
    payload: { from: "BLOCK_STEP", to: "COUNTER_STEP" },
  });

  return { state: nextState, events };
}

// ─── Pass (battle sub-phase transitions) ──────────────────────────────────────

export function executePass(
  state: GameState,
  cardDb: Map<string, CardData>
): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);
  let nextState = state;

  if (state.turn.battleSubPhase === "BLOCK_STEP") {
    // Defender passes blocker window → advance to COUNTER_STEP
    // OPT-246: emit ATTACK_TARGET_FINAL on the original target so its
    // [When Attacked] effects can fire before Counter Step.
    const battle = nextState.turn.battle!;
    events.push({
      type: "ATTACK_TARGET_FINAL",
      playerIndex: pi,
      payload: {
        attackerInstanceId: battle.attackerInstanceId,
        targetInstanceId: battle.targetInstanceId,
        redirected: false,
      },
    });
    nextState = {
      ...nextState,
      turn: {
        ...nextState.turn,
        battle: nextState.turn.battle
          ? {
              ...nextState.turn.battle,
              step: "COUNTER_STEP",
              blockerLocked: true,
              targetLocked: true,
            }
          : null,
        battleSubPhase: "COUNTER_STEP",
      },
    };
    events.push({
      type: "PHASE_CHANGED",
      playerIndex: pi,
      payload: { from: "BLOCK_STEP", to: "COUNTER_STEP" },
    });
  } else if (state.turn.battleSubPhase === "COUNTER_STEP") {
    // Defender passes counter window → advance to DAMAGE_STEP
    nextState = {
      ...nextState,
      turn: {
        ...nextState.turn,
        battle: nextState.turn.battle
          ? {
              ...nextState.turn.battle,
              step: "DAMAGE_STEP",
              blockerLocked: true,
              targetLocked: true,
            }
          : null,
        battleSubPhase: "DAMAGE_STEP",
      },
    };
    events.push({
      type: "PHASE_CHANGED",
      playerIndex: pi,
      payload: { from: "COUNTER_STEP", to: "DAMAGE_STEP" },
    });
    // Run damage resolution immediately. The Damage Step shares this
    // accumulator: a Trigger window publishes it before prompting (OPT-963).
    const dmgResult = executeDamageStep(nextState, cardDb, events);
    nextState = dmgResult.state;
    return {
      state: nextState,
      events: dmgResult.events,
      ...(dmgResult.queuedTriggers?.length ? { queuedTriggers: dmgResult.queuedTriggers } : {}),
      lethalDamagePlayerIndex: dmgResult.lethalDamagePlayerIndex,
      ...(dmgResult.pendingPrompt && {
        pendingPrompt: dmgResult.pendingPrompt,
      }),
    };
  }

  return { state: nextState, events };
}

// ─── Symbol Counter ───────────────────────────────────────────────────────────

export function executeUseCounter(
  state: GameState,
  cardInstanceId: string,
  counterTargetInstanceId: string,
  cardDb: Map<string, CardData>
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);

  const found = findCardInState(state, cardInstanceId)!;
  const cardData = cardDb.get(found.card.cardId)!;
  // OPT-400: honor COUNTER_GRANT rule mods, not just the printed counter.
  const counterValue = getEffectiveCounterValue(
    found.card,
    cardData,
    state,
    cardDb
  );

  // Trash the counter card from hand
  const moved = transitionCard(state, cardInstanceId, "TRASH", {
    position: "TOP",
  });
  if (!moved) return { state, events };
  let nextState = moved.state;

  // Add counter power to battle context
  const battle = nextState.turn.battle!;
  const targetFound = findCardInState(nextState, battle.targetInstanceId);
  if (targetFound) {
    const targetData = cardDb.get(targetFound.card.cardId);
    const newCounterPower = battle.counterPowerAdded + counterValue;
    const newDefenderPower = targetData
      ? getBattleDefenderPower(
          targetFound.card,
          targetData,
          newCounterPower,
          nextState
        )
      : battle.defenderPower + counterValue;

    nextState = {
      ...nextState,
      turn: {
        ...nextState.turn,
        battle: {
          ...battle,
          counterPowerAdded: newCounterPower,
          defenderPower: newDefenderPower,
        },
      },
    };
  }

  events.push({
    type: "COUNTER_USED",
    playerIndex: inactiveIdx,
    payload: { cardId: cardData.id, counterValue, counterTargetInstanceId },
  });

  return { state: nextState, events };
}

// ─── Counter Event ────────────────────────────────────────────────────────────

export function executeUseCounterEvent(
  state: GameState,
  cardInstanceId: string,
  cardDb: Map<string, CardData>
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);

  const found = findCardInState(state, cardInstanceId)!;
  const cardData = cardDb.get(found.card.cardId)!;
  const cost = getEffectiveCost(cardData, state, cardInstanceId, cardDb, true, undefined, "USE_COUNTER_EVENT");

  // Pay cost
  let nextState = restDonForCost(state, inactiveIdx, cost)!;
  // Trash the event
  const moved = transitionCard(nextState, cardInstanceId, "TRASH", {
    position: "TOP",
  });
  if (!moved) return { state: nextState, events };
  nextState = moved.state;

  events.push({
    type: "COUNTER_USED",
    playerIndex: inactiveIdx,
    payload: {
      cardId: cardData.id,
      cardInstanceId: moved.fact.newInstanceId,
      type: "event",
    },
  });

  // Counter effects resolve before "when you activate an Event" auto effects,
  // exactly as Main effects do. A Character counter never enters this path.
  events.push({
    type: "EVENT_ACTIVATED_FROM_HAND",
    playerIndex: inactiveIdx,
    payload: {
      cardId: cardData.id,
      cardInstanceId: moved.fact.newInstanceId,
      costReducedAmount: Math.max(0, (cardData.cost ?? 0) - cost),
    },
  });
  nextState = publishCommittedEvents(nextState, events);
  const counterBlock = cardData.effectSchema?.effects.find(
    (block) => block.category === "auto" && block.trigger &&
      "keyword" in block.trigger && block.trigger.keyword === "COUNTER_EVENT"
  );
  if (counterBlock) {
    const result = resolveEffect(nextState, counterBlock, moved.fact.newInstanceId, inactiveIdx, cardDb);
    nextState = result.state;
    events.push(...result.events);
    if (result.pendingPrompt)
      return { state: nextState, events, pendingPrompt: result.pendingPrompt };
  }
  return { state: nextState, events };
}

// ─── Reveal Trigger (OPT-963: the BATTLE_DAMAGE frame's window) ─────────────

/** A BATTLE_DAMAGE continuation releases retained watchers when its sequence completes. */
export type BattleDamageResult = ExecuteResult & {
  lethalDamagePlayerIndex?: 0 | 1;
  queuedTriggers?: QueuedTrigger[];
};

/**
 * Resume the top BATTLE_DAMAGE frame at its Trigger window with the defender's
 * REVEAL_TRIGGER choice (rules §7-1-4-1-1-2, §10-1-5-3, 8-6-2-1). Accept
 * trashes the card and resolves its [Trigger] block; when that block prompts,
 * the frame moves to TRIGGER_EFFECT below the block's frames and the Life
 * removal is published now and retained unscanned for the continuation
 * (OPT-441). Decline adds the card to hand. Either way the remaining points
 * continue from the same frame.
 */
export function resumeBattleDamageFrame(
  state: GameState,
  reveal: boolean,
  cardDb: Map<string, CardData>
): BattleDamageResult {
  const events: PendingEvent[] = [];
  const frame = state.effectStack.at(-1);
  const window = frame?.battleDamage;
  if (!frame || window?.stage !== "TRIGGER_WINDOW") return { state, events };
  const battle = state.turn.battle;
  if (!battle || battle.battleId !== window.battleId) {
    // The battle this window belongs to is gone; nothing can answer it.
    return { state: popFrame(state), events };
  }
  const inactiveIdx = window.damagedPlayerIndex;
  const lifeCard = window.lifeCard;
  let nextState = state;
  let destinationInstanceId: string | undefined;

  if (reveal) {
    // Activate trigger — card goes to trash (rules §10-1-5-3)
    const moved = transitionDetachedCard(
      nextState,
      {
        instanceId: lifeCard.instanceId,
        cardId: lifeCard.cardId,
        source: "LIFE",
        owner: inactiveIdx,
        lifeFace: lifeCard.face,
      },
      "TRASH",
      { position: "TOP" }
    );
    if (!moved) return { state: nextState, events };
    nextState = moved.state;
    const triggerInstanceId = moved.fact.newInstanceId;
    destinationInstanceId = triggerInstanceId;
    // OPT-257 (F4): mark the just-trashed Life card as staging so trash-targeting
    // effects (PLAY_CARD source_zone TRASH, TRASH_COUNT, etc.) don't see it
    // during this Trigger's resolution. Cleared after resolveEffect returns —
    // any pending prompt's candidate list is already built/locked at that point.
    const stagingBaseline = nextState.turn.triggerStagingInstanceIds ?? [];
    nextState = pushTriggerStaging(nextState, triggerInstanceId);
    events.push({
      type: "TRIGGER_ACTIVATED",
      playerIndex: inactiveIdx,
      payload: { cardId: lifeCard.cardId, activated: true },
    });

    const triggerCardData = cardDb.get(lifeCard.cardId);
    if (triggerCardData?.type === "Event") {
      events.push({
        type: "EVENT_TRIGGER_RESOLVED",
        playerIndex: inactiveIdx,
        payload: { cardId: lifeCard.cardId, cardInstanceId: triggerInstanceId },
      });
    }
    const schema = triggerCardData?.effectSchema;
    const triggerBlock = schema?.effects?.find(
      (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "TRIGGER"
    );
    if (triggerBlock) {
      const resolved = resolveEffect(
        nextState,
        triggerBlock,
        triggerInstanceId,
        inactiveIdx,
        cardDb
      );
      const effectResult = advanceLifeTriggerExecution(
        { ...resolved, events: [...events, ...resolved.events] },
        frame.id, cardDb, resolverExecutionServices
      );
      nextState = effectResult.state;
      events.splice(0, events.length, ...effectResult.events);
      nextState = restoreTriggerStaging(nextState, stagingBaseline);
      // OPT-960: the Trigger ended the game (9-1-2). Publish the Life removal
      // that already happened, then stop: no further damage, no endBattle.
      if (isGameTerminated(nextState)) {
        events.push({
          type: "CARD_REMOVED_FROM_LIFE",
          playerIndex: inactiveIdx,
          payload: { cardInstanceId: lifeCard.instanceId, newCardInstanceId: triggerInstanceId },
        });
        return { state: nextState, events };
      }
      // OPT-441: a prompt or retained v5 child pauses the Trigger effect.
      // Publish the Life removal now and retain it on the frame, unscanned,
      // so its auto effects fire when the Trigger's frames unwind and the
      // frame continues the remaining damage.
      if (effectResult.pendingPrompt || (triggerExecutionOwner(nextState) && nextState.effectStack.at(-1)?.id !== frame.id)) {
        const removedEvent: PendingEvent = {
          type: "CARD_REMOVED_FROM_LIFE",
          playerIndex: inactiveIdx,
          payload: {
            cardInstanceId: lifeCard.instanceId,
            newCardInstanceId: triggerInstanceId,
          },
          propagation: { eventLogEmitted: true },
        };
        nextState = emitPendingEvent(nextState, removedEvent, inactiveIdx);
        nextState = decrementDamagesRemaining(nextState);
        nextState = updateFrameById(nextState, frame.id, (current) => ({
          ...current,
          phase: "INTERRUPTED_BY_TRIGGERS",
          battleDamage: {
            stage: "TRIGGER_EFFECT",
            battleId: window.battleId,
            damagedPlayerIndex: inactiveIdx,
            lifeCardInstanceId: lifeCard.instanceId,
          },
          accumulatedEvents: [removedEvent],
        }));
        return {
          state: nextState,
          events,
          pendingPrompt: effectResult.pendingPrompt,
        };
      }
    } else {
      nextState = restoreTriggerStaging(nextState, stagingBaseline);
    }
  } else {
    // Decline trigger — add to hand
    const moved = transitionDetachedCard(
      nextState,
      {
        instanceId: lifeCard.instanceId,
        cardId: lifeCard.cardId,
        source: "LIFE",
        owner: inactiveIdx,
        lifeFace: lifeCard.face,
      },
      "HAND"
    );
    if (!moved) return { state: nextState, events };
    nextState = moved.state;
    destinationInstanceId = moved.fact.newInstanceId;
    events.push({
      type: "CARD_ADDED_TO_HAND_FROM_LIFE",
      playerIndex: inactiveIdx,
      payload: {
        cardId: lifeCard.cardId,
        cardInstanceId: moved.fact.newInstanceId,
      },
    });
  }

  // OPT-240: emit CARD_REMOVED_FROM_LIFE AFTER the Trigger window fully
  // resolves (or is declined). Auto-effects watching this event (e.g.
  // OP08-105 Bonney) observe the post-trigger board state, so a Trigger
  // that KOs the watcher suppresses its fire via the on-field check.
  events.push({
    type: "CARD_REMOVED_FROM_LIFE",
    playerIndex: inactiveIdx,
    payload: {
      cardInstanceId: lifeCard.instanceId,
      ...(destinationInstanceId
        ? { newCardInstanceId: destinationInstanceId }
        : {}),
    },
  });

  // The damage that opened this window is now complete — decrement
  // damagesRemaining and continue the DA sequence (OPT-239 /
  // qa_rules.md:229-231) from the same frame.
  nextState = decrementDamagesRemaining(nextState);
  return continueLeaderDamageSequence(nextState, cardDb, false, frame.id, events);
}

function decrementDamagesRemaining(state: GameState): GameState {
  const battle = state.turn.battle;
  if (!battle) return state;
  const remainingBefore = battle.damagesRemaining ?? 1;
  return {
    ...state,
    turn: {
      ...state.turn,
      battle: { ...battle, damagesRemaining: Math.max(0, remainingBefore - 1) },
    },
  };
}

// ─── Leader-damage helpers (OPT-239) ────────────────────────────────────────

export { popLifeForDamage, moveLifeCardToHand } from "./effect-damage.js";
const popLifeForDamage = popLifeForDamageQuery;
const moveLifeCardToHand = moveLifeCardToHandQuery;

/**
 * Deal one damage to the defending Leader. Returns `paused: true` when the
 * revealed Life card has [Trigger] and the defender must choose whether to
 * activate it (§10-1-5). Does NOT decrement `damagesRemaining` — callers
 * (executeRevealTrigger or continueLeaderDamageSequence) own that.
 */
function dealOneLeaderDamage(
  state: GameState,
  cardDb: Map<string, CardData>,
  attackerInstanceId: string,
  isBanish: boolean,
  attackerType: "LEADER" | "CHARACTER",
  firstDamageOfAttack: boolean
): {
  state: GameState;
  events: PendingEvent[];
  paused: boolean;
  /** The revealed [Trigger] Life card when paused. */
  lifeCard?: import("../types.js").LifeCard;
  lethalDamagePlayerIndex?: 0 | 1;
  lethal?: boolean;
} {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);
  const inactiveIdx = getInactivePlayerIndex(state);

  const popResult = popLifeForDamage(state, inactiveIdx);
  if (popResult.lethal) {
    events.push({
      type: "DAMAGE_DEALT",
      playerIndex: pi,
      payload: {
        target: "leader",
        amount: 1,
        lethal: true,
        attackerInstanceId,
        attackerType,
        firstDamageOfAttack,
      },
    });
    // OPT-886: the win check is made once, "at the point when it is
    // determined that damage will be dealt" (7-1-4-1-1-1). A 2-damage attack
    // repeats only the Life-to-hand step 7-1-4-1-1-2 (7-1-4-1-1-3), which
    // does nothing at 0 Life — so a [Double Attack]'s later damage finding 0
    // Life is dealt but does not defeat (qa_rules.md:156-158). Only the
    // attack's first damage at 0 Life fulfils 9-2-1-1.
    if (!firstDamageOfAttack) {
      return { state: popResult.state, events, paused: false };
    }
    return {
      state: popResult.state,
      events,
      paused: false,
      lethalDamagePlayerIndex: inactiveIdx,
      lethal: true,
    };
  }
  if (!popResult.lifeCard)
    return { state: popResult.state, events, paused: false };

  let nextState = popResult.state;
  const { lifeCard } = popResult;

  events.push({
    type: "DAMAGE_DEALT",
    playerIndex: pi,
    payload: { amount: 1, attackerInstanceId, attackerType, firstDamageOfAttack },
  });
  events.push(...popResult.events);

  if (isBanish) {
    const moved = transitionDetachedCard(
      nextState,
      {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      owner: inactiveIdx,
      source: "LIFE",
      lifeFace: lifeCard.face,
      },
      "TRASH",
      { position: "TOP" }
    );
    if (!moved) return { state: nextState, events, paused: false };
    nextState = moved.state;
    events.push({
      type: "CARD_REMOVED_FROM_LIFE",
      playerIndex: inactiveIdx,
      payload: {
        cardInstanceId: lifeCard.instanceId,
        newCardInstanceId: moved.fact.newInstanceId,
      },
    });
    return { state: nextState, events, paused: false };
  }

  const redirected = redirectDamageLifeCard(nextState, lifeCard, inactiveIdx, cardDb);
  if (redirected) {
    return { state: redirected.state, events: [...events, ...redirected.events], paused: false };
  }

  if (
    canOfferTrigger(
      nextState,
      lifeCard.cardId,
      cardDb,
      inactiveIdx,
      lifeCard.instanceId
    )
  ) {
    events.push({
      type: "TRIGGER_ACTIVATED",
      playerIndex: inactiveIdx,
      payload: { cardId: lifeCard.cardId },
    });
    return { state: nextState, events, paused: true, lifeCard };
  }

  const handResult = moveLifeCardToHand(nextState, lifeCard, inactiveIdx);
  return {
    state: handResult.state,
    events: [...events, ...handResult.events],
    paused: false,
  };
}

/**
 * Drive `dealOneLeaderDamage` while `battle.damagesRemaining > 0`, pausing
 * on [Trigger] Life cards. The count locked at Damage Step entry is always
 * dealt in full, even if the attacker leaves the field between damages
 * (qa_rules.md:152-154, OPT-886). Calls `endBattle` once the sequence
 * completes.
 *
 * Between damages, runs `recalculateBattlePowers` so Life-threshold power
 * buffs (e.g., ST09-001 Yamato gaining +1000 at ≤2 Life) apply to the 2nd
 * damage context — see qa_st-09.md:6-8 and qa_op03.md:283-285.
 */
function continueLeaderDamageSequence(
  state: GameState,
  cardDb: Map<string, CardData>,
  enteringDamageStep = false,
  frameId?: string,
  events: PendingEvent[] = []
): BattleDamageResult {
  let nextState = state;
  let lethalDamagePlayerIndex: 0 | 1 | undefined;
  // OPT-796: only the Damage Step entry deals the attack's first damage; every
  // resume (after a [Trigger] window or a paused Life removal) continues an
  // attack that has already dealt one. "When ... deals damage" watchers fire
  // once per attack, including [Double Attack] (qa_op03.md Gaimon).
  let firstDamageOfAttack = enteringDamageStep;

  while (true) {
    const battle = nextState.turn.battle;
    if (!battle) break;
    const remaining = battle.damagesRemaining ?? 0;
    if (remaining <= 0) break;

    // OPT-886 (qa_rules.md:152-154): the damage count is fixed when the
    // Damage Step locks it, so the remaining damage is still dealt when the
    // attacker left the field (a [Trigger] K.O., its own effect, …) or lost
    // [Double Attack] after an earlier damage.
    const attackerFound = findCardInState(nextState, battle.attackerInstanceId);
    const onField =
      !!attackerFound &&
      (attackerFound.card.zone === "CHARACTER" ||
        attackerFound.card.zone === "LEADER");

    // Re-apply modifiers so between-damage power conditions are honored.
    nextState = recalculateBattlePowers(nextState, cardDb);

    const attackerData = onField
      ? cardDb.get(attackerFound!.card.cardId)
      : undefined;
    // OPT-253: [Banish] is suppressed while the attacker is effect-negated,
    // preserved if it came from an external GRANT_KEYWORD. An attacker that
    // left the field no longer has keyword effects, so its remaining damage
    // is ordinary damage.
    const isBanish = attackerData
      ? hasEffectiveKeyword(
          attackerFound!.card,
          attackerData,
          "BANISH",
          nextState,
          cardDb
        )
      : false;
    // A Leader never leaves the field, so an off-field attacker was a
    // Character.
    const attackerType: "LEADER" | "CHARACTER" =
      attackerData?.type?.toUpperCase() === "LEADER" ? "LEADER" : "CHARACTER";

    const one = dealOneLeaderDamage(
      nextState,
      cardDb,
      battle.attackerInstanceId,
      isBanish,
      attackerType,
      firstDamageOfAttack
    );
    firstDamageOfAttack = false;
    nextState = one.state;
    events.push(...one.events);
    if (one.lethalDamagePlayerIndex !== undefined)
      lethalDamagePlayerIndex = one.lethalDamagePlayerIndex;

    if (one.paused) {
      // Pending Trigger (rule 8-6-2-1): the BATTLE_DAMAGE frame owns the
      // window; the defender's REVEAL_TRIGGER resumes it through the prompt
      // lifecycle (resumeBattleDamageFrame). The accumulator is published
      // inside, so the caller returns it already marked.
      const opened = openBattleTriggerWindow(nextState, one.lifeCard!, events, cardDb, frameId);
      return {
        state: opened.state,
        events,
        lethalDamagePlayerIndex,
        ...(opened.pendingPrompt ? { pendingPrompt: opened.pendingPrompt } : {}),
      };
    }

    // Damage completed (or lethal) — decrement remaining.
    const curBattle = nextState.turn.battle;
    if (curBattle) {
      nextState = {
        ...nextState,
        turn: {
          ...nextState.turn,
          battle: {
            ...curBattle,
            damagesRemaining: Math.max(0, remaining - 1),
          },
        },
      };
    }
    if (one.lethal) break;
  }

  nextState = endBattle(nextState, events);
  // The sequence's frame (if any) completes with the battle; the ordinary
  // triggers it deferred (rule 8-6-2) are released to the caller.
  let queuedTriggers: QueuedTrigger[] | undefined;
  if (frameId !== undefined) {
    const frame = nextState.effectStack.find((candidate) => candidate.id === frameId);
    if (frame) {
      queuedTriggers = frame.pendingTriggers;
      nextState = { ...nextState, effectStack: nextState.effectStack.filter((candidate) => candidate.id !== frameId) };
    }
  }
  return {
    state: nextState,
    events,
    lethalDamagePlayerIndex,
    ...(queuedTriggers?.length ? { queuedTriggers } : {}),
  };
}

/**
 * Continue the top BATTLE_DAMAGE frame once the work above it has unwound:
 * at TRIGGER_EFFECT the accepted Trigger's frames are gone, so the retained
 * Life removal is released for scanning and the remaining points are dealt;
 * at CHARACTER_KO_REPLACEMENT with a recorded resolution the Damage Step
 * finishes (OPT-872). The caller feeds the result through the action pipeline
 * so its events, auto effects, deferred watchers and lethal checks receive
 * the same processing as an ordinary action. An unanswered K.O. replacement
 * (no prompt can deliver its answer any more) is discarded, as is a frame
 * whose battle is gone (OPT-884 owns the recovery policy).
 */
export function continueBattleDamageFrame(
  state: GameState,
  cardDb: Map<string, CardData>,
  replacementEvents: PendingEvent[] = []
): BattleDamageResult {
  const frame = state.effectStack.at(-1);
  const pending = frame?.battleDamage;
  if (!frame || !pending || state.pendingPrompt) return { state, events: [] };
  // A finished game never resumes a battle; drop the frame.
  if (state.status !== "IN_PROGRESS") return { state: popFrame(state), events: [] };

  const battle = state.turn.battle;
  if (!battle || battle.battleId !== pending.battleId || state.turn.battleSubPhase !== "DAMAGE_STEP") {
    const withoutStale = popFrame(state);
    // A stale frame cannot own a newer battle. Only abort a Damage Step
    // with no remaining work or prompt; otherwise preserve its live owner.
    const events: PendingEvent[] = [];
    return {
      state: battle && state.turn.battleSubPhase === "DAMAGE_STEP" && withoutStale.effectStack.every(frame => frame.triggerExecution !== undefined)
        ? endBattle(withoutStale, events, { aborted: true })
        : withoutStale,
      events,
    };
  }

  if (pending.stage === "CHARACTER_KO_REPLACEMENT") {
    // Only an answered continuation finishes the battle. An unanswered one
    // reaching here has lost its prompt (no prompt is pending), so nothing
    // can answer it any more. Abort without guessing a decline or a K.O.
    if (pending.resolution === undefined) {
      const events: PendingEvent[] = [];
      return { state: endBattle(popFrame(state), events, { aborted: true }), events };
    }
    const result = finishCharacterBattleResult(popFrame(state), pending, [...frame.accumulatedEvents, ...replacementEvents], cardDb);
    return { ...result, queuedTriggers: frame.pendingTriggers };
  }

  if (pending.stage === "TRIGGER_WINDOW") {
    // Still waiting for the defender; the lifecycle surfaces the prompt.
    return { state, events: [] };
  }

  // TRIGGER_EFFECT: the retained Life removal (published, unscanned) heads
  // the continuation's events so its watchers fire with the rest.
  const retained = frame.accumulatedEvents;
  const cleared = updateFrameById(state, frame.id, (current) => ({ ...current, accumulatedEvents: [] }));
  return continueLeaderDamageSequence(cleared, cardDb, false, frame.id, [...retained]);
}

// ─── Recalculate Battle Powers ───────────────────────────────────────────────

/**
 * Recalculate attacker/defender power in the battle context using current
 * activeEffects. Called after trigger resolution and at damage step to ensure
 * modifiers from [When Attacking] / [On Your Opponent's Attack] are reflected.
 */
export function recalculateBattlePowers(
  state: GameState,
  cardDb: Map<string, CardData>
): GameState {
  const battle = state.turn.battle;
  if (!battle) return state;

  const attackerFound = findCardInState(state, battle.attackerInstanceId);
  const defenderFound = findCardInState(state, battle.targetInstanceId);
  if (!attackerFound || !defenderFound) return state;

  const attackerData = cardDb.get(attackerFound.card.cardId);
  const defenderData = cardDb.get(defenderFound.card.cardId);
  if (!attackerData || !defenderData) return state;

  const newAttackerPower = getEffectivePower(
    attackerFound.card,
    attackerData,
    state,
    cardDb
  );
  const newDefenderPower = getBattleDefenderPower(
    defenderFound.card,
    defenderData,
    battle.counterPowerAdded,
    state,
    cardDb
  );

  if (
    newAttackerPower === battle.attackerPower &&
    newDefenderPower === battle.defenderPower
  ) {
    return state;
  }

  return {
    ...state,
    turn: {
      ...state.turn,
      battle: {
        ...battle,
        attackerPower: newAttackerPower,
        defenderPower: newDefenderPower,
      },
    },
  };
}

// ─── Damage Step (internal) ──────────────────────────────────────────────────

/**
 * OPT-243: both the attacker and the battle target must still be on the field
 * (LEADER or CHARACTER) at the moment Damage Step begins. A zone transition
 * (KO, trash, return-to-hand, move-to-deck) mid-battle strips the instanceId,
 * so a null lookup here means the card was removed during Attack / Block /
 * Counter Step — not merely resting or wounded.
 */
function isOnField(
  state: GameState,
  instanceId: string
): { found: ReturnType<typeof findCardInState>; onField: boolean } {
  const found = findCardInState(state, instanceId);
  const onField =
    !!found &&
    (found.card.zone === "LEADER" || found.card.zone === "CHARACTER");
  return { found, onField };
}

function executeDamageStep(
  state: GameState,
  cardDb: Map<string, CardData>,
  events: PendingEvent[]
): BattleDamageResult {
  const pi = getActivePlayerIndex(state);

  // OPT-243: guard against mid-step removal before we recalc powers or emit
  // CHARACTER_BATTLES. If either combatant left the field during Block /
  // Counter Step the battle aborts — no damage, no "battled" triggers.
  const battleBeforeRecalc = state.turn.battle!;
  const attackerCheck = isOnField(state, battleBeforeRecalc.attackerInstanceId);
  const targetCheck = isOnField(state, battleBeforeRecalc.targetInstanceId);
  if (!attackerCheck.onField || !targetCheck.onField) {
    const reason = !attackerCheck.onField
      ? "ATTACKER_LEFT_FIELD"
      : "TARGET_LEFT_FIELD";
    events.push({
      type: "BATTLE_ABORTED",
      playerIndex: pi,
      payload: {
        attackerInstanceId: battleBeforeRecalc.attackerInstanceId,
        targetInstanceId: battleBeforeRecalc.targetInstanceId,
        reason,
      },
    });
    const abortedState = endBattle(state, events, { aborted: true });
    return { state: abortedState, events };
  }

  // Both combatants on field — emit CHARACTER_BATTLES now (gated on attacker
  // being a Character rather than a Leader). Leader attacks do not publish.
  if (attackerCheck.found!.card.zone === "CHARACTER") {
    events.push({
      type: "CHARACTER_BATTLES",
      playerIndex: pi,
      payload: {
        cardInstanceId: battleBeforeRecalc.attackerInstanceId,
        targetInstanceId: battleBeforeRecalc.targetInstanceId,
      },
    });
  }

  // Recalculate powers to reflect all modifiers (triggers, counters, effects)
  let nextState = recalculateBattlePowers(state, cardDb);
  const battle = nextState.turn.battle!;
  let lethalDamagePlayerIndex: 0 | 1 | undefined;

  const { attackerPower, defenderPower, targetInstanceId } = battle;

  if (attackerPower >= defenderPower) {
    const targetFound = findCardInState(state, targetInstanceId);
    if (targetFound) {
      if (targetFound.card.zone === "LEADER") {
        // Leader takes damage — lock the damage count at Damage Step entry
        // (qa_rules.md:154: damage is fixed at 2 for DA even if the keyword
        // is stripped between damages) and drive the sequence through
        // continueLeaderDamageSequence so the [Trigger] window can pause
        // between damages (§7-1-4-1-1-3, OPT-239).
        const attackerFound = findCardInState(state, battle.attackerInstanceId);
        const attackerData = attackerFound
          ? cardDb.get(attackerFound.card.cardId)
          : undefined;
        // OPT-253: consult runtime keyword state so a negated attacker with
        // printed [Double Attack] locks in 1 damage, while a negated attacker
        // that was externally granted [Double Attack] still locks in 2.
        const damageCount =
          attackerFound &&
          attackerData &&
          hasEffectiveKeyword(
            attackerFound.card,
            attackerData,
            "DOUBLE_ATTACK",
            state,
            cardDb
          )
            ? 2
            : 1;

        nextState = {
          ...nextState,
          turn: {
            ...nextState.turn,
            battle: {
              ...nextState.turn.battle!,
              damagesRemaining: damageCount,
            },
          },
        };

        const cont = continueLeaderDamageSequence(nextState, cardDb, true, undefined, events);
        return {
          state: cont.state,
          events,
          lethalDamagePlayerIndex: cont.lethalDamagePlayerIndex ?? lethalDamagePlayerIndex,
          ...(cont.pendingPrompt ? { pendingPrompt: cont.pendingPrompt } : {}),
        };
      } else if (targetFound.card.zone === "CHARACTER") {
        // Emit COMBAT_VICTORY — attacker won against a character
        events.push(combatVictoryEvent(pi as 0 | 1, battle));

        // Check for replacement effects before KO
        const depthBefore = nextState.effectStack.length;
        let mandatoryOwnerId: string | undefined;
        const replacement = checkReplacementForKO(
          nextState,
          targetInstanceId,
          "battle",
          pi as 0 | 1,
          cardDb,
          {
            executeActionChain: (substituteState, ...args) => {
              // Mandatory substitutes run before checkReplacementForKO returns.
              // Give their events/watchers the same owner as optional ones
              // before the first action can scan or publish a child prefix.
              const generated = generateFrameId(substituteState);
              mandatoryOwnerId = generated.id;
              const owned = insertFrameAt(generated.state, depthBefore, continuationFrame({
                id: generated.id,
                sourceCardInstanceId: battle.attackerInstanceId,
                controller: pi as 0 | 1,
                phase: "INTERRUPTED_BY_TRIGGERS",
                battleDamage: {
                  stage: "CHARACTER_KO_REPLACEMENT",
                  battleId: battle.battleId,
                  targetInstanceId,
                  causingPlayerIndex: pi as 0 | 1,
                  attackerIsCharacter: attackerCheck.found!.card.zone === "CHARACTER",
                  resolution: "REPLACED",
                },
              }));
              return resolverExecutionServices.executeActionChain(owned, ...args);
            },
          }
        );
        if (mandatoryOwnerId !== undefined) {
          if (isGameTerminated(replacement.state)) return { state: replacement.state, events: [...events, ...replacement.events] };
          if (replacement.pendingPrompt) {
            return { state: replacement.state, events: [], lethalDamagePlayerIndex, pendingPrompt: replacement.pendingPrompt };
          }
          // The synchronous mandatory path consumes that same owner once;
          // completion rebuilds the battle prefix and releases its queued work.
          return continueBattleDamageFrame(replacement.state, cardDb, replacement.events);
        }
        if (replacement.pendingPrompt) {
          // OPT-872: an optional offer pauses the Damage Step with its
          // REPLACEMENT frame above the battle owner. Mandatory substitutes
          // acquired that owner before execution in the branch above.
          // The pipeline drops a prompting execution's events, so the resumed
          // step rebuilds PHASE_CHANGED / CHARACTER_BATTLES / COMBAT_VICTORY
          // and publishes them with the K.O. and END_OF_BATTLE. When the
          // substitute itself prompts, the battle owner retains its committed
          // prefix until completion, matching the synchronous path.
          const optionalEffectId = !replacement.replaced ? replacement.offer?.effectId : undefined;
          const offered = materializeReplacementOffer(replacement.state, replacement.pendingPrompt, replacement.offer);
          const frameId = generateFrameId(offered.state);
          const paused: BattleDamageContinuation = {
            stage: "CHARACTER_KO_REPLACEMENT",
            battleId: battle.battleId,
            targetInstanceId,
            causingPlayerIndex: pi as 0 | 1,
            attackerIsCharacter: attackerCheck.found!.card.zone === "CHARACTER",
            ...(replacement.replaced && { resolution: "REPLACED" as const }),
            ...(optionalEffectId !== undefined && { replacementEffectId: optionalEffectId }),
          };
          const withFrame = insertFrameAt(
            frameId.state,
            depthBefore,
            continuationFrame({
              id: frameId.id,
              sourceCardInstanceId: battle.attackerInstanceId,
              controller: pi as 0 | 1,
              phase: "INTERRUPTED_BY_TRIGGERS",
              battleDamage: paused,
            })
          );
          if (isGameTerminated(withFrame)) return { state: withFrame, events };
          return {
            state: withFrame,
            events: [],
            lethalDamagePlayerIndex,
            pendingPrompt: offered.pendingPrompt,
          };
        }
        if (replacement.replaced) {
          nextState = replacement.state;
          events.push(...replacement.events);
        } else {
          nextState = koBattleLoser(
            nextState,
            battle,
            targetInstanceId,
            pi as 0 | 1,
            cardDb,
            events
          );
        }
      }
    }
  }
  // Attacker power < defender power: nothing happens

  // End of Battle
  nextState = endBattle(nextState, events);

  return { state: nextState, events, lethalDamagePlayerIndex };
}

/** COMBAT_VICTORY for an attacker that beat a Character in battle. */
function combatVictoryEvent(
  causingPlayerIndex: 0 | 1,
  battle: { attackerInstanceId: string; targetInstanceId: string }
): PendingEvent {
  return {
    type: "COMBAT_VICTORY",
    playerIndex: causingPlayerIndex,
    payload: {
      cardInstanceId: battle.attackerInstanceId,
      targetInstanceId: battle.targetInstanceId,
    },
  };
}

/**
 * Rules §7-1-4-1-2: K.O. the Character that lost the battle once no
 * replacement applied. Shared by the synchronous Damage Step and its OPT-872
 * resumption after a declined optional replacement (§8-1-3-4-1).
 */
function koBattleLoser(
  state: GameState,
  battle: { attackerInstanceId: string },
  targetInstanceId: string,
  causingPlayerIndex: 0 | 1,
  cardDb: Map<string, CardData>,
  events: PendingEvent[]
): GameState {
  const targetFound = findCardInState(state, targetInstanceId);
  if (!targetFound || targetFound.card.zone !== "CHARACTER") return state;
  if (
    isRemovalProhibited(
      state,
      targetInstanceId,
      {
        action: "KO",
        cause: "BATTLE",
        causingController: causingPlayerIndex,
        sourceCardInstanceId: battle.attackerInstanceId,
      },
      cardDb
    )
  ) {
    // OPT-251: CANNOT_BE_KO (with cause BATTLE or ANY) prevents battle
    // K.O.'s like Luffy's "cannot be K.O.'d in battle by Strike Characters".
    // Combat Victory still fired; the character just doesn't leave the field.
    return state;
  }

  // KO the character — use koCharacter() to preserve instanceId for ON_KO triggers
  const preKODonCount = targetFound.card.attachedDon.length;
  const koResult = koCharacter(state, targetInstanceId, causingPlayerIndex, cardDb);
  if (!koResult) return state;
  for (const ev of koResult.events) {
    if (ev.type === "CARD_KO" && ev.payload) {
      events.push({
        type: "CARD_KO",
        playerIndex: ev.playerIndex,
        payload: {
          ...ev.payload,
          cause: "BATTLE",
          movementCause: "BATTLE",
          preKO_donCount: preKODonCount,
        },
      });
    } else {
      events.push(ev);
    }
  }
  return koResult.state;
}

/**
 * OPT-872: finish a Damage Step that paused on a battle-K.O. replacement
 * prompt. The batch is PHASE_CHANGED (COUNTER_STEP → DAMAGE_STEP),
 * CHARACTER_BATTLES (Character attacker only), COMBAT_VICTORY, the
 * `replacementEvents` passed in, the K.O. when the replacement was not applied
 * (§8-1-3-4-1), then End of the Battle (§7-1-5). That matches the synchronous
 * order for both synchronous and prompted substitutes: the latter retain
 * their publication debt and matched watchers on the BATTLE_DAMAGE frame
 * until damage completes (§8-6-2). The caller pops that frame and checks its id.
 */
export function finishCharacterBattleResult(
  state: GameState,
  pending: Extract<BattleDamageContinuation, { stage: "CHARACTER_KO_REPLACEMENT" }>,
  replacementEvents: PendingEvent[],
  cardDb: Map<string, CardData>
): ExecuteResult {
  const battle = state.turn.battle!;
  // The prompting PASS's events (including this PHASE_CHANGED) were dropped by
  // the pipeline, so rebuild it with the rest of the Damage Step batch.
  const events: PendingEvent[] = [
    {
      type: "PHASE_CHANGED",
      playerIndex: state.turn.activePlayerIndex,
      payload: { from: "COUNTER_STEP", to: "DAMAGE_STEP" },
    },
  ];
  if (pending.attackerIsCharacter) {
    events.push({
      type: "CHARACTER_BATTLES",
      playerIndex: pending.causingPlayerIndex,
      payload: {
        cardInstanceId: battle.attackerInstanceId,
        targetInstanceId: pending.targetInstanceId,
      },
    });
  }
  events.push(combatVictoryEvent(pending.causingPlayerIndex, battle));
  events.push(...replacementEvents);

  let nextState = state;
  if (pending.resolution !== "REPLACED") {
    nextState = koBattleLoser(
      nextState,
      battle,
      pending.targetInstanceId,
      pending.causingPlayerIndex,
      cardDb,
      events
    );
  }
  nextState = endBattle(nextState, events);
  return { state: nextState, events };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setCardState(
  state: GameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardState: "ACTIVE" | "RESTED"
): GameState {
  const player = state.players[playerIndex];
  const update = (card: { instanceId: string; state: string }) =>
    card.instanceId === instanceId ? { ...card, state: cardState } : card;

  const newPlayers = [...state.players] as typeof state.players;
  newPlayers[playerIndex] = {
    ...player,
    leader: update(player.leader) as typeof player.leader,
    characters: player.characters.map((c) =>
      c ? (update(c) as typeof c) : null
    ),
  };
  return { ...state, players: newPlayers };
}

/**
 * Whether a life card's [Trigger] may be offered to its owner.
 *
 * OP16-107 Jesus Burgess FAQ: a [Trigger] whose activation cost cannot be
 * paid (e.g. "trash 1 from hand" with an empty hand) may not be activated —
 * the card must go to hand as normal damage. Gating here prevents the old
 * failure mode where the trigger was offered, the life card trashed, and the
 * effect then fizzled on the unpayable cost. Applies to every costed
 * trigger, not just OP16.
 */
export function canOfferTrigger(
  state: GameState,
  cardId: string,
  cardDb: Map<string, CardData>,
  ownerIndex: 0 | 1,
  sourceCardInstanceId?: string
): boolean {
  return canOfferTriggerQuery(
    state,
    cardId,
    cardDb,
    ownerIndex,
    sourceCardInstanceId
  );
}

function endBattle(
  state: GameState,
  events: PendingEvent[],
  options: { aborted?: boolean } = {}
): GameState {
  // Expire battle-scoped effects before clearing battle state
  const battleId = state.turn.battle?.battleId;
  const battle = state.turn.battle;
  if (battleId) {
    state = expireBattleEffects(state, battleId);
  }

  // OPT-243: END_OF_BATTLE fires on every battle end — aborted or not — so
  // "at end of battle" cleanup effects (OP04-047 etc.) can rely on a single
  // terminal signal. The `aborted` flag lets schemas that only care about
  // completed battles filter END_OF_BATTLE by payload.
  if (battle) {
    events.push({
      type: "END_OF_BATTLE",
      playerIndex: state.turn.activePlayerIndex,
      payload: {
        attackerInstanceId: battle.attackerInstanceId,
        targetInstanceId: battle.targetInstanceId,
        aborted: options.aborted === true,
      },
    });
  }

  // OPT-413 (OP12-020 / OP16-080): record the completed attack with its FINAL
  // target (post-redirect) so ACTION_PERFORMED_THIS_TURN "ATTACKED" conditions
  // can scope by attacker controller and target card type. The declaration-time
  // DECLARE_ATTACK entry from the pipeline carries neither, and a blocker or
  // redirect can change what actually got battled.
  // Aborted battles (combatant left before Damage Step) are NOT recorded —
  // same ruling that gates CHARACTER_BATTLES (OPT-243): the battle didn't
  // complete, so "battled a Character" must not match. Unscoped "attacked
  // this turn" conditions still pass via the DECLARE_ATTACK entry.
  if (battle && options.aborted !== true) {
    const stamped = takeEngineTimestamp(state);
    state = stamped.state;
    const attackerIndex = state.turn.activePlayerIndex;
    const targetIsLeader = state.players.some(
      (pl) => pl.leader.instanceId === battle.targetInstanceId
    );
    state = {
      ...state,
      turn: {
        ...state.turn,
        actionsPerformedThisTurn: [
          ...state.turn.actionsPerformedThisTurn,
          {
            actionType: "ATTACKED",
            timestamp: stamped.timestamp,
            controller: attackerIndex,
            attackerInstanceId: battle.attackerInstanceId,
            targetType: targetIsLeader ? "LEADER" : "CHARACTER",
            targetController: attackerIndex === 0 ? 1 : 0,
          },
        ],
      },
    };
  }

  events.push({
    type: "BATTLE_RESOLVED",
    playerIndex: state.turn.activePlayerIndex,
  });
  events.push({
    type: "PHASE_CHANGED",
    playerIndex: state.turn.activePlayerIndex,
    payload: { from: "DAMAGE_STEP", to: "MAIN" },
  });

  return {
    ...state,
    turn: {
      ...state.turn,
      battle: null,
      battleSubPhase: null,
    },
  };
}
