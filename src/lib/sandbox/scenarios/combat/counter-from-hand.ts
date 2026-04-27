// Interactive scenario: the player is the defender during COUNTER_STEP and
// is prompted to play a [Counter] card from hand. After the prompt resolves,
// the counter card flies hand → trash, and a `COUNTER_USED` event fires the
// defender pulse on the battle target via `use-counter-pulse`.
//
// The opponent's character is mid-attack on our Leader: `turn.battle` is
// pre-populated (the sandbox does not run the engine, so battle context only
// exists if we author it) and `battleSubPhase` is `COUNTER_STEP` — the
// pulse hook keys off `battle.targetInstanceId`, which must resolve to our
// Leader for the highlight to land in the right place.
//
// Authored with a single counter card in hand so the post-prompt
// `CARD_TRASHED` reliably matches the user's selection. Multi-counter
// authoring would require the runner to template events from the response,
// which is out of scope for the sandbox's static-script model.

import type {
  BattleContext,
  CardInstance,
  GameEvent,
  TurnState,
} from "@shared/game-types";
import {
  makeCard,
  makeDonStack,
  makeLifeStack,
  playerSlot,
} from "../helpers";
import type { Scenario } from "../types";

const OPP_ATTACKER: CardInstance = makeCard({
  instanceId: "p1-char-attacker",
  cardId: "OP01-010",
  zone: "CHARACTER",
  controller: 1,
  state: "RESTED",
  turnPlayed: 1,
});

const ME_LEADER: CardInstance = makeCard({
  instanceId: "p0-leader",
  cardId: "OP01-001",
  zone: "LEADER",
  controller: 0,
});

const COUNTER_CARD: CardInstance = makeCard({
  instanceId: "p0-hand-counter",
  cardId: "OP11-003",
  zone: "HAND",
  controller: 0,
});

const BATTLE: BattleContext = {
  battleId: "battle-counter-1",
  attackerInstanceId: OPP_ATTACKER.instanceId,
  targetInstanceId: ME_LEADER.instanceId,
  attackerPower: 3000,
  defenderPower: 5000,
  counterPowerAdded: 0,
  blockerActivated: false,
};

const TURN: TurnState = {
  number: 2,
  activePlayerIndex: 1,
  phase: "MAIN",
  battleSubPhase: "COUNTER_STEP",
  battle: BATTLE,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

const trashCounter: GameEvent = {
  type: "CARD_TRASHED",
  playerIndex: 0,
  payload: {
    cardId: COUNTER_CARD.cardId,
    cardInstanceId: COUNTER_CARD.instanceId,
    from: "HAND",
    reason: "COUNTER",
  },
  timestamp: 1,
};

const counterUsed: GameEvent = {
  type: "COUNTER_USED",
  playerIndex: 0,
  payload: {
    cardId: COUNTER_CARD.cardId,
    cardInstanceId: COUNTER_CARD.instanceId,
    counterValue: 2000,
    counterTargetInstanceId: ME_LEADER.instanceId,
  },
  timestamp: 2,
};

export const counterFromHandScenario: Scenario = {
  id: "counter-from-hand",
  title: "Counter from Hand",
  category: "combat",
  description:
    "Opponent's Character is mid-attack on your Leader. You're prompted to play the [Counter] card from hand: it flies to trash and the defender pulse flashes on your Leader. Exercises use-counter-pulse and the hand → trash flight.",
  inputMode: "interactive",
  cardsUsed: ["OP01-001", "OP01-060", "OP01-010", "OP11-003"],
  initialState: {
    myIndex: 0,
    turn: TURN,
    players: [
      playerSlot({
        playerId: "p0",
        leader: ME_LEADER,
        hand: [
          COUNTER_CARD,
          makeCard({ instanceId: "p0-hand-2", cardId: "OP01-010", zone: "HAND", controller: 0 }),
          makeCard({ instanceId: "p0-hand-3", cardId: "OP05-010", zone: "HAND", controller: 0 }),
        ],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 4, cardId: "OP01-001", prefix: "p0-life" }),
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
        characters: [OPP_ATTACKER, null, null, null, null],
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donCostArea: makeDonStack({ count: 1, prefix: "p1-don" }),
        donDeck: makeDonStack({ count: 9, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    {
      type: "prompt",
      prompt: {
        promptType: "SELECT_TARGET",
        cards: [COUNTER_CARD],
        validTargets: [COUNTER_CARD.instanceId],
        effectDescription: "Play 1 [Counter] card from your hand",
        countMin: 1,
        countMax: 1,
        ctaLabel: "Counter",
      },
    },
    { type: "event", event: trashCounter, delayMs: 100 },
    { type: "wait", ms: 80 },
    { type: "event", event: counterUsed, delayMs: 0 },
  ],
  expectedResponse: {
    allowedActionTypes: ["SELECT_TARGET"],
    predicate: (action) =>
      action.type === "SELECT_TARGET" &&
      action.selectedInstanceIds.length === 1 &&
      action.selectedInstanceIds[0] === COUNTER_CARD.instanceId,
    hint: "Pick the [Counter] card from your hand to fire the defender pulse.",
  },
};
