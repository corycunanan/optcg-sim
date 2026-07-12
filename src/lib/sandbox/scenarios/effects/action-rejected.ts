import type { TurnState } from "@shared/game-types";
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

export const actionRejectedScenario: Scenario = {
  id: "action-rejected",
  title: "Action Rejected",
  category: "effects",
  description:
    "A soft-enabled card play is rejected by the server. The hand card shakes through the grey disabled treatment while the persistent reason appears in the mid-zone.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-025", "OP01-060"],
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
            instanceId: "p0-hand-rejected",
            cardId: "OP01-025",
            zone: "HAND",
            controller: 0,
          }),
        ],
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 2, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 8, prefix: "p0-don-deck" }),
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
  actionRejection: {
    action: { type: "PLAY_CARD", cardInstanceId: "p0-hand-rejected" },
    reason: "Need 1 more DON!!",
    sequence: 1,
  },
  script: [{ type: "checkpoint", label: "Rejection feedback visible" }],
};
