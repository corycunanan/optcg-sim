import type { GameEvent } from "@shared/game-types";

export type SpotlightKind = "EVENT" | "REVEAL" | "TRIGGER";

export interface SpotlightCard {
  cardId: string;
  instanceId?: string;
}

export interface SpotlightPresentation {
  id: string;
  kind: SpotlightKind;
  playerIndex: 0 | 1;
  cards: SpotlightCard[];
  source?: string;
  timestamp: number;
}

/** Keep board actions inert while a spotlight is visible or another player answers. */
export function shouldBlockBoardForSpotlight(
  hasActiveSpotlight: boolean,
  promptRespondingPlayer: 0 | 1 | null,
  myIndex: 0 | 1 | null
): boolean {
  const waitingForOtherPlayer =
    promptRespondingPlayer !== null && promptRespondingPlayer !== myIndex;
  return hasActiveSpotlight || waitingForOtherPlayer;
}

function isPublicCardId(cardId: string | undefined): cardId is string {
  return Boolean(cardId && cardId !== "hidden");
}

/** Convert a public game event into the card presentation shown at board center. */
export function eventToSpotlight(
  event: GameEvent
): SpotlightPresentation | null {
  const base = {
    id: `${event.type}-${event.playerIndex}-${event.timestamp}`,
    playerIndex: event.playerIndex,
    timestamp: event.timestamp,
  } as const;

  switch (event.type) {
    case "CARDS_REVEALED": {
      if (event.payload.visibility !== "BOTH") return null;
      const cards = event.payload.cards
        .filter((card) => isPublicCardId(card.cardId))
        .map((card) => ({
          cardId: card.cardId,
          instanceId: card.instanceId,
        }));
      if (cards.length === 0) return null;
      return {
        ...base,
        kind: "REVEAL",
        cards,
        source: event.payload.source,
      };
    }
    case "EVENT_ACTIVATED_FROM_HAND":
    case "EVENT_MAIN_RESOLVED_FROM_TRASH": {
      if (!isPublicCardId(event.payload.cardId)) return null;
      return {
        ...base,
        kind: "EVENT",
        cards: [
          {
            cardId: event.payload.cardId,
            instanceId: event.payload.cardInstanceId,
          },
        ],
        source:
          event.type === "EVENT_ACTIVATED_FROM_HAND" ? "hand" : "trash",
      };
    }
    case "COUNTER_USED": {
      if (
        event.payload.type !== "event" ||
        !isPublicCardId(event.payload.cardId)
      ) {
        return null;
      }
      return {
        ...base,
        kind: "EVENT",
        cards: [
          {
            cardId: event.payload.cardId,
            instanceId: event.payload.cardInstanceId,
          },
        ],
        source: "counter",
      };
    }
    case "TRIGGER_ACTIVATED": {
      if (
        event.payload.activated !== true ||
        !isPublicCardId(event.payload.cardId)
      ) {
        return null;
      }
      return {
        ...base,
        kind: "TRIGGER",
        cards: [{ cardId: event.payload.cardId }],
      };
    }
    default:
      return null;
  }
}

/** The newest presentable event wins when one accepted action emits a batch. */
export function findLatestSpotlight(
  events: readonly GameEvent[]
): SpotlightPresentation | null {
  let latest: SpotlightPresentation | null = null;
  for (const event of events) {
    latest = eventToSpotlight(event) ?? latest;
  }
  return latest;
}
