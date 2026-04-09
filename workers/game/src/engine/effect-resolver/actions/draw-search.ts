/**
 * Action handlers: DRAW, SEARCH_DECK, SEARCH_TRASH_THE_REST, FULL_DECK_SEARCH, DECK_SCRY, MILL
 */

import type { Action, EffectResult, TargetFilter } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent, PendingPromptState, ResumeContext } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { getActionParams } from "../../effect-types.js";
import { resolveAmount, shuffleArray } from "../action-utils.js";
import { findCardInstance } from "../../state.js";
import { matchesFilter } from "../../conditions.js";

export function executeDraw(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const p = getActionParams(action, "DRAW");
  const amount = resolveAmount(p.amount as number | { type: string }, resultRefs, state, controller, cardDb);
  if (amount <= 0) return { state, events, succeeded: false };

  const player = state.players[controller];
  const drawCount = Math.min(amount, player.deck.length);
  if (drawCount === 0) return { state, events, succeeded: false };

  const drawn = player.deck.slice(0, drawCount);
  const newDeck = player.deck.slice(drawCount);
  const newHand = [...player.hand, ...drawn.map((c) => ({ ...c, zone: "HAND" as const }))];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...player, deck: newDeck, hand: newHand };

  for (const card of drawn) {
    events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: card.cardId } });
  }

  if (drawCount > 0) {
    events.push({ type: "DRAW_OUTSIDE_DRAW_PHASE", playerIndex: controller, payload: { count: drawCount } });
  }

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
    result: { targetInstanceIds: drawn.map((c) => c.instanceId), count: drawCount },
  };
}

export function executeSearchDeck(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const p_ = getActionParams(action, "SEARCH_DECK");
  const lookAt = (p_.look_at as number) ?? 5;
  const filter = (p_.filter ?? {}) as TargetFilter;
  const restDest = p_.rest_destination ?? "BOTTOM";

  const p = state.players[controller];
  const topCards = p.deck.slice(0, Math.min(lookAt, p.deck.length));

  if (topCards.length === 0) {
    return { state, events, succeeded: false, result: { targetInstanceIds: [], count: 0 } };
  }

  // Find matching cards (valid picks)
  const matching = topCards.filter((c) => matchesFilter(c, filter, cardDb, state, resultRefs));

  const validTargets = matching.map((c) => c.instanceId);

  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const effectDescription = sourceCardData?.effectText ?? "Look at the top cards of your deck.";

  const resumeCtx: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [],
    resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
    validTargets,
  };
  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "ARRANGE_TOP_CARDS",
      cards: topCards,
      effectDescription,
      canSendToBottom: restDest.toUpperCase() === "BOTTOM",
      validTargets,
    },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events, succeeded: false, pendingPrompt };
}

export function executeSearchTrashTheRest(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const p_ = action.params ?? {};
  const lookAt = (p_.look_at as number) ?? 5;
  const filter = (p_.filter ?? {}) as TargetFilter;
  const restDest = (p_.rest_destination as string) ?? "TRASH";

  const p = state.players[controller];
  const topCards = p.deck.slice(0, Math.min(lookAt, p.deck.length));

  if (topCards.length === 0) {
    return { state, events, succeeded: false, result: { targetInstanceIds: [], count: 0 } };
  }

  // Find matching cards (valid picks)
  const matching = topCards.filter((c) => matchesFilter(c, filter, cardDb, state, resultRefs));

  const validTargets = matching.map((c) => c.instanceId);

  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const effectDescription = sourceCardData?.effectText ?? "Look at the top cards of your deck.";

  const resumeCtx: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [],
    resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
    validTargets,
  };
  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "ARRANGE_TOP_CARDS",
      cards: topCards,
      effectDescription,
      canSendToBottom: restDest.toUpperCase() === "BOTTOM",
      validTargets,
      restDestination: restDest,
    },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events, succeeded: false, pendingPrompt };
}

export function executeMill(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const p = getActionParams(action, "MILL");
  const amount = p.amount ?? 1;
  const player = state.players[controller];
  const millCount = Math.min(amount, player.deck.length);
  if (millCount === 0) return { state, events, succeeded: false };

  const milled = player.deck.slice(0, millCount);
  const newDeck = player.deck.slice(millCount);
  const newTrash = [...milled.map((c) => ({ ...c, zone: "TRASH" as const })), ...player.trash];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...player, deck: newDeck, trash: newTrash };

  events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: millCount, reason: "mill" } });

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
    result: { targetInstanceIds: milled.map((c) => c.instanceId), count: millCount },
  };
}

export function executeFullDeckSearch(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const fds = getActionParams(action, "FULL_DECK_SEARCH");
  const filter = (fds.filter ?? {}) as TargetFilter;
  const shuffleAfter = fds.shuffle_after ?? true;

  const p = state.players[controller];
  if (p.deck.length === 0) return { state, events, succeeded: false };

  // Find matching cards in entire deck
  const matching = p.deck.filter((c) => matchesFilter(c, filter, cardDb, state, resultRefs));

  const validTargets = matching.map((c) => c.instanceId);

  if (validTargets.length === 0) {
    // No matching cards — still shuffle if required
    if (shuffleAfter) {
      const shuffled = shuffleArray([...p.deck]);
      const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
      newPlayers[controller] = { ...p, deck: shuffled };
      return { state: { ...state, players: newPlayers }, events, succeeded: false };
    }
    return { state, events, succeeded: false };
  }

  // Build a prompt for the player to pick from matching cards
  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const effectDescription = sourceCardData?.effectText ?? "Search your deck.";

  const resumeCtx: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [],
    resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
    validTargets,
  };
  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "ARRANGE_TOP_CARDS",
      cards: matching,
      effectDescription,
      canSendToBottom: false,
      validTargets,
    },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events, succeeded: false, pendingPrompt };
}

export function executeDeckScry(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const p = getActionParams(action, "DECK_SCRY");
  const lookAt = p.look_at ?? 5;
  const player = state.players[controller];
  const count = Math.min(lookAt, player.deck.length);
  if (count === 0) return { state, events, succeeded: false };

  const topCards = player.deck.slice(0, count);

  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const effectDescription = sourceCardData?.effectText ?? "Look at the top cards of your deck and rearrange them.";

  const resumeCtx: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [],
    resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
    validTargets: [],
  };
  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "ARRANGE_TOP_CARDS",
      cards: topCards,
      effectDescription,
      canSendToBottom: true,
      validTargets: [], // no picks, just rearranging
    },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events, succeeded: false, pendingPrompt };
}
