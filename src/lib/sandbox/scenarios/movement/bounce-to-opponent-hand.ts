// Spectator scenario (OPT-1059): an opponent's Character returns to its
// owner's hand, which is face-down to the viewer. The card flips face-down on
// the field first, then makes the long trip while their hand opens a space.

import type { CardInstance, GameEvent, TurnState } from "@shared/game-types";
import { makeCard, makeDonStack, makeLifeStack, playerSlot } from "../helpers";
import type { Scenario } from "../types";

const TURN: TurnState = {
  number: 2,
  activePlayerIndex: 0,
  phase: "MAIN",
  battleSubPhase: null,
  battle: null,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

const BOUNCED_CARD_ID = "OP01-036";

const OPP_HAND: CardInstance[] = Array.from({ length: 4 }, (_, i) =>
  makeCard({
    instanceId: `p1-hand-${i + 1}`,
    cardId: "hidden",
    zone: "HAND",
    controller: 1,
  }),
);

// What the viewer receives: the field card is public, its new hand id is not.
const bounce: GameEvent = {
  type: "CARD_RETURNED_TO_HAND",
  playerIndex: 1,
  payload: {
    cardInstanceId: "p1-char-4",
    newCardInstanceId: "hidden",
    cardId: BOUNCED_CARD_ID,
    sourceZone: "CHARACTER",
    sourceController: 1,
    causingController: 0,
    movementCause: "EFFECT",
  },
  timestamp: 1,
};

export const bounceToOpponentHandScenario: Scenario = {
  id: "bounce-to-opponent-hand",
  title: "Return to the opponent's hand",
  category: "movement",
  description:
    "An opponent's Character returns to their face-down hand. It flips face-down on the field, then makes the long trip while their hand opens a space for it.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-060", BOUNCED_CARD_ID],
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
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 3, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 6, prefix: "p0-don-deck" }),
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
        characters: [
          null,
          null,
          null,
          makeCard({
            instanceId: "p1-char-4",
            cardId: BOUNCED_CARD_ID,
            zone: "CHARACTER",
            controller: 1,
          }),
          null,
        ],
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [{ type: "event", event: bounce }],
};
