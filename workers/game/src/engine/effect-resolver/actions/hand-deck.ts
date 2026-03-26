/**
 * Action handlers: PLACE_HAND_TO_DECK, RETURN_HAND_TO_DECK, HAND_WHEEL,
 * SHUFFLE_DECK, REVEAL, REVEAL_HAND, SEARCH_AND_PLAY
 */

import type { Action, EffectResult } from "../../effect-types.js";
import { getActionParams } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent, PendingPromptState, ResumeContext } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { resolveAmount, shuffleArray } from "../action-utils.js";
import { findCardInstance } from "../../state.js";

export function executePlaceHandToDeck(
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
  const position = (params.position as "TOP" | "BOTTOM") ?? "BOTTOM";

  const p = state.players[controller];
  const count = Math.min(amount, p.hand.length);
  if (count === 0) return { state, events, succeeded: false };

  // Auto-select last cards from hand
  const toPlace = p.hand.slice(-count);
  const newHand = p.hand.slice(0, -count);
  const placedCards = toPlace.map((c) => ({ ...c, zone: "DECK" as const }));
  const newDeck = position === "BOTTOM"
    ? [...p.deck, ...placedCards]
    : [...placedCards, ...p.deck];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, hand: newHand, deck: newDeck };

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
    result: { targetInstanceIds: toPlace.map((c) => c.instanceId), count },
  };
}

export function executeReturnHandToDeck(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const position = (params.position as "TOP" | "BOTTOM") ?? "BOTTOM";
  const p = state.players[controller];
  if (p.hand.length === 0) return { state, events, succeeded: false };

  const deckCards = p.hand.map((c) => ({ ...c, zone: "DECK" as const }));
  const newDeck = position === "BOTTOM"
    ? [...p.deck, ...deckCards]
    : [...deckCards, ...p.deck];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, hand: [], deck: newDeck };

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
    result: { targetInstanceIds: [], count: deckCards.length },
  };
}

export function executeHandWheel(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const trashCount = resolveAmount(params.trash_count as number | { type: string }, resultRefs, state, controller, cardDb) || (params.amount as number) || 0;
  const drawCount = resolveAmount(params.draw_count as number | { type: string }, resultRefs, state, controller, cardDb) || (params.amount as number) || 0;

  const p = state.players[controller];

  // Trash cards from hand
  const toTrashCount = Math.min(trashCount, p.hand.length);
  if (toTrashCount === 0 && trashCount > 0) return { state, events, succeeded: false };

  const trashed = p.hand.slice(0, toTrashCount);
  const newHand = p.hand.slice(toTrashCount);
  const newTrash = [...trashed.map((c) => ({ ...c, zone: "TRASH" as const })), ...p.trash];

  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[controller] = { ...p, hand: newHand, trash: newTrash };
  let nextState = { ...state, players: newPlayers };

  events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: toTrashCount, reason: "hand_wheel" } });

  // Draw cards
  const actualDraw = Math.min(drawCount, nextState.players[controller].deck.length);
  if (actualDraw > 0) {
    const pp = nextState.players[controller];
    const drawn = pp.deck.slice(0, actualDraw);
    const remainingDeck = pp.deck.slice(actualDraw);
    const updatedHand = [...pp.hand, ...drawn.map((c) => ({ ...c, zone: "HAND" as const }))];

    const np = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
    np[controller] = { ...pp, deck: remainingDeck, hand: updatedHand };
    nextState = { ...nextState, players: np };

    for (const card of drawn) {
      events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: card.cardId } });
    }
  }

  return {
    state: nextState,
    events,
    succeeded: true,
    result: { targetInstanceIds: [], count: toTrashCount + actualDraw },
  };
}

export function executeShuffleDeck(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const targetController = (action.target?.controller === "OPPONENT")
    ? (controller === 0 ? 1 : 0) as 0 | 1
    : controller;
  const p = state.players[targetController];
  const shuffled = shuffleArray([...p.deck]);
  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[targetController] = { ...p, deck: shuffled };

  return {
    state: { ...state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeReveal(
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
  const source = (params.source as string) ?? "DECK";

  if (source === "DECK" || source === "DECK_TOP") {
    const p = state.players[controller];
    const count = Math.min(amount, p.deck.length);
    if (count === 0) return { state, events, succeeded: false };

    const revealed = p.deck.slice(0, count);
    events.push({
      type: "CARDS_REVEALED",
      playerIndex: controller,
      payload: { cards: revealed.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId })), source },
    });

    return {
      state,
      events,
      succeeded: true,
      result: { targetInstanceIds: revealed.map((c) => c.instanceId), count },
    };
  }

  return { state, events, succeeded: true };
}

export function executeRevealHand(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = (params.amount as number) ?? 1;
  const targetController = (action.target?.controller === "OPPONENT")
    ? (controller === 0 ? 1 : 0) as 0 | 1
    : controller;
  const p = state.players[targetController];

  if (p.hand.length === 0) return { state, events, succeeded: false };

  const count = Math.min(amount, p.hand.length);

  const validTargets = p.hand.map((c) => c.instanceId);

  if (validTargets.length > count) {
    const resumeCtx: ResumeContext = {
      effectSourceInstanceId: sourceCardInstanceId,
      controller,
      pausedAction: action,
      remainingActions: [],
      resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
      validTargets,
    };

    const pendingPrompt: PendingPromptState = {
      promptType: "SELECT_TARGET",
      options: {
        validTargets,
        countMin: count,
        countMax: count,
        effectDescription: `Choose ${count} card(s) from opponent's hand to reveal`,
        ctaLabel: "Reveal",
        cards: p.hand,
        blindSelection: true,
      },
      respondingPlayer: controller,
      resumeContext: resumeCtx,
    };

    return { state, events, succeeded: false, pendingPrompt };
  }

  // All cards selected (hand size <= amount)
  events.push({
    type: "CARDS_REVEALED",
    playerIndex: targetController,
    payload: {
      cards: p.hand.slice(0, count).map((c) => ({ instanceId: c.instanceId, cardId: c.cardId })),
      source: "HAND",
    },
  });

  return {
    state,
    events,
    succeeded: true,
    result: { targetInstanceIds: p.hand.slice(0, count).map((c) => c.instanceId), count },
  };
}

export function executeSearchAndPlay(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const sap = getActionParams(action, "SEARCH_AND_PLAY");
  const lookAt = (sap.look_at as number) ?? 5;
  const filter = sap.filter ?? {};
  const restDest = sap.rest_destination ?? "BOTTOM";
  const searchFullDeck = sap.search_full_deck ?? false;
  const shuffleAfter = sap.shuffle_after ?? false;

  const p = state.players[controller];
  const searchPool = searchFullDeck ? p.deck : p.deck.slice(0, Math.min(lookAt, p.deck.length));

  if (searchPool.length === 0) return { state, events, succeeded: false };

  // Find matching cards
  const matching = searchPool.filter((c) => {
    const data = cardDb.get(c.cardId);
    if (!data) return false;
    if (filter.traits && !filter.traits.every((t: string) => (data.types ?? []).includes(t))) return false;
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
    // No match — shuffle if needed, place rest at bottom
    let nextState = state;
    if (!searchFullDeck) {
      const restOfDeck = p.deck.slice(searchPool.length);
      const arrangedCards = searchPool.map((c) => ({ ...c, zone: "DECK" as const }));
      const newDeck = restDest.toUpperCase() === "BOTTOM"
        ? [...restOfDeck, ...arrangedCards]
        : [...arrangedCards, ...restOfDeck];
      const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
      newPlayers[controller] = { ...p, deck: newDeck };
      nextState = { ...nextState, players: newPlayers };
    }
    if (shuffleAfter) {
      const pp = nextState.players[controller];
      const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
      newPlayers[controller] = { ...pp, deck: shuffleArray([...pp.deck]) };
      nextState = { ...nextState, players: newPlayers };
    }
    return { state: nextState, events, succeeded: false };
  }

  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const effectDescription = sourceCardData?.effectText ?? "Search and play a card.";

  // Tag the action with destination=FIELD so resume knows to play it
  const taggedAction = { ...action, params: { ...sap, destination: "FIELD" } };

  const resumeCtx: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: taggedAction,
    remainingActions: [],
    resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
    validTargets,
  };
  const pendingPrompt: PendingPromptState = {
    promptType: "ARRANGE_TOP_CARDS",
    options: {
      cards: searchFullDeck ? matching : searchPool,
      effectDescription,
      canSendToBottom: restDest.toUpperCase() === "BOTTOM",
      validTargets,
    },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events, succeeded: false, pendingPrompt };
}
