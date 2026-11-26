// Spectator scenario (OPT-1055): a deck search that shuffles afterward. The
// picked card travels to the hand, then the deck riffles in place (three
// slices, two passes, 450ms) and pops. A second update shuffles the
// opponent's deck on its own.

import type { CardInstance, GameEvent } from "@shared/game-types";
import { drawTwoScenario } from "./draw-2";
import type { Scenario } from "../types";

const PICK: CardInstance = drawTwoScenario.initialState.players[0].deck[0];

const pickEvent: GameEvent = {
  type: "CARD_DRAWN",
  playerIndex: 0,
  payload: {
    cardId: PICK.cardId,
    cardInstanceId: PICK.instanceId,
    source: "DECK",
  },
  timestamp: 1,
};

function shuffled(playerIndex: 0 | 1, timestamp: number): GameEvent {
  return { type: "DECK_SHUFFLED", playerIndex, payload: {}, timestamp };
}

export const searchThenShuffleScenario: Scenario = {
  ...drawTwoScenario,
  id: "search-then-shuffle",
  title: "Search, then shuffle",
  description:
    "A searched card travels to the hand, then the deck riffles in place and pops (one update). Then the opponent's deck shuffles on its own.",
  script: [
    { type: "event", event: pickEvent, batch: [shuffled(0, 2)] },
    { type: "wait", ms: 1200 },
    { type: "event", event: shuffled(1, 3) },
  ],
};
