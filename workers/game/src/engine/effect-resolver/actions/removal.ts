/**
 * Action handlers: KO, RETURN_TO_HAND, RETURN_TO_DECK, TRASH_CARD, TRASH_FROM_HAND
 */

import type { Action, EffectResult } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { resolveAmount } from "../action-utils.js";
import { koCharacter, returnToHand, returnToDeck } from "../card-mutations.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt, matchesFilterForTarget } from "../target-resolver.js";
import { checkReplacementForKO, checkReplacementForRemoval } from "../../replacements.js";
import { findCardInstance } from "../../state.js";

export function executeKO(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  let nextState = state;
  const koedIds: string[] = [];
  for (const id of targetIds) {
    // Check for replacement effects before completing the KO
    const replacement = checkReplacementForKO(nextState, id, "effect", controller, cardDb);
    if (replacement.pendingPrompt) {
      events.push(...replacement.events);
      return { state: replacement.state, events, succeeded: false, pendingPrompt: replacement.pendingPrompt };
    }
    if (replacement.replaced) {
      nextState = replacement.state;
      events.push(...replacement.events);
      continue; // KO was replaced — skip this target
    }

    const result = koCharacter(nextState, id, controller);
    if (result) {
      nextState = result.state;
      events.push(...result.events);
      koedIds.push(id);
    }
  }

  return {
    state: nextState,
    events,
    succeeded: koedIds.length > 0,
    result: { targetInstanceIds: koedIds, count: koedIds.length },
  };
}

export function executeReturnToHand(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  let nextState = state;
  const returnedIds: string[] = [];
  for (const id of targetIds) {
    const replacement = checkReplacementForRemoval(nextState, id, controller, cardDb);
    if (replacement.pendingPrompt) {
      events.push(...replacement.events);
      return { state: replacement.state, events, succeeded: false, pendingPrompt: replacement.pendingPrompt };
    }
    if (replacement.replaced) {
      nextState = replacement.state;
      events.push(...replacement.events);
      continue;
    }

    const result = returnToHand(nextState, id);
    if (result) {
      nextState = result.state;
      events.push(...result.events);
      returnedIds.push(id);
    }
  }

  return {
    state: nextState,
    events,
    succeeded: returnedIds.length > 0,
    result: { targetInstanceIds: returnedIds, count: returnedIds.length },
  };
}

export function executeReturnToDeck(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const position = (params.position as "TOP" | "BOTTOM") ?? "BOTTOM";
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  let nextState = state;
  const returnedIds: string[] = [];
  for (const id of targetIds) {
    const replacement = checkReplacementForRemoval(nextState, id, controller, cardDb);
    if (replacement.pendingPrompt) {
      events.push(...replacement.events);
      return { state: replacement.state, events, succeeded: false, pendingPrompt: replacement.pendingPrompt };
    }
    if (replacement.replaced) {
      nextState = replacement.state;
      events.push(...replacement.events);
      continue;
    }

    const result = returnToDeck(nextState, id, position);
    if (result) {
      nextState = result.state;
      events.push(...result.events);
      returnedIds.push(id);
    }
  }

  return {
    state: nextState,
    events,
    succeeded: returnedIds.length > 0,
    result: { targetInstanceIds: returnedIds, count: returnedIds.length },
  };
}

export function executeTrashCard(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  let nextState = state;
  const trashedIds: string[] = [];
  for (const id of targetIds) {
    const found = findCardInstance(nextState, id);
    if (!found) continue;

    // For characters on field, use KO-like logic (return DON!!)
    if (found.zone === "CHARACTER") {
      const result = koCharacter(nextState, id, controller);
      if (result) {
        nextState = result.state;
        events.push(...result.events);
        trashedIds.push(id);
      }
    } else {
      // For hand/deck cards, move to trash
      for (const [pi, player] of nextState.players.entries()) {
        const inHand = player.hand.findIndex((c) => c.instanceId === id);
        if (inHand !== -1) {
          const card = player.hand[inHand];
          const newHand = player.hand.filter((_, i) => i !== inHand);
          const newTrash = [{ ...card, zone: "TRASH" as const }, ...player.trash];
          const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
          newPlayers[pi] = { ...player, hand: newHand, trash: newTrash };
          nextState = { ...nextState, players: newPlayers };
          trashedIds.push(id);
          events.push({ type: "CARD_TRASHED", playerIndex: pi as 0 | 1, payload: { cardInstanceId: id, reason: "effect" } });
          break;
        }
      }
    }
  }

  return {
    state: nextState,
    events,
    succeeded: trashedIds.length > 0,
    result: { targetInstanceIds: trashedIds, count: trashedIds.length },
  };
}

export function executeTrashFromHand(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  _preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const targetController = (action.target?.controller === "OPPONENT")
    ? (controller === 0 ? 1 : 0) as 0 | 1
    : controller;
  const amount = resolveAmount(params.amount as number | { type: string }, resultRefs, state, controller, cardDb) || 1;
  const p = state.players[targetController];

  let candidates = [...p.hand];
  if (action.target?.filter) {
    candidates = candidates.filter((c) => matchesFilterForTarget(c, action.target!.filter!, cardDb, state));
  }

  if (candidates.length === 0) return { state, events, succeeded: false };

  // If opponent choosing, prompt
  if (action.target?.controller === "OPPONENT" || action.type === "TRASH_FROM_HAND") {
    const validTargets = candidates.map((c) => c.instanceId);
    if (validTargets.length > amount) {
      const resumeCtx: import("../../../types.js").ResumeContext = {
        effectSourceInstanceId: sourceCardInstanceId,
        controller,
        pausedAction: action,
        remainingActions: [],
        resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
        validTargets,
      };
      const pendingPrompt: import("../../../types.js").PendingPromptState = {
        promptType: "SELECT_TARGET",
        options: {
          validTargets,
          countMin: amount,
          countMax: amount,
          effectDescription: `Choose ${amount} card(s) to trash from hand`,
          ctaLabel: "Trash",
          cards: candidates.filter((c) => validTargets.includes(c.instanceId)),
        },
        respondingPlayer: targetController,
        resumeContext: resumeCtx,
      };
      return { state, events, succeeded: false, pendingPrompt };
    }
  }

  // Auto-select
  const toTrash = candidates.slice(0, amount);
  const toTrashIds = new Set(toTrash.map((c) => c.instanceId));
  const newHand = p.hand.filter((c) => !toTrashIds.has(c.instanceId));
  const newTrash = [...toTrash.map((c) => ({ ...c, zone: "TRASH" as const })), ...p.trash];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[targetController] = { ...p, hand: newHand, trash: newTrash };

  events.push({ type: "CARD_TRASHED", playerIndex: targetController, payload: { count: amount, reason: "effect" } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
    result: { targetInstanceIds: toTrash.map((c) => c.instanceId), count: amount },
  };
}
