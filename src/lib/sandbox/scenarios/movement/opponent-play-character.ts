// Spectator scenario (OPT-1054): the opponent plays a Character from a hand
// that is face-down to the viewer. The card flips where it is in their hand,
// then travels face-up to its slot on a shallow arc.

import type { CardInstance, GameEvent, TurnState } from "@shared/game-types";
import { makeCard, makeDonStack, makeLifeStack, playerSlot } from "../helpers";
import type { Scenario } from "../types";

const TURN: TurnState = {
  number: 2,
  activePlayerIndex: 1,
  phase: "MAIN",
  battleSubPhase: null,
  battle: null,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

const PLAYED_CARD_ID = "OP01-010";

// The viewer only ever receives the redaction sentinel for this hand.
const OPP_HAND: CardInstance[] = Array.from({ length: 5 }, (_, i) =>
  makeCard({
    instanceId: `p1-hand-${i + 1}`,
    cardId: "hidden",
    zone: "HAND",
    controller: 1,
  })
);

const playEvent: GameEvent = {
  type: "CARD_PLAYED",
  playerIndex: 1,
  payload: {
    cardId: PLAYED_CARD_ID,
    cardInstanceId: OPP_HAND[2].instanceId,
    zone: "CHARACTER",
    source: "HAND",
  },
  timestamp: 1,
};

export const opponentPlayCharacterScenario: Scenario = {
  id: "opponent-play-character",
  title: "Opponent plays a Character",
  category: "movement",
  description:
    "The opponent plays a Character from their face-down hand. It flips in their hand first, then travels face-up to its slot.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-060", PLAYED_CARD_ID],
  initialState: {
    myIndex: 0,
    turn: TURN,
    players: [
      playerSlot({
        playerId: "p0",
        leader: makeCard({
          instanceId: "p0-leader",
          cardId: "OP01-001",
          zone: "LEADER",
          controller: 0,
        }),
        hand: [
          makeCard({
            instanceId: "p0-hand-1",
            cardId: "ST01-006",
            zone: "HAND",
            controller: 0,
          }),
          makeCard({
            instanceId: "p0-hand-2",
            cardId: "OP11-003",
            zone: "HAND",
            controller: 0,
          }),
        ],
        life: makeLifeStack({
          count: 5,
          cardId: "OP01-001",
          prefix: "p0-life",
        }),
        donDeck: makeDonStack({ count: 10, prefix: "p0-don-deck" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({
          instanceId: "p1-leader",
          cardId: "OP01-060",
          zone: "LEADER",
          controller: 1,
        }),
        hand: OPP_HAND,
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p1-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 1,
          })
        ),
        life: makeLifeStack({
          count: 5,
          cardId: "OP01-060",
          prefix: "p1-life",
        }),
        donCostArea: makeDonStack({ count: 2, prefix: "p1-don" }),
        donDeck: makeDonStack({ count: 8, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [{ type: "event", event: playEvent }],
};
