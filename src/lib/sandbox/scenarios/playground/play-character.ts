// Playground scenario: the user plays a vanilla Character from hand by
// dragging it to a character slot. The real engine processes the action via
// `runPipeline` (OPT-305's adapter), so the play animation, DON cost
// deduction, and field arrival all fire from the engine's emitted events.
//
// First playground scenario — also the architecture's smoke test for
// playground mode. Vanilla card only (effectSchema: null) so no [On Play]
// chain runs; that path is deferred until effect-schema population lands.

import type { CardInstance, TurnState } from "@shared/game-types";
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

// OP01-025 (Roronoa Zoro) is a 3-cost Character — the only multi-cost vanilla
// Red Character in SANDBOX_CARD_DB. The card text references [Rush] but the
// sandbox bundle ships every entry with effectSchema: null (per OPT-287), so
// the engine treats it as a plain Character with no [On Play] chain.
const CHARACTER_TO_PLAY: CardInstance = makeCard({
  instanceId: "p0-hand-zoro",
  cardId: "OP01-025",
  zone: "HAND",
  controller: 0,
});

export const playCharacterScenario: Scenario = {
  id: "play-character",
  title: "Play Character",
  category: "playground",
  description:
    "Play the character from hand. The real engine processes the action; the play animation fires from the engine's emitted events. Reset to try again.",
  mode: "playground",
  // inputMode is unused in playground mode (the engine handles input gating
  // itself via phase/cost/zone validation). Set to "interactive" for type
  // safety and so the info panel renders the same Interactive treatment.
  inputMode: "interactive",
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
        hand: [CHARACTER_TO_PLAY],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        // 3 active DON: OP01-025's actual cost is 3, not 2 as the OPT-306
        // ticket description says. Engine validation rejects PLAY_CARD if
        // active unattached DON < cost, so size to the real cost.
        donCostArea: makeDonStack({ count: 3, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 7, prefix: "p0-don-deck" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({
          instanceId: "p1-leader",
          cardId: "OP01-060",
          zone: "LEADER",
          controller: 1,
        }),
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p1-deck-${i + 1}`,
            cardId: "OP02-060",
            zone: "DECK",
            controller: 1,
          }),
        ),
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
};
