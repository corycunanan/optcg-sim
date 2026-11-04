/**
 * Action handlers: REDIRECT_ATTACK, DEAL_DAMAGE, SELF_TAKE_DAMAGE
 */

import type { ActionOf, EffectResult } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent } from "../../../types.js";
import type { EffectResolverServices } from "../services.js";
import type { ActionResult } from "../types.js";
import {
  computeAllValidTargets,
  autoSelectTargets,
  needsPlayerTargetSelection,
  buildSelectTargetPrompt,
} from "../target-resolver.js";
import { continueEffectDamageSequence } from "../../effect-damage.js";
import { resolveAmount } from "../action-utils.js";

// ─── REDIRECT_ATTACK ─────────────────────────────────────────────────────────

export function executeRedirectAttack(
  state: GameState,
  action: ActionOf<"REDIRECT_ATTACK">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[]
): ActionResult {
  const events: PendingEvent[] = [];

  // Only valid during an active battle
  if (!state.turn.battle) return { state, events, succeeded: false };

  const allValidIds =
    preselectedTargets ??
    computeAllValidTargets(
      state,
      action.target,
      controller,
      cardDb,
      sourceCardInstanceId,
      resultRefs
    );
  if (
    !preselectedTargets &&
    needsPlayerTargetSelection(action.target, allValidIds)
  ) {
    return buildSelectTargetPrompt(
      {
        ...state,
        turn: {
          ...state.turn,
          battle: { ...state.turn.battle, redirectWindow: true },
        },
      },
      action,
      allValidIds,
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs
    );
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0)
    return {
      state: {
        ...state,
        turn: {
          ...state.turn,
          battle: { ...state.turn.battle, redirectWindow: false },
        },
      },
      events,
      succeeded: false,
    };

  const newTarget = targetIds[0];
  const newBattle = {
    ...state.turn.battle,
    targetInstanceId: newTarget,
    redirectWindow: false,
    targetLocked: true,
  };
  const newTurn = { ...state.turn, battle: newBattle };

  events.push({
    type: "ATTACK_REDIRECTED",
    playerIndex: controller,
    payload: { newTargetInstanceId: newTarget },
  });

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
  action: ActionOf<"DEAL_DAMAGE">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  _preselectedTargets?: string[],
  services?: EffectResolverServices
): ActionResult {
  const params = action.params ?? {};
  const amount = resolveAmount(
    params.amount ?? 1,
    resultRefs,
    state,
    controller,
    cardDb
  );
  const opp: 0 | 1 = controller === 0 ? 1 : 0;

  const cont = continueEffectDamageSequence(
    state,
    cardDb,
    opp,
    amount,
    sourceCardInstanceId,
    controller,
    true,
    undefined,
    services?.publishCommittedEvents
  );

  // A [Trigger] window pauses the instruction on its EFFECT_DAMAGE frame
  // (OPT-963); the chain parks below it and learns the final count when the
  // frame completes (completeEffectDamageFrame).
  return {
    state: cont.state,
    events: cont.events,
    succeeded: cont.dealt > 0 || cont.lethalDamagePlayerIndex !== undefined,
    result: { targetInstanceIds: [], count: cont.dealt },
    ...(cont.lethalDamagePlayerIndex !== undefined
      ? { lethalDamagePlayerIndex: cont.lethalDamagePlayerIndex }
      : {}),
    ...(cont.pendingPrompt ? { pendingPrompt: cont.pendingPrompt } : {}),
  };
}

// ─── SELF_TAKE_DAMAGE ────────────────────────────────────────────────────────

export function executeSelfTakeDamage(
  state: GameState,
  action: ActionOf<"SELF_TAKE_DAMAGE">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  _preselectedTargets?: string[],
  services?: EffectResolverServices
): ActionResult {
  const params = action.params ?? {};
  const amount = resolveAmount(
    params.amount ?? 1,
    resultRefs,
    state,
    controller,
    cardDb
  );

  // Self-inflicted damage uses the same per-point Life/Trigger continuation;
  // controller and damaged player are independently represented by the frame.
  const cont = continueEffectDamageSequence(
    state, cardDb, controller, amount, sourceCardInstanceId, controller, true,
    undefined, services?.publishCommittedEvents
  );
  return {
    state: cont.state,
    events: cont.events,
    succeeded: cont.dealt > 0 || cont.lethalDamagePlayerIndex !== undefined,
    result: { targetInstanceIds: [], count: cont.dealt },
    ...(cont.lethalDamagePlayerIndex !== undefined
      ? { lethalDamagePlayerIndex: cont.lethalDamagePlayerIndex }
      : {}),
    ...(cont.pendingPrompt ? { pendingPrompt: cont.pendingPrompt } : {}),
  };
}
