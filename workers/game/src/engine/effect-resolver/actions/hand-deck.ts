/**
 * Action handlers: PLACE_HAND_TO_DECK, RETURN_HAND_TO_DECK, HAND_WHEEL,
 * SHUFFLE_DECK, REVEAL, REVEAL_HAND, SEARCH_AND_PLAY
 */

import type { ActionOf, EffectResult } from "../../effect-types.js";
import { getActionParams } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent, PendingPromptState, ResumeContext } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { getSearchAndPlayPickLimit, resolveAmount } from "../action-utils.js";
import { findCardInstance } from "../../state.js";
import { matchesFilter } from "../../conditions.js";
import { transitionCards } from "../../zone-transition.js";
import { shuffleWithEngineContext } from "../../execution-context.js";

export function executePlaceHandToDeck(
  state: GameState,
  action: ActionOf<"PLACE_HAND_TO_DECK">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const position = params.position === "TOP" ? "TOP" : "BOTTOM";

  const p = state.players[controller];
  if (p.hand.length === 0) return { state, events, succeeded: false };

  // If the player needs to choose which cards to place, prompt them
  if (!preselectedTargets && p.hand.length > amount) {
    const validTargets = p.hand.map((c) => c.instanceId);
    const resumeCtx: ResumeContext = {
      effectSourceInstanceId: sourceCardInstanceId,
      controller,
      pausedAction: action,
      remainingActions: [],
      resultRefs: [],
      validTargets,
    };
    const pendingPrompt: PendingPromptState = {
      options: {
        promptType: "SELECT_TARGET",
        cards: [...p.hand],
        validTargets,
        countMin: Math.min(amount, p.hand.length),
        countMax: Math.min(amount, p.hand.length),
        effectDescription: `Choose ${amount} card(s) from your hand to place on ${position.toLowerCase()} of your deck`,
        ctaLabel: "Place on Deck",
      },
      respondingPlayer: controller,
      resumeContext: resumeCtx,
    };
    return { state, events, succeeded: false, pendingPrompt };
  }

  // Resolve selected cards
  const selectedIds = preselectedTargets ?? p.hand.slice(-amount).map((c) => c.instanceId);
  const moved = transitionCards(state, selectedIds, "DECK", { position });

  return {
    state: moved.state,
    events,
    succeeded: true,
    result: {
      targetInstanceIds: moved.transitions.map((transition) => transition.fact.newInstanceId),
      count: moved.transitions.length,
    },
  };
}

export function executeReturnHandToDeck(
  state: GameState,
  action: ActionOf<"RETURN_HAND_TO_DECK">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const position = params.position ?? "BOTTOM";
  const p = state.players[controller];
  if (p.hand.length === 0) return { state, events, succeeded: false };

  const moved = transitionCards(
    state,
    p.hand.map((card) => card.instanceId),
    "DECK",
    { position },
  );

  return {
    state: moved.state,
    events,
    succeeded: true,
    result: { targetInstanceIds: [], count: moved.transitions.length },
  };
}

export function executeHandWheel(
  state: GameState,
  action: ActionOf<"HAND_WHEEL">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const trashCount = resolveAmount(
    params.trash_count ?? params.amount ?? 0,
    resultRefs,
    state,
    controller,
    cardDb,
  );
  const drawCount = resolveAmount(
    params.draw_count ?? params.amount ?? 0,
    resultRefs,
    state,
    controller,
    cardDb,
  );

  const p = state.players[controller];

  // Trash cards from hand
  const toTrashCount = Math.min(trashCount, p.hand.length);
  if (toTrashCount === 0 && trashCount > 0) return { state, events, succeeded: false };

  const trashed = p.hand.slice(0, toTrashCount);
  let nextState = transitionCards(
    state,
    trashed.map((card) => card.instanceId),
    "TRASH",
    { position: "TOP" },
  ).state;

  events.push({ type: "CARD_TRASHED", playerIndex: controller, payload: { count: toTrashCount, reason: "hand_wheel", from: "HAND" } });

  // Draw cards
  const actualDraw = Math.min(drawCount, nextState.players[controller].deck.length);
  if (actualDraw > 0) {
    const drawn = nextState.players[controller].deck.slice(0, actualDraw);
    nextState = transitionCards(
      nextState,
      drawn.map((card) => card.instanceId),
      "HAND",
    ).state;

    for (const card of drawn) {
      events.push({ type: "CARD_DRAWN", playerIndex: controller, payload: { cardId: card.cardId } });
    }

    events.push({ type: "DRAW_OUTSIDE_DRAW_PHASE", playerIndex: controller, payload: { count: actualDraw } });
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
  action: ActionOf<"SHUFFLE_DECK">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const targetController: 0 | 1 =
    action.target?.controller === "OPPONENT"
      ? controller === 0
        ? 1
        : 0
      : controller;
  const p = state.players[targetController];
  const shuffled = shuffleWithEngineContext(state, p.deck);
  const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  newPlayers[targetController] = { ...p, deck: shuffled.values };

  return {
    state: { ...shuffled.state, players: newPlayers },
    events,
    succeeded: true,
  };
}

export function executeReveal(
  state: GameState,
  action: ActionOf<"REVEAL">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const source = params.source ?? "DECK";
  // "BOTH" = reveal (both players see), "CONTROLLER_ONLY" = look at (private peek)
  const visibility = params.visibility === "CONTROLLER_ONLY" ? "CONTROLLER_ONLY" : "BOTH";

  // Resolve which player's zone to reveal from
  const targetController: 0 | 1 =
    action.target?.controller === "OPPONENT"
      ? controller === 0
        ? 1
        : 0
      : controller;

  if (source === "DECK" || source === "DECK_TOP") {
    const p = state.players[targetController];
    const count = Math.min(amount, p.deck.length);
    if (count === 0) return { state, events, succeeded: false };

    const revealed = p.deck.slice(0, count);
    events.push({
      type: "CARDS_REVEALED",
      playerIndex: targetController,
      payload: {
        cards: revealed.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId })),
        source,
        visibility,
        ...(visibility === "CONTROLLER_ONLY" ? { visibleTo: controller } : {}),
      },
    });

    return {
      state,
      events,
      succeeded: true,
      result: {
        targetInstanceIds: revealed.map((c) => c.instanceId),
        count,
        revealedCards: revealed.map((card) => ({
          instanceId: card.instanceId,
          cardId: card.cardId,
          source,
          controller: targetController,
        })),
      },
    };
  }

  if (source === "LIFE_TOP") {
    const p = state.players[targetController];
    if (p.life.length === 0) return { state, events, succeeded: false };

    const topLife = p.life[0];
    events.push({
      type: "CARDS_REVEALED",
      playerIndex: targetController,
      payload: {
        cards: [{ instanceId: topLife.instanceId, cardId: topLife.cardId }],
        source,
        visibility,
        ...(visibility === "CONTROLLER_ONLY" ? { visibleTo: controller } : {}),
      },
    });

    return {
      state,
      events,
      succeeded: true,
      result: {
        targetInstanceIds: [topLife.instanceId],
        count: 1,
        revealedCards: [{
          instanceId: topLife.instanceId,
          cardId: topLife.cardId,
          source,
          controller: targetController,
        }],
      },
    };
  }

  return { state, events, succeeded: true };
}

export function executeRevealHand(
  state: GameState,
  action: ActionOf<"REVEAL_HAND">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const amount = params.amount ?? 1;
  const targetController: 0 | 1 =
    action.target?.controller === "OPPONENT"
      ? controller === 0
        ? 1
        : 0
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
      resultRefs: [...resultRefs.entries()],
      validTargets,
    };

    const pendingPrompt: PendingPromptState = {
      options: {
        promptType: "SELECT_TARGET",
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
      visibility: "BOTH",
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
  action: ActionOf<"SEARCH_AND_PLAY">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const sap = getActionParams(action, "SEARCH_AND_PLAY");
  const lookAt = sap.look_at ?? 5;
  const filter = sap.filter ?? {};
  const restDest = sap.rest_destination ?? "BOTTOM";
  const searchFullDeck = sap.search_full_deck ?? false;
  const shuffleAfter = sap.shuffle_after ?? false;

  const p = state.players[controller];
  const searchPool = searchFullDeck ? p.deck : p.deck.slice(0, Math.min(lookAt, p.deck.length));

  if (searchPool.length === 0) return { state, events, succeeded: false };

  // Find matching cards
  const matching = searchPool.filter((c) => matchesFilter(c, filter, cardDb, state, resultRefs));

  const validTargets = matching.map((c) => c.instanceId);

  if (validTargets.length === 0) {
    // No match — shuffle if needed, place rest at bottom
    let nextState = state;
    if (!searchFullDeck) {
      const restOfDeck = p.deck.slice(searchPool.length);
      const arrangedCards = [...searchPool];
      const newDeck = restDest.toUpperCase() === "BOTTOM"
        ? [...restOfDeck, ...arrangedCards]
        : [...arrangedCards, ...restOfDeck];
      const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
      newPlayers[controller] = { ...p, deck: newDeck };
      nextState = { ...nextState, players: newPlayers };
    }
    if (shuffleAfter) {
      const pp = nextState.players[controller];
      const shuffled = shuffleWithEngineContext(nextState, pp.deck);
      nextState = shuffled.state;
      const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
      newPlayers[controller] = { ...pp, deck: shuffled.values };
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
    resultRefs: [...resultRefs.entries()],
    validTargets,
  };
  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "ARRANGE_TOP_CARDS",
      cards: searchFullDeck ? matching : searchPool,
      effectDescription,
      canSendToBottom: restDest.toUpperCase() === "BOTTOM",
      validTargets,
      maxKeep: getSearchAndPlayPickLimit(sap, validTargets.length),
    },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events, succeeded: false, pendingPrompt };
}
