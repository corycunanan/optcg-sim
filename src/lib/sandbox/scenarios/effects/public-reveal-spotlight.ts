import type { GameEvent, TurnState } from "@shared/game-types";
import { makeCard, makeDonStack, makeLifeStack, playerSlot } from "../helpers";
import type { Scenario } from "../types";

const TURN: TurnState = {
  number: 3,
  activePlayerIndex: 0,
  phase: "MAIN",
  battleSubPhase: null,
  battle: null,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

const publicReveal: GameEvent = {
  type: "CARDS_REVEALED",
  playerIndex: 0,
  timestamp: 1,
  payload: {
    cards: [
      { cardId: "OP01-030", instanceId: "revealed-event" },
      { cardId: "OP01-025", instanceId: "revealed-character" },
    ],
    source: "search",
    visibility: "BOTH",
  },
};

export const publicRevealSpotlightScenario: Scenario = {
  id: "public-reveal-spotlight",
  title: "Public Reveal Spotlight",
  category: "effects",
  description:
    "A public two-card search result stages at board center, then dismisses after the shared one-second reveal dwell.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-060", "OP01-030", "OP01-025"],
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
            cardId: "OP01-010",
            zone: "HAND",
            controller: 0,
          }),
        ],
        life: makeLifeStack({
          count: 5,
          cardId: "OP01-001",
          prefix: "p0-life",
        }),
        donCostArea: makeDonStack({ count: 4, prefix: "p0-don" }),
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
        life: makeLifeStack({
          count: 5,
          cardId: "OP01-060",
          prefix: "p1-life",
        }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    { type: "event", event: publicReveal, delayMs: 100 },
    { type: "wait", ms: 3000 },
  ],
};

export const waitingRevealSpotlightScenario: Scenario = {
  ...publicRevealSpotlightScenario,
  id: "waiting-reveal-spotlight",
  title: "Waiting Reveal Spotlight",
  description:
    "The non-acting player holds a public reveal while their opponent chooses, with a keyboard-accessible spotlight-to-board toggle.",
  promptRespondingPlayer: 1,
  script: [
    { type: "event", event: publicReveal, delayMs: 100 },
    {
      type: "event",
      event: {
        type: "PHASE_CHANGED",
        playerIndex: 1,
        timestamp: 2,
        payload: { from: "MAIN", to: "END" },
      },
      delayMs: 100,
    },
  ],
};
