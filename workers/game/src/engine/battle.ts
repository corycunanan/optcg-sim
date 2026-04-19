/**
 * Battle system
 *
 * Attack → Block → Counter → Damage → End of Battle.
 * All battle-related execution logic, extracted from execute.ts.
 */

import type { CardData, GameState, LifeCard, PendingEvent, ExecuteResult } from "../types.js";
import {
  getActivePlayerIndex,
  getInactivePlayerIndex,
  findCardInState,
  moveCard,
  removeTopLifeCard,
  restDonForCost,
  pushTriggerStaging,
  popTriggerStaging,
} from "./state.js";
import { getEffectivePower, getEffectiveCost, getBattleDefenderPower } from "./modifiers.js";
import { expireBattleEffects } from "./duration-tracker.js";
import { hasDoubleAttack, hasBanish, hasTrigger, hasEffectiveKeyword } from "./keywords.js";
import { checkReplacementForKO } from "./replacements.js";
import { resolveEffect } from "./effect-resolver/index.js";
import { koCharacter } from "./effect-resolver/card-mutations.js";
import { isRemovalProhibited } from "./prohibitions.js";
import type { EffectSchema } from "./effect-types.js";
import { nanoid } from "../util/nanoid.js";

// ─── Declare Attack ───────────────────────────────────────────────────────────

export function executeDeclareAttack(
  state: GameState,
  attackerInstanceId: string,
  targetInstanceId: string,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);

  // Rest the attacker
  let nextState = setCardState(state, pi, attackerInstanceId, "RESTED");
  events.push({ type: "CARD_STATE_CHANGED", playerIndex: pi, payload: { cardInstanceId: attackerInstanceId, newState: "RESTED" } });

  const attackerFound = findCardInState(nextState, attackerInstanceId)!;
  const attackerData = cardDb.get(attackerFound.card.cardId)!;
  const attackerPower = getEffectivePower(attackerFound.card, attackerData, nextState, cardDb);

  const defenderFound = findCardInState(nextState, targetInstanceId)!;
  const defenderData = cardDb.get(defenderFound.card.cardId)!;
  const defenderPower = getEffectivePower(defenderFound.card, defenderData, nextState, cardDb);

  const battle = {
    battleId: nanoid(),
    attackerInstanceId,
    targetInstanceId,
    attackerPower,
    defenderPower,
    counterPowerAdded: 0,
    blockerActivated: false,
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
  nextState = { ...nextState, turn: { ...nextState.turn, battleSubPhase: "BLOCK_STEP" } };
  events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "ATTACK_STEP", to: "BLOCK_STEP" } });

  return { state: nextState, events };
}

// ─── Declare Blocker ──────────────────────────────────────────────────────────

export function executeDeclareBlocker(
  state: GameState,
  blockerInstanceId: string,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);

  // Rest the blocker
  let nextState = setCardState(state, inactiveIdx, blockerInstanceId, "RESTED");
  events.push({ type: "CARD_STATE_CHANGED", playerIndex: inactiveIdx, payload: { cardInstanceId: blockerInstanceId, newState: "RESTED" } });

  // Replace the target in BattleContext
  const battle = nextState.turn.battle!;
  const updatedBattle = { ...battle, targetInstanceId: blockerInstanceId, blockerActivated: true };

  // Recalculate defender power with new target
  const blockerFound = findCardInState(nextState, blockerInstanceId)!;
  const blockerData = cardDb.get(blockerFound.card.cardId)!;
  const blockerPower = getEffectivePower(blockerFound.card, blockerData, nextState, cardDb);

  nextState = {
    ...nextState,
    turn: {
      ...nextState.turn,
      battle: { ...updatedBattle, defenderPower: blockerPower },
    },
  };

  events.push({ type: "BLOCK_DECLARED", playerIndex: inactiveIdx, payload: { blockerInstanceId } });
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
  nextState = { ...nextState, turn: { ...nextState.turn, battleSubPhase: "COUNTER_STEP" } };
  events.push({ type: "PHASE_CHANGED", playerIndex: inactiveIdx, payload: { from: "BLOCK_STEP", to: "COUNTER_STEP" } });

  return { state: nextState, events };
}

// ─── Pass (battle sub-phase transitions) ──────────────────────────────────────

export function executePass(state: GameState, cardDb: Map<string, CardData>): ExecuteResult {
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
    nextState = { ...nextState, turn: { ...nextState.turn, battleSubPhase: "COUNTER_STEP" } };
    events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "BLOCK_STEP", to: "COUNTER_STEP" } });
  } else if (state.turn.battleSubPhase === "COUNTER_STEP") {
    // Defender passes counter window → advance to DAMAGE_STEP
    nextState = { ...nextState, turn: { ...nextState.turn, battleSubPhase: "DAMAGE_STEP" } };
    events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "COUNTER_STEP", to: "DAMAGE_STEP" } });
    // Run damage resolution immediately
    const dmgResult = executeDamageStep(nextState, cardDb);
    nextState = dmgResult.state;
    events.push(...dmgResult.events);
    return {
      state: nextState,
      events,
      damagedPlayerIndex: dmgResult.damagedPlayerIndex,
      ...(dmgResult.pendingPrompt && { pendingPrompt: dmgResult.pendingPrompt }),
    };
  }

  return { state: nextState, events };
}

// ─── Symbol Counter ───────────────────────────────────────────────────────────

export function executeUseCounter(
  state: GameState,
  cardInstanceId: string,
  counterTargetInstanceId: string,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);

  const found = findCardInState(state, cardInstanceId)!;
  const cardData = cardDb.get(found.card.cardId)!;
  const counterValue = cardData.counter!;

  // Trash the counter card from hand
  let nextState = moveCard(state, cardInstanceId, "TRASH");

  // Add counter power to battle context
  const battle = nextState.turn.battle!;
  const targetFound = findCardInState(nextState, battle.targetInstanceId);
  if (targetFound) {
    const targetData = cardDb.get(targetFound.card.cardId);
    const newCounterPower = battle.counterPowerAdded + counterValue;
    const newDefenderPower = targetData
      ? getBattleDefenderPower(targetFound.card, targetData, newCounterPower, nextState)
      : battle.defenderPower + counterValue;

    nextState = {
      ...nextState,
      turn: {
        ...nextState.turn,
        battle: { ...battle, counterPowerAdded: newCounterPower, defenderPower: newDefenderPower },
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
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);

  const found = findCardInState(state, cardInstanceId)!;
  const cardData = cardDb.get(found.card.cardId)!;
  const cost = getEffectiveCost(cardData, state, cardInstanceId, cardDb);

  // Pay cost
  let nextState = restDonForCost(state, inactiveIdx, cost)!;
  // Trash the event
  nextState = moveCard(nextState, cardInstanceId, "TRASH");

  events.push({
    type: "COUNTER_USED",
    playerIndex: inactiveIdx,
    payload: { cardId: cardData.id, cardInstanceId, type: "event" },
  });

  return { state: nextState, events };
}

// ─── Reveal Trigger ───────────────────────────────────────────────────────────

export function executeRevealTrigger(
  state: GameState,
  reveal: boolean,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const battle = state.turn.battle as typeof state.turn.battle & { pendingTriggerLifeCard?: LifeCard };
  // OPT-259 (F6): effect-sourced damage parks its pending Trigger on turn
  // state rather than battle state. Route to the effect-damage resolver when
  // no battle trigger is pending.
  if (!battle?.pendingTriggerLifeCard && state.turn.pendingTriggerFromEffect) {
    return executeRevealEffectDamageTrigger(state, reveal, cardDb);
  }

  const events: PendingEvent[] = [];
  const inactiveIdx = getInactivePlayerIndex(state);
  let nextState = state;

  if (!battle?.pendingTriggerLifeCard) return { state, events };

  const lifeCard = battle.pendingTriggerLifeCard;

  if (reveal) {
    // Activate trigger — card goes to trash (rules §10-1-5-3)
    const trashCard = {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      zone: "TRASH" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: null,
      controller: inactiveIdx,
      owner: inactiveIdx,
    };
    const newPlayers = [...nextState.players] as typeof nextState.players;
    newPlayers[inactiveIdx] = {
      ...newPlayers[inactiveIdx],
      trash: [trashCard, ...newPlayers[inactiveIdx].trash],
    };
    nextState = { ...nextState, players: newPlayers };
    // OPT-257 (F4): mark the just-trashed Life card as staging so trash-targeting
    // effects (PLAY_CARD source_zone TRASH, TRASH_COUNT, etc.) don't see it
    // during this Trigger's resolution. Cleared after resolveEffect returns —
    // any pending prompt's candidate list is already built/locked at that point.
    nextState = pushTriggerStaging(nextState, lifeCard.instanceId);
    events.push({ type: "TRIGGER_ACTIVATED", playerIndex: inactiveIdx, payload: { cardId: lifeCard.cardId, activated: true } });

    // If the trigger card has an effectSchema with a TRIGGER block, resolve it
    const triggerCardData = cardDb.get(lifeCard.cardId);
    if (triggerCardData?.type === "Event") {
      events.push({
        type: "EVENT_TRIGGER_RESOLVED",
        playerIndex: inactiveIdx,
        payload: { cardId: lifeCard.cardId, cardInstanceId: lifeCard.instanceId },
      });
    }
    const schema = triggerCardData?.effectSchema as EffectSchema | null;
    if (schema?.effects) {
      const triggerBlock = schema.effects.find(
        (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "TRIGGER",
      );
      if (triggerBlock) {
        const effectResult = resolveEffect(
          nextState,
          triggerBlock,
          lifeCard.instanceId,
          inactiveIdx,
          cardDb,
        );
        nextState = effectResult.state;
        events.push(...effectResult.events);
        nextState = popTriggerStaging(nextState, lifeCard.instanceId);
        // If the trigger effect needs player input, end the battle first
        // then surface the prompt — battle is over, we're just resolving the effect
        if (effectResult.pendingPrompt) {
          nextState = endBattle(nextState, events);
          return { state: nextState, events, pendingPrompt: effectResult.pendingPrompt };
        }
      } else {
        nextState = popTriggerStaging(nextState, lifeCard.instanceId);
      }
    } else {
      nextState = popTriggerStaging(nextState, lifeCard.instanceId);
    }
  } else {
    // Decline trigger — add to hand
    const handCard = {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      zone: "HAND" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: null,
      controller: inactiveIdx,
      owner: inactiveIdx,
    };
    const newPlayers = [...nextState.players] as typeof nextState.players;
    newPlayers[inactiveIdx] = {
      ...newPlayers[inactiveIdx],
      hand: [...newPlayers[inactiveIdx].hand, handCard],
    };
    nextState = { ...nextState, players: newPlayers };
    events.push({ type: "CARD_ADDED_TO_HAND_FROM_LIFE", playerIndex: inactiveIdx, payload: { cardId: lifeCard.cardId, cardInstanceId: lifeCard.instanceId } });
  }

  // OPT-240: emit CARD_REMOVED_FROM_LIFE AFTER the Trigger window fully
  // resolves (or is declined). Auto-effects watching this event (e.g.
  // OP08-105 Bonney) observe the post-trigger board state, so a Trigger
  // that KOs the watcher suppresses its fire via the on-field check.
  events.push({
    type: "CARD_REMOVED_FROM_LIFE",
    playerIndex: inactiveIdx,
    payload: { cardInstanceId: lifeCard.instanceId },
  });

  // Clear the pending trigger marker. The damage that opened this window is
  // now complete — decrement damagesRemaining and continue the DA sequence
  // (OPT-239 / qa_rules.md:229-231). If the Character was not DA, or we just
  // dealt the final damage, the continuation will exit via endBattle.
  const cleanedBattle = { ...battle };
  delete (cleanedBattle as Partial<typeof cleanedBattle & { pendingTriggerLifeCard?: LifeCard }>).pendingTriggerLifeCard;
  const remainingBefore = cleanedBattle.damagesRemaining ?? 1;
  cleanedBattle.damagesRemaining = Math.max(0, remainingBefore - 1);
  nextState = { ...nextState, turn: { ...nextState.turn, battle: cleanedBattle } };

  const cont = continueLeaderDamageSequence(nextState, cardDb);
  events.push(...cont.events);
  return { state: cont.state, events, damagedPlayerIndex: cont.damagedPlayerIndex };
}

// ─── Effect-damage Trigger resolver (OPT-259 / F6) ───────────────────────────

/**
 * Resume the damage loop after the defender accepts or declines a [Trigger]
 * window that was opened by effect-sourced damage (DEAL_DAMAGE). Mirrors the
 * battle-damage `executeRevealTrigger` accept/decline/resolve pattern but
 * consumes `turn.pendingTriggerFromEffect` instead of `battle.pendingTriggerLifeCard`.
 *
 * If the trigger effect itself pauses for player input, we end the damage
 * loop here (same policy the battle path uses at the `endBattle` branch) —
 * any remaining damages on a multi-damage effect are not dealt, matching
 * the precedent that trigger-effect resolution supersedes further damage.
 */
function executeRevealEffectDamageTrigger(
  state: GameState,
  reveal: boolean,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const pending = state.turn.pendingTriggerFromEffect;
  if (!pending) return { state, events };

  const { lifeCard, damagedPlayerIndex, remainingDamages, controllerIndex } = pending;
  let nextState: GameState = {
    ...state,
    turn: { ...state.turn, pendingTriggerFromEffect: null },
  };

  if (reveal) {
    // Trash the revealed Life card (rules §10-1-5-3) before resolving the
    // trigger block. The trigger block runs from the trash.
    const trashCard = {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      zone: "TRASH" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: null,
      controller: damagedPlayerIndex,
      owner: damagedPlayerIndex,
    };
    const newPlayers = [...nextState.players] as typeof nextState.players;
    newPlayers[damagedPlayerIndex] = {
      ...newPlayers[damagedPlayerIndex],
      trash: [trashCard, ...newPlayers[damagedPlayerIndex].trash],
    };
    nextState = { ...nextState, players: newPlayers };
    // OPT-257 (F4): see executeRevealTrigger above — staging marker keeps the
    // just-trashed Life card invisible to trash-targeting effects during the
    // Trigger's effect resolution.
    nextState = pushTriggerStaging(nextState, lifeCard.instanceId);
    events.push({ type: "TRIGGER_ACTIVATED", playerIndex: damagedPlayerIndex, payload: { cardId: lifeCard.cardId, activated: true } });

    const triggerCardData = cardDb.get(lifeCard.cardId);
    if (triggerCardData?.type === "Event") {
      events.push({
        type: "EVENT_TRIGGER_RESOLVED",
        playerIndex: damagedPlayerIndex,
        payload: { cardId: lifeCard.cardId, cardInstanceId: lifeCard.instanceId },
      });
    }
    const schema = triggerCardData?.effectSchema as EffectSchema | null;
    if (schema?.effects) {
      const triggerBlock = schema.effects.find(
        (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "TRIGGER",
      );
      if (triggerBlock) {
        const effectResult = resolveEffect(
          nextState,
          triggerBlock,
          lifeCard.instanceId,
          damagedPlayerIndex,
          cardDb,
        );
        nextState = effectResult.state;
        events.push(...effectResult.events);
        nextState = popTriggerStaging(nextState, lifeCard.instanceId);
        if (effectResult.pendingPrompt) {
          // Trigger effect itself needs input — abandon remaining damages
          // (parity with battle path at executeRevealTrigger's endBattle).
          events.push({
            type: "CARD_REMOVED_FROM_LIFE",
            playerIndex: damagedPlayerIndex,
            payload: { cardInstanceId: lifeCard.instanceId },
          });
          return { state: nextState, events, pendingPrompt: effectResult.pendingPrompt };
        }
      } else {
        nextState = popTriggerStaging(nextState, lifeCard.instanceId);
      }
    } else {
      nextState = popTriggerStaging(nextState, lifeCard.instanceId);
    }
  } else {
    const handResult = moveLifeCardToHand(nextState, lifeCard, damagedPlayerIndex);
    nextState = handResult.state;
    events.push(...handResult.events);
    // Decline emits the REMOVED event inside moveLifeCardToHand — we do NOT
    // want to emit it again below, so return after resuming remaining damage.
    const cont = continueEffectDamageSequence(
      nextState,
      cardDb,
      damagedPlayerIndex,
      remainingDamages,
      pending.sourceCardInstanceId,
      controllerIndex,
    );
    return {
      state: cont.state,
      events: [...events, ...cont.events],
      ...(cont.pendingPrompt && { pendingPrompt: cont.pendingPrompt }),
    };
  }

  // Accept path: emit REMOVED_FROM_LIFE after the trigger block resolves, per
  // OPT-240. Then resume the remaining damages.
  events.push({
    type: "CARD_REMOVED_FROM_LIFE",
    playerIndex: damagedPlayerIndex,
    payload: { cardInstanceId: lifeCard.instanceId },
  });

  const cont = continueEffectDamageSequence(
    nextState,
    cardDb,
    damagedPlayerIndex,
    remainingDamages,
    pending.sourceCardInstanceId,
    controllerIndex,
  );
  return {
    state: cont.state,
    events: [...events, ...cont.events],
    ...(cont.pendingPrompt && { pendingPrompt: cont.pendingPrompt }),
  };
}

/**
 * Deal `remainingDamages` more damages to `damagedPlayerIndex` as the
 * continuation of an effect-sourced damage loop (DEAL_DAMAGE). Pops Life
 * cards one at a time; on a [Trigger] reveal, parks state in
 * `turn.pendingTriggerFromEffect` and returns — the REVEAL_TRIGGER handler
 * will re-enter here. Lethal (life already 0) stops the loop.
 *
 * This is the shared continuation used by both the initial call from
 * `executeDealDamage` and the resume after `executeRevealEffectDamageTrigger`.
 */
export function continueEffectDamageSequence(
  state: GameState,
  cardDb: Map<string, CardData>,
  damagedPlayerIndex: 0 | 1,
  remainingDamages: number,
  sourceCardInstanceId: string,
  controllerIndex: 0 | 1,
): ExecuteResult {
  const events: PendingEvent[] = [];
  let nextState = state;

  for (let i = 0; i < remainingDamages; i++) {
    const popResult = popLifeForDamage(nextState, damagedPlayerIndex);
    if (popResult.lethal) break;
    if (!popResult.lifeCard) break;
    nextState = popResult.state;
    events.push(...popResult.events);

    const lifeCard = popResult.lifeCard;
    const cardData = cardDb.get(lifeCard.cardId);

    if (hasTrigger(cardData ?? ({ keywords: { trigger: false } } as CardData))) {
      const damagesAfterThis = remainingDamages - i - 1;
      nextState = {
        ...nextState,
        turn: {
          ...nextState.turn,
          pendingTriggerFromEffect: {
            lifeCard,
            damagedPlayerIndex,
            remainingDamages: damagesAfterThis,
            sourceCardInstanceId,
            controllerIndex,
          },
        },
      };
      events.push({
        type: "TRIGGER_ACTIVATED",
        playerIndex: damagedPlayerIndex,
        payload: { cardId: lifeCard.cardId },
      });
      return { state: nextState, events, damagedPlayerIndex };
    }

    const handResult = moveLifeCardToHand(nextState, lifeCard, damagedPlayerIndex);
    nextState = handResult.state;
    events.push(...handResult.events);
  }

  return { state: nextState, events, damagedPlayerIndex };
}

// ─── Leader-damage helpers (OPT-239) ────────────────────────────────────────

/**
 * Pop the top Life card for a damage resolution. Shared by battle damage
 * (`dealOneLeaderDamage`) and effect-sourced damage (`executeDealDamage`) so
 * both paths agree on the §7-1-4-1-1 ordering: lethal check first, then pop,
 * then emit LIFE_COUNT_BECOMES_ZERO if this damage drained the Life zone.
 *
 * OPT-255 (F2): popping here — before any Trigger window or caller-specific
 * resolution — ensures life-threshold conditions inside a `[Trigger]` block
 * evaluate against the post-pop life array.
 *
 * Does NOT emit `DAMAGE_DEALT` (payload shape differs between battle/effect
 * damage) and does NOT open the Trigger window — callers own both.
 */
export function popLifeForDamage(
  state: GameState,
  damagedPlayerIndex: 0 | 1,
): { state: GameState; lifeCard: LifeCard | null; lethal: boolean; events: PendingEvent[] } {
  const events: PendingEvent[] = [];

  if (state.players[damagedPlayerIndex].life.length === 0) {
    return { state, lifeCard: null, lethal: true, events };
  }

  const result = removeTopLifeCard(state, damagedPlayerIndex);
  if (!result) return { state, lifeCard: null, lethal: false, events };

  const { lifeCard, state: nextState } = result;

  if (nextState.players[damagedPlayerIndex].life.length === 0) {
    events.push({ type: "LIFE_COUNT_BECOMES_ZERO", playerIndex: damagedPlayerIndex, payload: {} });
  }

  return { state: nextState, lifeCard, lethal: false, events };
}

/**
 * Move a revealed Life card into the damaged player's hand and emit the
 * standard pair of events in the OPT-240 order (ADDED_TO_HAND before
 * REMOVED_FROM_LIFE). Used by both battle damage's no-[Trigger] path and by
 * effect damage whenever the revealed card lacks [Trigger] or the defender
 * declines to activate.
 */
export function moveLifeCardToHand(
  state: GameState,
  lifeCard: LifeCard,
  damagedPlayerIndex: 0 | 1,
): { state: GameState; events: PendingEvent[] } {
  const events: PendingEvent[] = [];
  const player = state.players[damagedPlayerIndex];
  const handCard = {
    instanceId: lifeCard.instanceId,
    cardId: lifeCard.cardId,
    zone: "HAND" as const,
    state: "ACTIVE" as const,
    attachedDon: [],
    turnPlayed: null,
    controller: damagedPlayerIndex,
    owner: damagedPlayerIndex,
  };
  const newPlayers = [...state.players] as typeof state.players;
  newPlayers[damagedPlayerIndex] = { ...player, hand: [...player.hand, handCard] };
  const nextState = { ...state, players: newPlayers };

  events.push({
    type: "CARD_ADDED_TO_HAND_FROM_LIFE",
    playerIndex: damagedPlayerIndex,
    payload: { cardId: lifeCard.cardId, cardInstanceId: lifeCard.instanceId },
  });
  events.push({
    type: "CARD_REMOVED_FROM_LIFE",
    playerIndex: damagedPlayerIndex,
    payload: { cardInstanceId: lifeCard.instanceId },
  });

  return { state: nextState, events };
}

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
): { state: GameState; events: PendingEvent[]; paused: boolean; damagedPlayerIndex?: 0 | 1; lethal?: boolean } {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);
  const inactiveIdx = getInactivePlayerIndex(state);

  const popResult = popLifeForDamage(state, inactiveIdx);
  if (popResult.lethal) {
    events.push({
      type: "DAMAGE_DEALT",
      playerIndex: pi,
      payload: { target: "leader", amount: 1, lethal: true, attackerInstanceId, attackerType },
    });
    return { state: popResult.state, events, paused: false, damagedPlayerIndex: inactiveIdx, lethal: true };
  }
  if (!popResult.lifeCard) return { state: popResult.state, events, paused: false };

  let nextState = popResult.state;
  const { lifeCard } = popResult;

  events.push({
    type: "DAMAGE_DEALT",
    playerIndex: pi,
    payload: { amount: 1, attackerInstanceId, attackerType },
  });
  events.push(...popResult.events);

  if (isBanish) {
    const trashCard = {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      zone: "TRASH" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: null,
      controller: inactiveIdx,
      owner: inactiveIdx,
    };
    const newPlayers = [...nextState.players] as typeof nextState.players;
    newPlayers[inactiveIdx] = {
      ...newPlayers[inactiveIdx],
      trash: [trashCard, ...newPlayers[inactiveIdx].trash],
    };
    nextState = { ...nextState, players: newPlayers };
    events.push({
      type: "CARD_REMOVED_FROM_LIFE",
      playerIndex: inactiveIdx,
      payload: { cardInstanceId: lifeCard.instanceId },
    });
    return { state: nextState, events, paused: false };
  }

  if (hasTrigger(cardDb.get(lifeCard.cardId) ?? ({ keywords: { trigger: false } } as CardData))) {
    const curBattle = nextState.turn.battle!;
    const updatedBattle = { ...curBattle, pendingTriggerLifeCard: lifeCard };
    nextState = {
      ...nextState,
      turn: { ...nextState.turn, battle: updatedBattle as typeof curBattle },
    };
    events.push({
      type: "TRIGGER_ACTIVATED",
      playerIndex: inactiveIdx,
      payload: { cardId: lifeCard.cardId },
    });
    return { state: nextState, events, paused: true };
  }

  const handResult = moveLifeCardToHand(nextState, lifeCard, inactiveIdx);
  return { state: handResult.state, events: [...events, ...handResult.events], paused: false };
}

/**
 * Drive `dealOneLeaderDamage` while `battle.damagesRemaining > 0`, pausing
 * on [Trigger] Life cards and aborting if the attacker leaves the field
 * between damages. Calls `endBattle` once the sequence completes (or aborts).
 *
 * Between damages, runs `recalculateBattlePowers` so Life-threshold power
 * buffs (e.g., ST09-001 Yamato gaining +1000 at ≤2 Life) apply to the 2nd
 * damage context — see qa_st-09.md:6-8 and qa_op03.md:283-285.
 */
function continueLeaderDamageSequence(
  state: GameState,
  cardDb: Map<string, CardData>,
): ExecuteResult & { damagedPlayerIndex?: 0 | 1 } {
  const events: PendingEvent[] = [];
  let nextState = state;
  let damagedPlayerIndex: 0 | 1 | undefined;

  while (true) {
    const battle = nextState.turn.battle;
    if (!battle) break;
    const remaining = battle.damagesRemaining ?? 0;
    if (remaining <= 0) break;

    // Attacker must still be on field to deal further damage (inferred from
    // §7-1-4 — damage dealing requires a source). If a [Trigger] K.O.'d the
    // attacker during the previous damage's window, skip remaining damage.
    const attackerFound = findCardInState(nextState, battle.attackerInstanceId);
    const onField =
      !!attackerFound &&
      (attackerFound.card.zone === "CHARACTER" || attackerFound.card.zone === "LEADER");
    if (!onField) break;

    // Re-apply modifiers so between-damage power conditions are honored.
    nextState = recalculateBattlePowers(nextState, cardDb);

    const attackerData = cardDb.get(attackerFound!.card.cardId);
    // OPT-253: [Banish] is suppressed while the attacker is effect-negated,
    // preserved if it came from an external GRANT_KEYWORD.
    const isBanish = attackerData
      ? hasEffectiveKeyword(attackerFound!.card, attackerData, "BANISH", nextState, cardDb)
      : false;
    const attackerType: "LEADER" | "CHARACTER" =
      attackerData?.type?.toUpperCase() === "LEADER" ? "LEADER" : "CHARACTER";

    const one = dealOneLeaderDamage(
      nextState,
      cardDb,
      battle.attackerInstanceId,
      isBanish,
      attackerType,
    );
    nextState = one.state;
    events.push(...one.events);
    if (one.damagedPlayerIndex !== undefined) damagedPlayerIndex = one.damagedPlayerIndex;

    if (one.paused) {
      // Pending Trigger: defender will send REVEAL_TRIGGER which re-enters
      // this function via executeRevealTrigger after resolution.
      return { state: nextState, events, damagedPlayerIndex };
    }

    // Damage completed (or lethal) — decrement remaining.
    const curBattle = nextState.turn.battle;
    if (curBattle) {
      nextState = {
        ...nextState,
        turn: {
          ...nextState.turn,
          battle: { ...curBattle, damagesRemaining: Math.max(0, remaining - 1) },
        },
      };
    }
    if (one.lethal) break;
  }

  nextState = endBattle(nextState, events);
  return { state: nextState, events, damagedPlayerIndex };
}

// ─── Recalculate Battle Powers ───────────────────────────────────────────────

/**
 * Recalculate attacker/defender power in the battle context using current
 * activeEffects. Called after trigger resolution and at damage step to ensure
 * modifiers from [When Attacking] / [On Your Opponent's Attack] are reflected.
 */
export function recalculateBattlePowers(
  state: GameState,
  cardDb: Map<string, CardData>,
): GameState {
  const battle = state.turn.battle;
  if (!battle) return state;

  const attackerFound = findCardInState(state, battle.attackerInstanceId);
  const defenderFound = findCardInState(state, battle.targetInstanceId);
  if (!attackerFound || !defenderFound) return state;

  const attackerData = cardDb.get(attackerFound.card.cardId);
  const defenderData = cardDb.get(defenderFound.card.cardId);
  if (!attackerData || !defenderData) return state;

  const newAttackerPower = getEffectivePower(attackerFound.card, attackerData, state, cardDb);
  const newDefenderPower = getBattleDefenderPower(
    defenderFound.card, defenderData, battle.counterPowerAdded, state, cardDb,
  );

  if (newAttackerPower === battle.attackerPower && newDefenderPower === battle.defenderPower) {
    return state;
  }

  return {
    ...state,
    turn: {
      ...state.turn,
      battle: { ...battle, attackerPower: newAttackerPower, defenderPower: newDefenderPower },
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
  instanceId: string,
): { found: ReturnType<typeof findCardInState>; onField: boolean } {
  const found = findCardInState(state, instanceId);
  const onField = !!found && (found.card.zone === "LEADER" || found.card.zone === "CHARACTER");
  return { found, onField };
}

function executeDamageStep(
  state: GameState,
  cardDb: Map<string, CardData>,
): ExecuteResult & { damagedPlayerIndex?: 0 | 1 } {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);
  const inactiveIdx = getInactivePlayerIndex(state);

  // OPT-243: guard against mid-step removal before we recalc powers or emit
  // CHARACTER_BATTLES. If either combatant left the field during Block /
  // Counter Step the battle aborts — no damage, no "battled" triggers.
  const battleBeforeRecalc = state.turn.battle!;
  const attackerCheck = isOnField(state, battleBeforeRecalc.attackerInstanceId);
  const targetCheck = isOnField(state, battleBeforeRecalc.targetInstanceId);
  if (!attackerCheck.onField || !targetCheck.onField) {
    const reason = !attackerCheck.onField ? "ATTACKER_LEFT_FIELD" : "TARGET_LEFT_FIELD";
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
  let damagedPlayerIndex: 0 | 1 | undefined;

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
        const attackerData = attackerFound ? cardDb.get(attackerFound.card.cardId) : undefined;
        // OPT-253: consult runtime keyword state so a negated attacker with
        // printed [Double Attack] locks in 1 damage, while a negated attacker
        // that was externally granted [Double Attack] still locks in 2.
        const damageCount = attackerFound && attackerData
          && hasEffectiveKeyword(attackerFound.card, attackerData, "DOUBLE_ATTACK", state, cardDb) ? 2 : 1;

        nextState = {
          ...nextState,
          turn: {
            ...nextState.turn,
            battle: { ...nextState.turn.battle!, damagesRemaining: damageCount },
          },
        };

        const cont = continueLeaderDamageSequence(nextState, cardDb);
        events.push(...cont.events);
        return {
          state: cont.state,
          events,
          damagedPlayerIndex: cont.damagedPlayerIndex ?? damagedPlayerIndex,
        };
      } else if (targetFound.card.zone === "CHARACTER") {
        // Emit COMBAT_VICTORY — attacker won against a character
        events.push({ type: "COMBAT_VICTORY", playerIndex: pi, payload: { cardInstanceId: battle.attackerInstanceId, targetInstanceId } });

        // Check for replacement effects before KO
        const replacement = checkReplacementForKO(nextState, targetInstanceId, "battle", pi as 0 | 1, cardDb);
        if (replacement.pendingPrompt) {
          events.push(...replacement.events);
          return { state: replacement.state, events, damagedPlayerIndex, pendingPrompt: replacement.pendingPrompt };
        }
        if (replacement.replaced) {
          nextState = replacement.state;
          events.push(...replacement.events);
        } else if (isRemovalProhibited(
          nextState,
          targetInstanceId,
          {
            action: "KO",
            cause: "BATTLE",
            causingController: pi as 0 | 1,
            sourceCardInstanceId: battle.attackerInstanceId,
          },
          cardDb,
        )) {
          // OPT-251: CANNOT_BE_KO (with cause BATTLE or ANY) prevents battle
          // K.O.'s like Luffy's "cannot be K.O.'d in battle by Strike Characters".
          // Combat Victory still fired; the character just doesn't leave the field.
        } else {
          // KO the character — use koCharacter() to preserve instanceId for ON_KO triggers
          const preKODonCount = targetFound.card.attachedDon.length;
          const koResult = koCharacter(nextState, targetInstanceId, pi as 0 | 1);
          if (koResult) {
            nextState = koResult.state;
            for (const ev of koResult.events) {
              if (ev.type === "CARD_KO" && ev.payload) {
                events.push({
                  type: "CARD_KO",
                  playerIndex: ev.playerIndex,
                  payload: { ...ev.payload, cause: "BATTLE", preKO_donCount: preKODonCount },
                });
              } else {
                events.push(ev);
              }
            }
          }
        }
      }
    }
  }
  // Attacker power < defender power: nothing happens

  // End of Battle
  nextState = endBattle(nextState, events);

  return { state: nextState, events, damagedPlayerIndex };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setCardState(
  state: GameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardState: "ACTIVE" | "RESTED",
): GameState {
  const player = state.players[playerIndex];
  const update = (card: { instanceId: string; state: string }) =>
    card.instanceId === instanceId ? { ...card, state: cardState } : card;

  const newPlayers = [...state.players] as typeof state.players;
  newPlayers[playerIndex] = {
    ...player,
    leader: update(player.leader) as typeof player.leader,
    characters: player.characters.map((c) => c ? update(c) as typeof c : null),
  };
  return { ...state, players: newPlayers };
}

function endBattle(
  state: GameState,
  events: PendingEvent[],
  options: { aborted?: boolean } = {},
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

  events.push({ type: "BATTLE_RESOLVED", playerIndex: state.turn.activePlayerIndex });
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
