// Interactive scenario: a REDISTRIBUTE_DON prompt with two characters as
// valid sources and targets. Exercises the redistribute-don-overlay — Skip
// and Confirm both produce a REDISTRIBUTE_DON action that satisfies the
// predicate, so either path advances the runner past the prompt.
//
// Authored as `interactive` (the ticket lists this as `spectator`, but the
// redistribute-don-overlay is fundamentally interactive — Skip / Confirm /
// Undo buttons drive the action — and a spectator gate would render the
// overlay with non-functional buttons). Noted in PR description.

import type { CardInstance, DonInstance, TurnState } from "@shared/game-types";
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

const SOURCE_CHARACTER: CardInstance = {
  instanceId: "p0-char-source",
  cardId: "OP13-028",
  zone: "CHARACTER",
  state: "ACTIVE",
  attachedDon: [
    { instanceId: "p0-don-attached-1", state: "ACTIVE", attachedTo: "p0-char-source" },
    { instanceId: "p0-don-attached-2", state: "ACTIVE", attachedTo: "p0-char-source" },
    { instanceId: "p0-don-attached-3", state: "ACTIVE", attachedTo: "p0-char-source" },
  ],
  turnPlayed: null,
  controller: 0,
  owner: 0,
};

const TARGET_CHARACTER: CardInstance = {
  instanceId: "p0-char-target",
  cardId: "OP01-025",
  zone: "CHARACTER",
  state: "ACTIVE",
  attachedDon: [
    { instanceId: "p0-don-attached-4", state: "ACTIVE", attachedTo: "p0-char-target" },
  ],
  turnPlayed: null,
  controller: 0,
  owner: 0,
};

// Cost-area DON. Mix of unattached (active) tokens that aren't part of the
// redistribute pool — the overlay should leave these alone.
const COST_AREA_DON: DonInstance[] = makeDonStack({
  count: 2,
  prefix: "p0-don-cost",
});

const VALID_SOURCE_IDS = [SOURCE_CHARACTER.instanceId, TARGET_CHARACTER.instanceId];
const VALID_TARGET_IDS = VALID_SOURCE_IDS;

export const redistributeDonScenario: Scenario = {
  id: "redistribute-don",
  title: "Redistribute DON",
  category: "movement",
  description:
    "Two of your Characters share four DON between them. The REDISTRIBUTE_DON prompt opens the redistribute-don-overlay; drag DON between cards, then Confirm or Skip. The predicate accepts either path.",
  inputMode: "interactive",
  cardsUsed: ["OP01-031", "OP13-028", "OP01-025"],
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
        }),
        characters: [SOURCE_CHARACTER, TARGET_CHARACTER, null, null, null],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-036",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 5, cardId: "OP01-031", prefix: "p0-life" }),
        donCostArea: COST_AREA_DON,
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
  script: [
    {
      type: "prompt",
      prompt: {
        promptType: "REDISTRIBUTE_DON",
        validSourceCardIds: VALID_SOURCE_IDS,
        validTargetCardIds: VALID_TARGET_IDS,
        maxTransfers: 2,
        effectDescription: "Move up to 2 DON between your Characters.",
      },
    },
  ],
  expectedResponse: {
    allowedActionTypes: ["REDISTRIBUTE_DON"],
    // The overlay's Skip sends `transfers: []`; Confirm sends a non-empty
    // list. Both are valid completion paths for this scenario.
    predicate: (action) => action.type === "REDISTRIBUTE_DON",
    hint: "Drag DON between Characters, then Confirm — or Skip to end.",
  },
};
