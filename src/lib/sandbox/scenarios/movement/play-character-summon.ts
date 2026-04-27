// Spectator scenario: a CARD_PLAYED event lands a Character on the field.
// Drives the hand → character flight in `card-animation-layer` and triggers
// the summon-arrival pop in `use-field-arrivals` (the field-card sees a new
// instanceId on the next render and runs the entry animation).

import type { CardInstance, GameEvent, TurnState } from "@shared/game-types";
import {
  makeCard,
  makeDonStack,
  makeLifeStack,
  playerSlot,
} from "../helpers";
import type { Scenario } from "../types";

const TURN: TurnState = {
  number: 1,
  activePlayerIndex: 0,
  phase: "MAIN",
  battleSubPhase: null,
  battle: null,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

const CHARACTER_TO_PLAY: CardInstance = makeCard({
  instanceId: "p0-hand-summon",
  cardId: "OP01-010",
  zone: "HAND",
  controller: 0,
});

const playEvent: GameEvent = {
  type: "CARD_PLAYED",
  playerIndex: 0,
  payload: {
    cardId: CHARACTER_TO_PLAY.cardId,
    cardInstanceId: CHARACTER_TO_PLAY.instanceId,
    zone: "CHARACTER",
    source: "HAND",
  },
  timestamp: 1,
};

export const playCharacterSummonScenario: Scenario = {
  id: "play-character-summon",
  title: "Play Character (Summon)",
  category: "movement",
  description:
    "A CARD_PLAYED event places a Character from hand into a free character slot. Exercises the hand → character flight in card-animation-layer and the summon-entry pop in use-field-arrivals.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-010"],
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
          CHARACTER_TO_PLAY,
          makeCard({ instanceId: "p0-hand-2", cardId: "ST01-006", zone: "HAND", controller: 0 }),
          makeCard({ instanceId: "p0-hand-3", cardId: "OP11-003", zone: "HAND", controller: 0 }),
        ],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        // 1 active DON in cost area is enough to pay for the cost-1 character
        // we play; the reducer doesn't actually charge cost (visible-delta
        // only) but the visual matches a legal play.
        donCostArea: makeDonStack({ count: 1, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 9, prefix: "p0-don-deck" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({
          instanceId: "p1-leader",
          cardId: "OP01-060",
          zone: "LEADER",
          controller: 1,
        }),
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [{ type: "event", event: playEvent }],
};
