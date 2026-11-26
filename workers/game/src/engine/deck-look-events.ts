/**
 * OPT-1056: board-motion events for "look at the top N cards" effects.
 *
 * `DECK_TOP_LOOKED` is emitted when the selection opens, so both players see
 * the cards leave the deck. Identities are owner-only (GAME_EVENT_VISIBILITY).
 * `CARDS_PLACED_IN_DECK` is emitted when unpicked cards go back to one end of
 * the deck. It is public and names no card. Picks keep their own events
 * (CARD_DRAWN source "search", CARD_PLAYED source "search_and_play",
 * CARD_TRASHED reason "search_trash").
 */

import type { CardInstance, PendingEvent } from "../types.js";

export function deckTopLookedEvent(
  controller: 0 | 1,
  cards: readonly CardInstance[],
): PendingEvent {
  return {
    type: "DECK_TOP_LOOKED",
    playerIndex: controller,
    payload: {
      cards: cards.map((card) => ({ instanceId: card.instanceId, cardId: card.cardId })),
      count: cards.length,
    },
  };
}

/** Push a placement event when at least one card went back. */
export function pushCardsPlacedInDeck(
  events: PendingEvent[],
  controller: 0 | 1,
  count: number,
  position: "top" | "bottom" | "TOP" | "BOTTOM",
): void {
  if (count <= 0) return;
  events.push({
    type: "CARDS_PLACED_IN_DECK",
    playerIndex: controller,
    payload: { count, position: position.toUpperCase() === "TOP" ? "TOP" : "BOTTOM" },
  });
}
