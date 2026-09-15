import type { CardData, GameState, LifeCard } from "../../types.js";
import { lifeToHandDestination } from "../life-destination.js";
import { transitionCard, type ZoneTransitionFact } from "../zone-transition.js";

/** Move proposed Life→hand cards in order, preserving replacement destinations.
 * Effects still process the move; activation costs distinguish it from payment.
 */
export function moveLifeToHand(
  state: GameState,
  cards: LifeCard[],
  owner: 0 | 1,
  cardDb: Map<string, CardData>
) {
  const transitions: {
    fact: ZoneTransitionFact;
    addedToHand: boolean;
  }[] = [];
  let replaced = false;
  for (const card of cards) {
    const destination = lifeToHandDestination(state, owner, card, cardDb);
    const moved = transitionCard(
      state,
      card.instanceId,
      destination === "DECK_BOTTOM" ? "DECK" : destination,
      { position: destination === "TRASH" ? "TOP" : "BOTTOM" }
    );
    if (!moved) continue;
    state = moved.state;
    replaced ||= destination !== "HAND";
    transitions.push({ fact: moved.fact, addedToHand: destination === "HAND" });
  }
  return { state, transitions, replaced };
}
