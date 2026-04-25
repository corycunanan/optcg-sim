// Spectator scenario: an Event card resolves from hand to trash, and an
// opponent Character ([On K.O.] holder) is K.O.'d as the effect's payload.
// Exercises the `kind: "ko"` flight when the cause is EFFECT rather than
// BATTLE — same shrink + trash flight, but with no preceding rest visual.
// Minotaur is chosen as the defender so the [On K.O.] trigger lights up the
// trigger-animation chain in `card-animation-layer`.

import type { CardInstance, GameEvent, TurnState } from "@shared/game-types";
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

const EVENT_CARD: CardInstance = makeCard({
  instanceId: "p0-hand-event",
  cardId: "OP01-030",
  zone: "HAND",
  controller: 0,
});

const TARGET: CardInstance = makeCard({
  instanceId: "p1-char-target",
  cardId: "OP02-087",
  zone: "CHARACTER",
  controller: 1,
  turnPlayed: 1,
});

const playEvent: GameEvent = {
  type: "CARD_PLAYED",
  playerIndex: 0,
  payload: {
    cardId: EVENT_CARD.cardId,
    cardInstanceId: EVENT_CARD.instanceId,
    zone: "TRASH",
    source: "HAND",
  },
  timestamp: 1,
};

const koTarget: GameEvent = {
  type: "CARD_KO",
  playerIndex: 1,
  payload: {
    cardInstanceId: TARGET.instanceId,
    cardId: TARGET.cardId,
    cause: "EFFECT",
    causingController: 0,
    causeCardInstanceId: EVENT_CARD.instanceId,
    preKO_donCount: 0,
  },
  timestamp: 2,
};

export const characterKoedByEffectScenario: Scenario = {
  id: "character-koed-by-effect",
  title: "Character K.O.'d by effect",
  category: "ko",
  description:
    "An Event card resolves from hand to trash, and an opponent Character with an [On K.O.] trigger is K.O.'d as the effect's target. Exercises the kind: \"ko\" flight when cause is EFFECT — no rest precedes the K.O., and the effect-source flight overlaps the K.O. shrink for sequencing visibility.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-030", "OP01-060", "OP02-087"],
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
        hand: [EVENT_CARD],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 4, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 5, prefix: "p0-don-deck" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({
          instanceId: "p1-leader",
          cardId: "OP01-060",
          zone: "LEADER",
          controller: 1,
        }),
        characters: [TARGET, null, null, null, null],
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    { type: "event", event: playEvent },
    { type: "wait", ms: 400 },
    { type: "event", event: koTarget },
  ],
};
