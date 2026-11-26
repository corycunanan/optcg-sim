// Spectator scenario (OPT-1058): one update ends the Refresh Phase and
// draws. Attached DON!! slide out from under the Leader and two Characters
// to the cost area, 30ms apart, landing rested; then every rested card and
// DON!! stands up left to right, 60ms apart; then the draw plays.

import type { GameEvent, TurnState } from "@shared/game-types";
import {
  makeCard,
  makeDonStack,
  makeLifeStack,
  playerSlot,
} from "../helpers";
import type { Scenario } from "../types";

const TURN: TurnState = {
  number: 3,
  activePlayerIndex: 0,
  phase: "REFRESH",
  battleSubPhase: null,
  battle: null,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

const attached = (owner: string, count: number) =>
  makeDonStack({ count, prefix: `p0-don-on-${owner}`, attachedTo: owner });

const refreshEnd: GameEvent = {
  type: "PHASE_CHANGED",
  playerIndex: 0,
  payload: { from: "REFRESH", to: "DRAW" },
  timestamp: 1,
};
const draw: GameEvent = {
  type: "CARD_DRAWN",
  playerIndex: 0,
  payload: { cardId: "OP01-036", cardInstanceId: "p0-deck-1" },
  timestamp: 2,
};

export const refreshPhaseWaveScenario: Scenario = {
  id: "refresh-phase-wave",
  title: "Refresh Phase wave",
  category: "movement",
  description:
    "The Refresh Phase ends in one update: four attached DON!! slide out from under their cards to the cost area and land rested, then rested cards and DON!! stand up left to right, then the draw plays.",
  inputMode: "spectator",
  cardsUsed: ["OP01-031", "OP01-036", "OP13-028", "OP01-060"],
  initialState: {
    myIndex: 0,
    turn: TURN,
    players: [
      playerSlot({
        playerId: "p0",
        leader: makeCard({
          instanceId: "p0-leader",
          cardId: "OP01-031",
          zone: "LEADER",
          controller: 0,
          state: "RESTED",
          attachedDon: attached("p0-leader", 1),
        }),
        characters: [
          makeCard({
            instanceId: "p0-char-a",
            cardId: "OP13-028",
            zone: "CHARACTER",
            controller: 0,
            state: "RESTED",
            attachedDon: attached("p0-char-a", 2),
          }),
          null,
          makeCard({
            instanceId: "p0-char-b",
            cardId: "OP01-036",
            zone: "CHARACTER",
            controller: 0,
            state: "RESTED",
            attachedDon: attached("p0-char-b", 1),
          }),
          makeCard({
            instanceId: "p0-char-c",
            cardId: "OP01-036",
            zone: "CHARACTER",
            controller: 0,
          }),
          null,
        ],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-036",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 4, cardId: "OP01-031", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 2, prefix: "p0-don", state: "RESTED" }),
        donDeck: makeDonStack({ count: 4, prefix: "p0-don-deck" }),
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
  script: [{ type: "event", event: refreshEnd, batch: [draw] }],
};
