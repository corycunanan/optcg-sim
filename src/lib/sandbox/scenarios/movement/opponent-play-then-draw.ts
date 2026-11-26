// Spectator scenario (OPT-1040 x OPT-1054): one update carries the opponent's
// Character play and then the viewer's draw. The board plays them as two
// beats: the played card flips in the opponent's hand and flies to its slot;
// only after it lands (plus the beat gap) does the drawn card flip on the
// deck and fly into the hand.

import type { CardInstance, GameEvent } from "@shared/game-types";
import { makeCard } from "../helpers";
import { opponentPlayCharacterScenario } from "./opponent-play-character";
import type { Scenario } from "../types";

const base = opponentPlayCharacterScenario;
const [me, opp] = base.initialState.players;

const MY_DECK: CardInstance[] = Array.from({ length: 6 }, (_, i) =>
  makeCard({
    instanceId: `p0-deck-${i + 1}`,
    cardId: "OP01-010",
    zone: "DECK",
    controller: 0,
  })
);

const playEvent: GameEvent = {
  type: "CARD_PLAYED",
  playerIndex: 1,
  payload: {
    cardId: "OP01-010",
    cardInstanceId: "p1-hand-3",
    zone: "CHARACTER",
    source: "HAND",
  },
  timestamp: 1,
};

const drawEvent: GameEvent = {
  type: "CARD_DRAWN",
  playerIndex: 0,
  payload: {
    cardId: MY_DECK[0].cardId,
    cardInstanceId: MY_DECK[0].instanceId,
    source: "DECK",
  },
  timestamp: 2,
};

export const opponentPlayThenDrawScenario: Scenario = {
  ...base,
  id: "opponent-play-then-draw",
  title: "Opponent plays, then you draw (one update)",
  description:
    "One update carries the opponent's Character play and then your draw. They play as two beats: the play flips and lands first, then the drawn card flips on the deck and flies to your hand.",
  cardsUsed: base.cardsUsed,
  initialState: {
    ...base.initialState,
    players: [{ ...me, deck: MY_DECK }, opp],
  },
  script: [{ type: "event", event: playEvent, batch: [drawEvent] }],
};
