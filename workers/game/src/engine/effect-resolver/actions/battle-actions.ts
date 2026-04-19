/**
 * Action handlers: REDIRECT_ATTACK, DEAL_DAMAGE, SELF_TAKE_DAMAGE
 */

import type { Action, EffectResult } from "../../effect-types.js";
import type { CardData, CardInstance, GameState, PendingEvent } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt } from "../target-resolver.js";
import { continueEffectDamageSequence } from "../../battle.js";

// ─── REDIRECT_ATTACK ─────────────────────────────────────────────────────────

export function executeRedirectAttack(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];

  // Only valid during an active battle
  if (!state.turn.battle) return { state, events, succeeded: false };

  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const newTarget = targetIds[0];
  const newBattle = { ...state.turn.battle, targetInstanceId: newTarget };
  const newTurn = { ...state.turn, battle: newBattle };

  events.push({ type: "ATTACK_REDIRECTED", playerIndex: controller, payload: { newTargetInstanceId: newTarget } });

  return {
    state: { ...state, turn: newTurn },
    events,
    succeeded: true,
    result: { targetInstanceIds: [newTarget], count: 1 },
  };
}

// ─── DEAL_DAMAGE ─────────────────────────────────────────────────────────────

/**
 * OPT-259 (F6): effect-sourced damage is still "damage", so revealed Life
 * cards with [Trigger] must open a Trigger window. Delegates to
 * `continueEffectDamageSequence` in battle.ts so this path shares the
 * lethal-check / pop-life / Trigger-window / Life→hand ordering with battle
 * damage (via the popLifeForDamage + moveLifeCardToHand helpers).
 */
export function executeDealDamage(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const params = action.params ?? {};
  const amount = (params.amount as number) ?? 1;
  const opp = (controller === 0 ? 1 : 0) as 0 | 1;
  const startingLife = state.players[opp].life.length;

  const cont = continueEffectDamageSequence(
    state,
    cardDb,
    opp,
    amount,
    sourceCardInstanceId,
    controller,
  );

  const dealtSoFar = Math.max(0, startingLife - cont.state.players[opp].life.length);

  return {
    state: cont.state,
    events: cont.events,
    succeeded: dealtSoFar > 0 || !!cont.state.turn.pendingTriggerFromEffect,
    result: { targetInstanceIds: [], count: dealtSoFar },
  };
}

// ─── SELF_TAKE_DAMAGE ────────────────────────────────────────────────────────

export function executeSelfTakeDamage(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = (params.amount as number) ?? 1;

  let nextState = state;
  let dealt = 0;
  for (let i = 0; i < amount; i++) {
    const player = nextState.players[controller];
    if (player.life.length === 0) break;

    const lifeCard = player.life[0];
    const newLife = player.life.slice(1);
    const handCard: CardInstance = {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      zone: "HAND" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: null,
      controller: controller,
      owner: controller,
    };
    const newHand = [...player.hand, handCard];
    const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
    newPlayers[controller] = { ...player, life: newLife, hand: newHand };
    nextState = { ...nextState, players: newPlayers };
    dealt++;

    events.push({ type: "CARD_REMOVED_FROM_LIFE", playerIndex: controller, payload: { cardInstanceId: lifeCard.instanceId } });
  }

  return { state: nextState, events, succeeded: dealt > 0, result: { targetInstanceIds: [], count: dealt } };
}
