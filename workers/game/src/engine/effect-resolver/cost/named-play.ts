/** Named hand Character payments share eligibility and canonical field entry. */
import type { Cost } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent } from "../../../types.js";
import { matchesFilter } from "../../conditions.js";
import {
  checkProhibitions,
  isCardPlayProhibitedByEffect,
} from "../../prohibitions.js";
import { transitionCard } from "../../zone-transition.js";

export function namedPlayCandidates(
  state: GameState,
  cost: Cost,
  controller: 0 | 1,
  cardDb: Map<string, CardData>
): string[] {
  if (cost.type !== "PLAY_NAMED_CARD_FROM_HAND" || !cost.card_name) return [];
  return state.players[controller].hand
    .filter((card) => {
      const data = cardDb.get(card.cardId);
      return (
        data?.type === "Character" &&
        data.name === cost.card_name &&
        (!cost.filter ||
          matchesFilter(
            card,
            cost.filter,
            cardDb,
            state,
            undefined,
            undefined,
            controller
          )) &&
        !isCardPlayProhibitedByEffect(state, card.instanceId, cardDb) &&
        !checkProhibitions(
          state,
          { type: "PLAY_CARD", cardInstanceId: card.instanceId },
          cardDb,
          controller
        )
      );
    })
    .map((card) => card.instanceId);
}

/** No DON!! payment: playing this Character is itself the activation cost. */
export function payNamedPlay(
  state: GameState,
  cost: Cost,
  instanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>
): { state: GameState; events: PendingEvent[] } | null {
  if (
    !namedPlayCandidates(state, cost, controller, cardDb).includes(instanceId)
  )
    return null;
  const slotIndex = state.players[controller].characters.indexOf(null);
  if (slotIndex < 0) return null;
  const moved = transitionCard(state, instanceId, "CHARACTER", {
    slotIndex,
    turnPlayed: state.turn.number,
  });
  if (!moved) return null;
  return {
    state: moved.state,
    events: [
      {
        type: "CARD_PLAYED",
        playerIndex: controller,
        payload: {
          cardInstanceId: moved.fact.newInstanceId,
          cardId: moved.fact.cardId,
          zone: "CHARACTER",
          source: "BY_EFFECT",
          sourceZone: "HAND",
          playedRested: false,
        },
      },
    ],
  };
}
