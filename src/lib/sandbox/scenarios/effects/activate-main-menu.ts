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
  oncePerTurnUsed: {
    activate_set_don_active: ["p0-leader-used"],
  },
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

export const activateMainMenuScenario: Scenario = {
  id: "activate-main-menu",
  title: "Activate Main Menu",
  category: "effects",
  description:
    "The used Leader keeps a dimmed action badge and disabled menu item. The available Stage has a full-strength badge; open its menu with click or keyboard and activate it through the real engine.",
  mode: "playground",
  inputMode: "interactive",
  cardsUsed: ["OP01-031", "OP09-060", "OP01-036", "OP01-060"],
  initialState: {
    myIndex: 0,
    turn: TURN,
    players: [
      playerSlot({
        playerId: "p0",
        leader: makeCard({
          instanceId: "p0-leader-used",
          cardId: "OP01-031",
          zone: "LEADER",
          controller: 0,
        }),
        stage: makeCard({
          instanceId: "p0-stage-available",
          cardId: "OP09-060",
          zone: "STAGE",
          controller: 0,
        }),
        hand: [
          makeCard({
            instanceId: "p0-hand-1",
            cardId: "OP01-036",
            zone: "HAND",
            controller: 0,
          }),
          makeCard({
            instanceId: "p0-hand-2",
            cardId: "OP01-036",
            zone: "HAND",
            controller: 0,
          }),
        ],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-036",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 5, cardId: "OP01-031", prefix: "p0-life" }),
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
};
