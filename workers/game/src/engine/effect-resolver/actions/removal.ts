/**
 * Action handlers: KO, RETURN_TO_HAND, RETURN_TO_DECK, TRASH_CARD, TRASH_FROM_HAND
 */

import type { Action, EffectResult } from "../../effect-types.js";
import type { BatchResumeMarker, CardData, GameState, PendingEvent } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { resolveAmount } from "../action-utils.js";
import { koCharacter, returnToHand, returnToDeck, trashCharacter } from "../card-mutations.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt, matchesFilterForTarget } from "../target-resolver.js";
import { processBatchReplacements } from "../../replacements.js";
import { findCardInstance } from "../../state.js";
import { scanEventsForTriggers } from "../../trigger-ordering.js";
import { isRemovalProhibited, type RemovalAction } from "../../prohibitions.js";

// OPT-251: filter targets that are protected by a "cannot be …" prohibition.
// Runs AFTER replacement effects — replacements (e.g., Tashigi rest-instead)
// are an opt-in swap, while prohibitions are a flat veto that silently drops
// the target from the batch.
function filterProhibitedTargets(
  state: GameState,
  ids: string[],
  action: RemovalAction,
  cause: "BATTLE" | "EFFECT",
  causingController: 0 | 1,
  sourceCardInstanceId: string | null,
  cardDb: Map<string, CardData>,
): string[] {
  return ids.filter((id) => !isRemovalProhibited(
    state,
    id,
    { action, cause, causingController, sourceCardInstanceId },
    cardDb,
  ));
}

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

  // OPT-219: one batch scan for the whole target set — cost paid once per
  // replacement regardless of how many targets it protects. The batch does
  // NOT finalize; it hands back the subset still eligible for KO so this
  // handler can run its own per-frame loop with rule 6-2 trigger drain.
  const batch = processBatchReplacements(state, targetIds, "KO", "WOULD_BE_KO", "effect", controller, cardDb);
  events.push(...batch.events);
  if (batch.pendingPrompt) {
    return { state: batch.state, events, succeeded: false, pendingPrompt: batch.pendingPrompt };
  }
  let nextState = batch.state;
  // OPT-251: drop targets covered by CANNOT_BE_KO / CANNOT_BE_REMOVED_FROM_FIELD
  // / CANNOT_LEAVE_FIELD before the K.O. frame loop begins.
  const unprotectedIds = filterProhibitedTargets(
    nextState, batch.unprotectedIds, "KO", "EFFECT", controller, sourceCardInstanceId, cardDb,
  );
  const koedIds: string[] = [];

  // OPT-172: rule 6-2 — drain ON_KO triggers between frames. Each frame KOs
  // one target, then scans its events for auto triggers. If any fire and more
  // targets remain, pause the batch so the resolver can resolve the triggers
  // before the next CARD_KO is emitted.
  for (let i = 0; i < unprotectedIds.length; i++) {
    const id = unprotectedIds[i];
    const frameEvents: PendingEvent[] = [];
    const result = koCharacter(nextState, id, controller);
    if (result) {
      nextState = result.state;
      events.push(...result.events);
      frameEvents.push(...result.events);
      koedIds.push(id);
    }

    if (frameEvents.length > 0 && i + 1 < unprotectedIds.length) {
      const scan = scanEventsForTriggers(nextState, frameEvents, controller, cardDb);
      nextState = scan.state;
      if (scan.triggers.length > 0) {
        const marker: BatchResumeMarker = {
          kind: "KO",
          pausedAction: action,
          remainingTargetIds: unprotectedIds.slice(i + 1),
          koedSoFar: koedIds,
        };
        return {
          state: nextState,
          events,
          succeeded: koedIds.length > 0,
          result: { targetInstanceIds: koedIds, count: koedIds.length },
          pendingBatchTriggers: { triggers: scan.triggers, marker },
        };
      }
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

  const batch = processBatchReplacements(state, targetIds, "RETURN_TO_HAND", "WOULD_BE_REMOVED_FROM_FIELD", "effect", controller, cardDb);
  events.push(...batch.events);
  if (batch.pendingPrompt) {
    return { state: batch.state, events, succeeded: false, pendingPrompt: batch.pendingPrompt };
  }

  // RETURN_TO_HAND emits CARD_RETURNED_TO_HAND, not CARD_KO — no ON_KO drain
  // is required between frames. Finalize the unprotected subset inline.
  let nextState = batch.state;
  const finalIds = filterProhibitedTargets(
    nextState, batch.unprotectedIds, "RETURN_TO_HAND", "EFFECT", controller, sourceCardInstanceId, cardDb,
  );
  const finalizedIds: string[] = [];
  for (const id of finalIds) {
    const result = returnToHand(nextState, id);
    if (result) {
      nextState = result.state;
      events.push(...result.events);
      finalizedIds.push(id);
    }
  }

  return {
    state: nextState,
    events,
    succeeded: finalizedIds.length > 0,
    result: { targetInstanceIds: finalizedIds, count: finalizedIds.length },
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

  const batch = processBatchReplacements(
    state, targetIds, "RETURN_TO_DECK", "WOULD_BE_REMOVED_FROM_FIELD", "effect", controller, cardDb, position,
  );
  events.push(...batch.events);
  if (batch.pendingPrompt) {
    return { state: batch.state, events, succeeded: false, pendingPrompt: batch.pendingPrompt };
  }

  let nextState = batch.state;
  const finalIds = filterProhibitedTargets(
    nextState, batch.unprotectedIds, "RETURN_TO_DECK", "EFFECT", controller, sourceCardInstanceId, cardDb,
  );
  const finalizedIds: string[] = [];
  for (const id of finalIds) {
    const result = returnToDeck(nextState, id, position);
    if (result) {
      nextState = result.state;
      events.push(...result.events);
      finalizedIds.push(id);
    }
  }

  return {
    state: nextState,
    events,
    succeeded: finalizedIds.length > 0,
    result: { targetInstanceIds: finalizedIds, count: finalizedIds.length },
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

    // For characters on field, trash (return DON!!) — NOT a KO per Rule 10-2-1-3
    if (found.zone === "CHARACTER") {
      // OPT-251: trash-from-field is a removal, so CANNOT_BE_REMOVED_FROM_FIELD
      // / CANNOT_LEAVE_FIELD block it. (CANNOT_BE_KO does NOT — trash is not K.O.)
      if (isRemovalProhibited(
        nextState, id,
        { action: "TRASH", cause: "EFFECT", causingController: controller, sourceCardInstanceId },
        cardDb,
      )) {
        continue;
      }
      const result = trashCharacter(nextState, id, controller);
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
  preselectedTargets?: string[],
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
    candidates = candidates.filter((c) => matchesFilterForTarget(c, action.target!.filter!, cardDb, state, resultRefs));
  }

  if (candidates.length === 0) return { state, events, succeeded: false };

  // Use preselected targets from resume flow (player already chose)
  const selectedIds = preselectedTargets;

  // If no preselection and player needs to choose, prompt
  if (!selectedIds) {
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
        options: {
          promptType: "SELECT_TARGET",
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

  // Trash the selected (or auto-selected) cards
  const toTrash = selectedIds
    ? candidates.filter((c) => selectedIds.includes(c.instanceId))
    : candidates.slice(0, amount);
  const toTrashIds = new Set(toTrash.map((c) => c.instanceId));
  const newHand = p.hand.filter((c) => !toTrashIds.has(c.instanceId));
  const newTrash = [...toTrash.map((c) => ({ ...c, zone: "TRASH" as const })), ...p.trash];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[targetController] = { ...p, hand: newHand, trash: newTrash };

  events.push({ type: "CARD_TRASHED", playerIndex: targetController, payload: { count: toTrash.length, reason: "effect" } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: toTrash.length > 0,
    result: { targetInstanceIds: toTrash.map((c) => c.instanceId), count: toTrash.length },
  };
}
