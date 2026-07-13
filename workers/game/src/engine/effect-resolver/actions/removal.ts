/**
 * Action handlers: KO, RETURN_TO_HAND, RETURN_TO_DECK, TRASH_CARD, TRASH_FROM_HAND
 */

import type { Action, EffectResult } from "../../effect-types.js";
import type {
  BatchResumeMarker,
  CardData,
  GameState,
  PendingEvent,
  PendingPromptState,
  ResumeContext,
} from "../../../types.js";
import type { ActionResult } from "../types.js";
import { resolveAmount } from "../action-utils.js";
import { koCharacter, returnToHand, returnToDeck, trashCharacter } from "../card-mutations.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt, matchesFilterForTarget } from "../target-resolver.js";
import { processBatchReplacements } from "../../replacements.js";
import { findCardInstance } from "../../state.js";
import { scanEventsForTriggers } from "../../trigger-ordering.js";
import { isRemovalProhibited, type RemovalAction } from "../../prohibitions.js";
import { replacePendingEventReferences } from "../../events.js";
import { reorderDeckCards, transitionCard, transitionCards } from "../../zone-transition.js";
import type { EffectResolverServices } from "../services.js";

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
  preselectedTargets: string[] | undefined,
  services: EffectResolverServices,
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
  // KO-by-effect is also a removal from field, so the general removal/leave
  // replacements (e.g. OP16-014 Marco, OP15-090 Perona) intercept it too.
  // A prohibited removal never becomes a replaceable event. Filter before
  // replacement discovery so protected targets cannot prompt or pay a
  // substitute cost for an action that was never attemptable (OPT-459).
  const attemptableIds = filterProhibitedTargets(
    state, targetIds, "KO", "EFFECT", controller, sourceCardInstanceId, cardDb,
  );
  const batch = processBatchReplacements(
    state, attemptableIds, "KO", ["WOULD_BE_KO", "WOULD_BE_REMOVED_FROM_FIELD", "WOULD_LEAVE_FIELD"], "effect", controller, cardDb, services,
  );
  events.push(...batch.events);
  if (batch.pendingPrompt) {
    return { state: batch.state, events, succeeded: false, pendingPrompt: batch.pendingPrompt };
  }
  let nextState = batch.state;
  const unprotectedIds = batch.unprotectedIds;
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
      koedIds.push(result.transition.newInstanceId);
    }

    if (frameEvents.length > 0 && i + 1 < unprotectedIds.length) {
      const scan = scanEventsForTriggers(nextState, frameEvents, controller, cardDb);
      nextState = scan.state;
      replacePendingEventReferences(events, frameEvents, scan.events);
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
  preselectedTargets: string[] | undefined,
  services: EffectResolverServices,
): ActionResult {
  const events: PendingEvent[] = [];
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const attemptableIds = filterProhibitedTargets(
    state, targetIds, "RETURN_TO_HAND", "EFFECT", controller, sourceCardInstanceId, cardDb,
  );
  const batch = processBatchReplacements(
    state, attemptableIds, "RETURN_TO_HAND", ["WOULD_BE_REMOVED_FROM_FIELD", "WOULD_LEAVE_FIELD"], "effect", controller, cardDb, services,
  );
  events.push(...batch.events);
  if (batch.pendingPrompt) {
    return { state: batch.state, events, succeeded: false, pendingPrompt: batch.pendingPrompt };
  }

  // RETURN_TO_HAND emits CARD_RETURNED_TO_HAND, not CARD_KO — no ON_KO drain
  // is required between frames. Finalize the unprotected subset inline.
  let nextState = batch.state;
  const finalIds = batch.unprotectedIds;
  const finalizedIds: string[] = [];
  for (const id of finalIds) {
    const result = returnToHand(nextState, id);
    if (result) {
      nextState = result.state;
      events.push(...result.events);
      finalizedIds.push(result.transition.newInstanceId);
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
  preselectedTargets: string[] | undefined,
  services: EffectResolverServices,
  arrangementResolved = false,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const position = (params.position as "TOP" | "BOTTOM") ?? "BOTTOM";
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  const anyNumberTarget = action.target?.count && "any_number" in action.target.count;
  if (
    !preselectedTargets
    && allValidIds.length > 0
    && (needsPlayerTargetSelection(action.target, allValidIds) || anyNumberTarget)
  ) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  // Rule 3-1-7: when multiple cards enter a new area simultaneously, their
  // owner chooses the order. Hidden/open-area sources newly supported by
  // OPT-487 must pause before their identities are reset and committed.
  const sourceCards = targetIds.flatMap((id) => {
    const card = findCardInstance(state, id);
    return card ? [card] : [];
  });
  const owner = sourceCards[0]?.owner;
  const sourceZone = sourceCards[0]?.zone;
  const needsArrange = !arrangementResolved &&
    targetIds.length > 1 &&
    owner !== undefined &&
    (sourceZone === "HAND" || sourceZone === "TRASH" || sourceZone === "LIFE") &&
    sourceCards.length === targetIds.length &&
    sourceCards.every((card) => card.owner === owner && card.zone === sourceZone);
  if (needsArrange) {
    const sourceCard = findCardInstance(state, sourceCardInstanceId);
    const sourceData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
    const resumeContext: ResumeContext = {
      effectSourceInstanceId: sourceCardInstanceId,
      controller,
      pausedAction: action,
      remainingActions: [],
      resultRefs: [...resultRefs.entries()].map(([key, value]) => [key, value as unknown]),
      validTargets: targetIds,
    };
    const pendingPrompt: PendingPromptState = {
      options: {
        promptType: "ARRANGE_TOP_CARDS",
        cards: sourceCards,
        effectDescription: sourceData?.effectText ?? `Place the cards at the ${position === "TOP" ? "top" : "bottom"} of the deck in any order`,
        canSendToBottom: position === "BOTTOM",
        validTargets: [],
        maxKeep: 0,
      },
      respondingPlayer: owner,
      resumeContext,
    };
    return { state, events, succeeded: false, pendingPrompt };
  }

  const sameDeckIds = targetIds.filter((id) => findCardInstance(state, id)?.zone === "DECK");
  const reordered = reorderDeckCards(state, sameDeckIds, position);
  const crossZoneIds = targetIds.filter((id) => !sameDeckIds.includes(id));
  if (crossZoneIds.length === 0) {
    return {
      state: reordered.state,
      events,
      succeeded: reordered.reorderedInstanceIds.length > 0,
      result: {
        targetInstanceIds: reordered.reorderedInstanceIds,
        count: reordered.reorderedInstanceIds.length,
      },
    };
  }

  const attemptableIds = filterProhibitedTargets(
    reordered.state, crossZoneIds, "RETURN_TO_DECK", "EFFECT", controller, sourceCardInstanceId, cardDb,
  );
  const batch = processBatchReplacements(
    reordered.state, attemptableIds, "RETURN_TO_DECK", ["WOULD_BE_REMOVED_FROM_FIELD", "WOULD_LEAVE_FIELD"], "effect", controller, cardDb, services, position,
  );
  events.push(...batch.events);
  if (batch.pendingPrompt) {
    return { state: batch.state, events, succeeded: false, pendingPrompt: batch.pendingPrompt };
  }

  let nextState = batch.state;
  const finalIds = batch.unprotectedIds;
  const finalizedIds: string[] = [...reordered.reorderedInstanceIds];
  const finalizedByOldId = new Map<string, ReturnType<typeof returnToDeck>>();
  const executionOrder = position === "TOP" ? [...finalIds].reverse() : finalIds;
  for (const id of executionOrder) {
    const result = returnToDeck(nextState, id, position);
    if (result) {
      nextState = result.state;
      finalizedByOldId.set(id, result);
    }
  }
  for (const id of finalIds) {
    const result = finalizedByOldId.get(id);
    if (result) {
      events.push(...result.events);
      finalizedIds.push(result.transition.newInstanceId);
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
        trashedIds.push(result.transition.newInstanceId);
      }
    } else {
      const moved = transitionCard(nextState, id, "TRASH", {
        position: "TOP",
        preserveSourceTriggers: true,
      });
      if (!moved) continue;
      nextState = moved.state;
      trashedIds.push(moved.fact.newInstanceId);
      events.push({
        type: "CARD_TRASHED",
        playerIndex: moved.fact.owner,
        payload: {
          cardInstanceId: moved.fact.oldInstanceId,
          newCardInstanceId: moved.fact.newInstanceId,
          cardId: moved.fact.cardId,
          reason: "effect",
        },
      });
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

  // "You may trash…" — the player can decline by selecting 0 cards, and an
  // IF_DO chain after this action only fires when at least 1 was trashed.
  const optional = params.optional === true;

  // Use preselected targets from resume flow (player already chose)
  const selectedIds = preselectedTargets;

  // If no preselection and player needs to choose, prompt. Optional trashes
  // always prompt (even with exactly `amount` candidates, declining is legal).
  if (!selectedIds) {
    const validTargets = candidates.map((c) => c.instanceId);
    if (validTargets.length > amount || optional) {
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
          countMin: optional ? 0 : amount,
          countMax: amount,
          effectDescription: optional
            ? `You may trash up to ${amount} card(s) from hand`
            : `Choose ${amount} card(s) to trash from hand`,
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
  const moved = transitionCards(
    state,
    toTrash.map((card) => card.instanceId),
    "TRASH",
    { position: "TOP", preserveSourceTriggers: true },
  );

  events.push({ type: "CARD_TRASHED", playerIndex: targetController, payload: { count: moved.transitions.length, reason: "effect", from: "HAND" } });

  return {
    state: moved.state,
    events,
    succeeded: moved.transitions.length > 0,
    result: {
      targetInstanceIds: moved.transitions.map((transition) => transition.fact.newInstanceId),
      count: moved.transitions.length,
    },
  };
}
