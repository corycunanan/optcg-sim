// Spectator scenario (OPT-1054): both CARD_DRAWN events of a "draw 2" arrive
// in one server update, as they do from the engine. The board sees one batch,
// so only the deck's top card flips; the card under it is dealt already
// face-up 90ms behind, and both land flush in the reflowing hand.

import type { CardInstance, GameEvent } from "@shared/game-types";
import { drawTwoScenario } from "./draw-2";
import type { Scenario } from "../types";

const ME_DECK_TOP: CardInstance[] =
  drawTwoScenario.initialState.players[0].deck.slice(0, 2);

function drawEvent(card: CardInstance, timestamp: number): GameEvent {
  return {
    type: "CARD_DRAWN",
    playerIndex: 0,
    payload: {
      cardId: card.cardId,
      cardInstanceId: card.instanceId,
      source: "DECK",
    },
    timestamp,
  };
}

export const drawTwoOneUpdateScenario: Scenario = {
  ...drawTwoScenario,
  id: "draw-2-one-update",
  title: "Draw 2 (one update)",
  description:
    "Both CARD_DRAWN events arrive in one update. Only the deck's top card flips before it travels; the card under it comes off already face-up, and both land flush in the hand.",
  script: [
    {
      type: "event",
      event: drawEvent(ME_DECK_TOP[0], 1),
      batch: [drawEvent(ME_DECK_TOP[1], 2)],
    },
  ],
};
