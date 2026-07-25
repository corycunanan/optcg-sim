import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { startPregame } from "../engine/pregame.js";
import {
  filterStateForPlayer,
} from "../engine/state.js";
import {
  buildInitialState,
  prepareDecksAndLeaders,
} from "../engine/setup.js";
import type { CardData, GameState } from "../types.js";
import {
  stripInactiveEffects,
  visibleStateForSpectator,
} from "../session/visibility.js";
import {
  CARDS,
  advanceToPhase,
  createTestPayload,
  setupGame,
} from "./factories.js";

type PeekExpectation =
  | { kind: "visible"; cardIds: readonly string[]; instanceIds: readonly string[] }
  | { kind: "post-shuffle"; cardIds: readonly string[]; instanceIds: readonly string[] };

interface Scenario {
  name: string;
  state: GameState;
  cardDb: Map<string, CardData>;
  peek?: PeekExpectation;
}

const PEEK_EFFECT_ID = "spectator-test-peek";
const SHUFFLE_EFFECT_ID = "spectator-test-shuffle";

const VISIBILITY_EFFECTS: EffectSchema = {
  effects: [
    {
      id: PEEK_EFFECT_ID,
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [{
        type: "REVEAL",
        params: {
          amount: 3,
          source: "DECK_TOP",
          visibility: "CONTROLLER_ONLY",
        },
      }],
    },
    {
      id: SHUFFLE_EFFECT_ID,
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [{ type: "SHUFFLE_DECK" }],
    },
  ],
};

function runValidAction(
  state: GameState,
  action: Parameters<typeof runPipeline>[1],
  cardDb: Map<string, CardData>,
  actingPlayer: 0 | 1,
): GameState {
  const result = runPipeline(state, action, cardDb, actingPlayer);
  if (!result.valid) {
    throw new Error(`Fixture action ${action.type} failed: ${result.error}`);
  }
  return result.state;
}

function advanceToTurnMain(
  state: GameState,
  turnNumber: number,
  cardDb: Map<string, CardData>,
): GameState {
  let current = state;
  for (let step = 0; step < 24; step++) {
    if (current.turn.number === turnNumber && current.turn.phase === "MAIN") {
      return current;
    }
    current = runValidAction(
      current,
      { type: "ADVANCE_PHASE" },
      cardDb,
      current.turn.activePlayerIndex,
    );
  }
  throw new Error(`Fixture did not reach turn ${turnNumber} MAIN`);
}

function buildPregameScenario(): Scenario {
  const payload = createTestPayload();
  const { state, cardDb } = prepareDecksAndLeaders(payload);
  return {
    name: "pregame",
    state: startPregame(state, "PRIORITY_ROLL"),
    cardDb,
  };
}

function buildMainPhaseScenario(): Scenario {
  const { state, cardDb } = setupGame();
  return {
    name: "main phase",
    state: advanceToPhase(state, "MAIN", cardDb),
    cardDb,
  };
}

function buildPendingTriggerScenario(): Scenario {
  const payload = createTestPayload();
  const playerTwoLife = [
    CARDS.VANILLA.id,
    CARDS.VANILLA.id,
    CARDS.VANILLA.id,
    CARDS.VANILLA.id,
    CARDS.TRIGGER.id,
  ];
  payload.player2 = {
    ...payload.player2,
    testOrder: { ...payload.player2.testOrder!, life: playerTwoLife },
  };

  const built = buildInitialState(payload);
  let state = advanceToTurnMain(built.state, 3, built.cardDb);
  state = runValidAction(
    state,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[0].leader.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    },
    built.cardDb,
    0,
  );
  state = runValidAction(state, { type: "PASS" }, built.cardDb, 0);
  state = runValidAction(state, { type: "PASS" }, built.cardDb, 0);
  if (!state.turn.battle?.pendingTriggerLifeCard) {
    throw new Error("Fixture did not pause with a pending Trigger Life card");
  }

  return { name: "mid-battle pending trigger", state, cardDb: built.cardDb };
}

function buildPeekScenarios(): [Scenario, Scenario] {
  const payload = createTestPayload();
  const leaderWithEffects = {
    ...payload.player1.leader.cardData,
    effectSchema: VISIBILITY_EFFECTS,
  };
  payload.player1 = {
    ...payload.player1,
    leader: { ...payload.player1.leader, cardData: leaderWithEffects },
  };
  payload.player2 = {
    ...payload.player2,
    leader: { ...payload.player2.leader, cardData: leaderWithEffects },
  };

  const built = buildInitialState(payload);
  const main = advanceToPhase(built.state, "MAIN", built.cardDb);
  const sourceId = main.players[0].leader.instanceId;
  const postPeek = runValidAction(
    main,
    { type: "ACTIVATE_EFFECT", cardInstanceId: sourceId, effectId: PEEK_EFFECT_ID },
    built.cardDb,
    0,
  );
  const peekEvent = [...postPeek.eventLog]
    .reverse()
    .find((event) => event.type === "CARDS_REVEALED");
  if (!peekEvent || peekEvent.type !== "CARDS_REVEALED") {
    throw new Error("Fixture peek did not emit CARDS_REVEALED");
  }
  const peek = {
    cardIds: peekEvent.payload.cards.map((card) => card.cardId),
    instanceIds: peekEvent.payload.cards.map((card) => card.instanceId),
  };
  const postShuffle = runValidAction(
    postPeek,
    { type: "ACTIVATE_EFFECT", cardInstanceId: sourceId, effectId: SHUFFLE_EFFECT_ID },
    built.cardDb,
    0,
  );

  return [
    {
      name: "post-peek",
      state: postPeek,
      cardDb: built.cardDb,
      peek: { kind: "visible", ...peek },
    },
    {
      name: "post-shuffle",
      state: postShuffle,
      cardDb: built.cardDb,
      peek: { kind: "post-shuffle", ...peek },
    },
  ];
}

function collectCardIds(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectCardIds(item, found);
    return found;
  }
  if (value === null || typeof value !== "object") return found;

  for (const [key, child] of Object.entries(value)) {
    if (/cardId$/i.test(key) && typeof child === "string" && child !== "hidden") {
      found.add(child);
    } else {
      collectCardIds(child, found);
    }
  }
  return found;
}

function fullyVisibleZoneCards(state: GameState) {
  return state.players.flatMap((player) => [
    player.leader,
    ...player.characters.filter((card) => card !== null),
    ...(player.stage ? [player.stage] : []),
    ...player.hand,
    ...player.trash,
    ...player.removedFromGame,
    ...player.life.filter((card) => card.face === "UP"),
  ]);
}

function spectatorFor(scenario: Scenario): GameState {
  return visibleStateForSpectator(scenario.state, scenario.cardDb);
}

const peekScenarios = buildPeekScenarios();
const SCENARIOS: readonly Scenario[] = [
  buildPregameScenario(),
  buildMainPhaseScenario(),
  buildPendingTriggerScenario(),
  ...peekScenarios,
];

const INVARIANTS = [
  {
    invariant: "1. every spectator card identity is bounded by the player-view union",
    assert: (scenario: Scenario) => {
      const stripped = stripInactiveEffects(scenario.state, scenario.cardDb);
      const playerUnion = new Set([
        ...collectCardIds(filterStateForPlayer(stripped, 0)),
        ...collectCardIds(filterStateForPlayer(stripped, 1)),
      ]);
      const spectatorIds = collectCardIds(spectatorFor(scenario));
      const identitiesOutsideUnion = [...spectatorIds].filter(
        (cardId) => !playerUnion.has(cardId),
      );
      expect(identitiesOutsideUnion).toEqual([]);
    },
  },
  {
    invariant: "2. neither spectator deck exposes card identity or real instance identity",
    assert: (scenario: Scenario) => {
      const spectator = spectatorFor(scenario);
      for (const player of spectator.players) {
        for (const card of player.deck) {
          expect(card.cardId).toBe("hidden");
          expect(card.instanceId).toMatch(/^hidden-/);
        }
      }
    },
  },
  {
    invariant: "3. no face-down spectator Life card exposes identity",
    assert: (scenario: Scenario) => {
      const spectator = spectatorFor(scenario);
      for (const player of spectator.players) {
        for (const card of player.life.filter((life) => life.face === "DOWN")) {
          expect(card.cardId).toBe("hidden");
          expect(card.instanceId).toMatch(/^hidden-/);
        }
      }
    },
  },
  {
    invariant: "4. both spectator hands preserve real card and instance identities",
    assert: (scenario: Scenario) => {
      const spectator = spectatorFor(scenario);
      for (const playerIndex of [0, 1] as const) {
        expect(
          spectator.players[playerIndex].hand.map(({ cardId, instanceId }) => ({
            cardId,
            instanceId,
          })),
        ).toEqual(
          scenario.state.players[playerIndex].hand.map(({ cardId, instanceId }) => ({
            cardId,
            instanceId,
          })),
        );
        for (const card of spectator.players[playerIndex].hand) {
          expect(card.cardId).not.toBe("hidden");
          expect(card.instanceId).not.toMatch(/^hidden-/);
        }
      }
    },
  },
  {
    invariant: "5. spectator execution secrets have the complete redacted shape",
    assert: (scenario: Scenario) => {
      expect(spectatorFor(scenario).executionContext).toEqual({
        version: scenario.state.executionContext.version,
        seed: "redacted",
        rngState: 0,
        idCounter: 0,
        clockEpochMs: 0,
        clockCounter: 0,
        actionBudget: { limit: 0, consumed: 0 },
        trace: { gameId: scenario.state.id, traceId: "redacted" },
      });
    },
  },
  {
    invariant: "6. private peek history persists while shuffled deck order stays hidden",
    assert: (scenario: Scenario) => {
      if (!scenario.peek) return;
      const spectator = spectatorFor(scenario);
      const privatePeekCards = spectator.eventLog.flatMap((event) =>
        event.type === "CARDS_REVEALED" &&
          event.payload.visibility === "CONTROLLER_ONLY"
          ? event.payload.cards
          : []
      );
      const visibleCardIds = privatePeekCards.map((card) => card.cardId);
      const visibleInstanceIds = privatePeekCards.map((card) => card.instanceId);
      // Peek events are historical and legitimately persist for the peeker,
      // and therefore for the spectator under union-for-revealed. A shuffle
      // invalidates positional knowledge, not the fact that the peek occurred.
      for (const identity of scenario.peek.cardIds) {
        expect(visibleCardIds).toContain(identity);
      }
      for (const identity of scenario.peek.instanceIds) {
        expect(visibleInstanceIds).toContain(identity);
      }
      if (scenario.peek.kind === "post-shuffle") {
        for (const card of spectator.players[0].deck) {
          expect(card.cardId).toBe("hidden");
          expect(card.instanceId).toMatch(/^hidden-0-deck-/);
        }
      }
    },
  },
  {
    invariant: "7. fully visible zones never contain synthetic instance ids",
    assert: (scenario: Scenario) => {
      for (const card of fullyVisibleZoneCards(spectatorFor(scenario))) {
        expect(card.instanceId).not.toMatch(/^hidden-/);
      }
    },
  },
] as const;

describe.each(SCENARIOS)("spectator visibility invariants — $name", (scenario) => {
  it.each(INVARIANTS)("$invariant", ({ assert }) => {
    assert(scenario);
  });
});
