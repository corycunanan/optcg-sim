/**
 * Action handlers: DRAW, SEARCH_DECK, SEARCH_TRASH_THE_REST, FULL_DECK_SEARCH, DECK_SCRY, MILL
 */

import type { Action, EffectResult } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent, PendingPromptState, ResumeContext } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { getActionParams } from "../../effect-types.js";
import { resolveAmount, shuffleArray } from "../action-utils.js";
import { findCardInstance } from "../../state.js";

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
  const filter = p_.filter ?? {};
  const restDest = p_.rest_destination ?? "BOTTOM";

  const p = state.players[controller];
  const topCards = p.deck.slice(0, Math.min(lookAt, p.deck.length));

  if (topCards.length === 0) {
    return { state, events, succeeded: false, result: { targetInstanceIds: [], count: 0 } };
  }

  // Find matching cards (valid picks)
  const matching = topCards.filter((c) => {
    const data = cardDb.get(c.cardId);
    if (!data) return false;
    if (filter.traits) {
      if (!filter.traits.every((t: string) => (data.types ?? []).includes(t))) return false;
    }
    if (filter.traits_contains) {
      const cardTraits = data.types ?? [];
      if (!filter.traits_contains.every((t: string) => cardTraits.some((tr: string) => tr.includes(t)))) return false;
    }
    if (filter.exclude_name && data.name === filter.exclude_name) return false;
    if (filter.card_type) {
      if (data.type.toUpperCase() !== (filter.card_type as string).toUpperCase()) return false;
    }
    if (filter.cost_min !== undefined && (data.cost ?? 0) < (filter.cost_min as number)) return false;
    if (filter.cost_max !== undefined && (data.cost ?? 0) > (filter.cost_max as number)) return false;
    return true;
  });

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
    promptType: "ARRANGE_TOP_CARDS",
    options: {
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
  const filter = (p_.filter ?? {}) as Record<string, any>;
  const restDest = (p_.rest_destination as string) ?? "TRASH";

  const p = state.players[controller];
  const topCards = p.deck.slice(0, Math.min(lookAt, p.deck.length));

  if (topCards.length === 0) {
    return { state, events, succeeded: false, result: { targetInstanceIds: [], count: 0 } };
  }

  // Find matching cards (valid picks) — reuse same filter logic as SEARCH_DECK
  const matching = topCards.filter((c) => {
    const data = cardDb.get(c.cardId);
    if (!data) return false;
    if (filter.traits) {
      if (!filter.traits.every((t: string) => (data.types ?? []).includes(t))) return false;
    }
    if (filter.traits_contains) {
      const cardTraits = data.types ?? [];
      if (!filter.traits_contains.every((t: string) => cardTraits.some((tr: string) => tr.includes(t)))) return false;
    }
    if (filter.card_type) {
      if (data.type.toUpperCase() !== (filter.card_type as string).toUpperCase()) return false;
    }
    if (filter.cost_min !== undefined && (data.cost ?? 0) < (filter.cost_min as number)) return false;
    if (filter.cost_max !== undefined && (data.cost ?? 0) > (filter.cost_max as number)) return false;
    if (filter.power_min !== undefined && (data.power ?? 0) < (filter.power_min as number)) return false;
    if (filter.power_max !== undefined && (data.power ?? 0) > (filter.power_max as number)) return false;
    if (filter.color) {
      const cardColors = data.color ?? [];
      if (!cardColors.some((clr: string) => clr.toUpperCase() === (filter.color as string).toUpperCase())) return false;
    }
    return true;
  });

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
    promptType: "ARRANGE_TOP_CARDS",
    options: {
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
  const filter = fds.filter ?? {};
  const shuffleAfter = fds.shuffle_after ?? true;

  const p = state.players[controller];
  if (p.deck.length === 0) return { state, events, succeeded: false };

  // Find matching cards in entire deck
  const matching = p.deck.filter((c) => {
    const data = cardDb.get(c.cardId);
    if (!data) return false;
    if (filter.traits && !filter.traits.every((t: string) => (data.types ?? []).includes(t))) return false;
    if (filter.traits_contains) {
      const cardTraits = data.types ?? [];
      if (!filter.traits_contains.every((t: string) => cardTraits.some((tr: string) => tr.includes(t)))) return false;
    }
    if (filter.exclude_name && data.name === filter.exclude_name) return false;
    if (filter.name && data.name !== filter.name) return false;
    if (filter.name_any_of && !filter.name_any_of.includes(data.name)) return false;
    if (filter.card_type && data.type.toUpperCase() !== (filter.card_type as string).toUpperCase()) return false;
    if (filter.cost_min !== undefined && (data.cost ?? 0) < (filter.cost_min as number)) return false;
    if (filter.cost_max !== undefined && (data.cost ?? 0) > (filter.cost_max as number)) return false;
    if (filter.color) {
      const cardColors = data.color ?? [];
      if (!cardColors.some((clr: string) => clr.toUpperCase() === (filter.color as string).toUpperCase())) return false;
    }
    return true;
  });

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
    promptType: "ARRANGE_TOP_CARDS",
    options: {
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
    promptType: "ARRANGE_TOP_CARDS",
    options: {
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
