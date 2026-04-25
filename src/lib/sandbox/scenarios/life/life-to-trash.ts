// Spectator scenario: two face-up Life cards are trashed (mirrors the
// engine's `face_up_life` reason path) and fly as face-down tokens from the
// life zone to the trash pile. Distinct from life-to-hand by destination: the
// life zone routes to trash here, not hand. Per-card events (rather than the
// engine's `count: N` shape) are emitted so each token's flight is animated
// individually — the count-only payload is ignored by `eventToTransitions`
// for this reason.

import type { GameEvent, TurnState } from "@shared/game-types";
import {
  makeCard,
  makeDonStack,
  makeLifeStack,
  playerSlot,
} from "../helpers";
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

const trashFirstFaceUp: GameEvent = {
  type: "CARD_TRASHED",
  playerIndex: 0,
  payload: {
    cardInstanceId: "p0-life-1",
    from: "LIFE",
    reason: "face_up_life",
  },
  timestamp: 1,
};

const trashSecondFaceUp: GameEvent = {
  type: "CARD_TRASHED",
  playerIndex: 0,
  payload: {
    cardInstanceId: "p0-life-2",
    from: "LIFE",
    reason: "face_up_life",
  },
  timestamp: 2,
};

export const lifeToTrashScenario: Scenario = {
  id: "life-to-trash",
  title: "Face-up Life to trash",
  category: "life",
  description:
    "Two face-up Life cards are trashed (the engine's face_up_life reason path). Each flies as a face-down token from the life zone to the trash pile, distinct from life-to-hand which routes the same source to the hand. The cardId is intentionally omitted so the flight renders as a sleeve, matching the engine's count-only emission shape.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-060"],
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
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({
          count: 3,
          cardId: "OP01-001",
          prefix: "p0-life",
          face: "UP",
        }),
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
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    { type: "event", event: trashFirstFaceUp },
    { type: "wait", ms: 700 },
    { type: "event", event: trashSecondFaceUp },
  ],
};
