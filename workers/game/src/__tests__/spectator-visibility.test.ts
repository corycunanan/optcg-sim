import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { startPregame } from "../engine/pregame.js";
import { filterStateForPlayer } from "../engine/state.js";
import {
  buildInitialState,
  prepareDecksAndLeaders,
} from "../engine/setup.js";
import type { CardData, GameState } from "../types.js";
import {
  stripInactiveEffects,
  visibleStateForSpectator,
} from "../session/visibility.js";
import { CARDS, createTestPayload } from "./factories.js";

type PeekExpectation =
  | { kind: "visible"; cardIds: readonly string[]; instanceIds: readonly string[] }
  | { kind: "post-shuffle"; cardIds: readonly string[]; instanceIds: readonly string[] };

interface Scenario {
  name: string;
  state: GameState;
  cardDb: Map<string, CardData>;
  peek?: PeekExpectation;
}

type InvariantId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface ScenarioDefinition {
  name: string;
  build: () => Scenario;
  inapplicable?: Partial<Record<InvariantId, string>>;
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
  for (let step = 0; step < 48; step++) {
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
  const pregame = startPregame(state, "PRIORITY_ROLL");
  expect(
    pregame.pregame?.phase,
    "pregame scenario must reach PRIORITY_ROLLING",
  ).toBe("PRIORITY_ROLLING");
  return {
    name: "pregame",
    state: pregame,
    cardDb,
  };
}

function buildMainPhaseScenario(): Scenario {
  const payload = createTestPayload();
  const mainEvent = {
    ...CARDS.EVENT_COUNTER,
    effectText: "[Main] Test event with no resolved effect.",
  };
  payload.player1 = {
    ...payload.player1,
    deck: payload.player1.deck.map((entry) =>
      entry.cardId === mainEvent.id ? { ...entry, cardData: mainEvent } : entry
    ),
    testOrder: {
      ...payload.player1.testOrder!,
      hand: [
        CARDS.STAGE.id,
        CARDS.RUSH.id,
        CARDS.EVENT_COUNTER.id,
        CARDS.VANILLA.id,
        CARDS.COUNTER.id,
      ],
    },
  };
  payload.player2 = {
    ...payload.player2,
    deck: payload.player2.deck.map((entry) =>
      entry.cardId === mainEvent.id ? { ...entry, cardData: mainEvent } : entry
    ),
  };

  const built = buildInitialState(payload);
  let state = advanceToTurnMain(built.state, 5, built.cardDb);
  expect(state.turn.number, "main-phase scenario must reach turn 5").toBe(5);
  expect(state.turn.phase, "main-phase scenario must reach MAIN").toBe("MAIN");
  for (const cardId of [
    CARDS.STAGE.id,
    CARDS.RUSH.id,
    CARDS.EVENT_COUNTER.id,
  ]) {
    const card = state.players[0].hand.find((candidate) =>
      candidate.cardId === cardId
    );
    expect(card, `main-phase fixture must have ${cardId} in hand`).toBeDefined();
    state = runValidAction(
      state,
      { type: "PLAY_CARD", cardInstanceId: card!.instanceId },
      built.cardDb,
      0,
    );
  }

  expect(state.turn.phase, "main-phase scenario must remain in MAIN").toBe("MAIN");
  expect(
    state.players[0].characters.some((card) => card !== null),
    "main-phase scenario must contain a Character played through the pipeline",
  ).toBe(true);
  expect(
    state.players[0].trash.length,
    "main-phase scenario must contain a card moved to Trash through the pipeline",
  ).toBeGreaterThan(0);
  expect(
    state.players[0].stage,
    "main-phase scenario must contain a Stage played through the pipeline",
  ).not.toBeNull();

  return {
    name: "main phase",
    state,
    cardDb: built.cardDb,
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
  const main = advanceToTurnMain(built.state, 3, built.cardDb);
  let state = main;
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
  expect(
    state.turn.phase,
    "pending-trigger scenario must remain in MAIN",
  ).toBe("MAIN");
  expect(
    state.turn.battle?.pendingTriggerLifeCard,
    "pending-trigger scenario must pause with a revealed Trigger Life card",
  ).toBeDefined();
  expect(
    state.turn.battle?.pendingTriggerLifeCard?.cardId,
    "pending-trigger scenario must retain a real revealed card identity",
  ).not.toBe("hidden");

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
  const main = advanceToTurnMain(built.state, 1, built.cardDb);
  expect(main.turn.phase, "peek fixture must reach MAIN").toBe("MAIN");
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
  expect(
    peekEvent?.type,
    "post-peek scenario must emit CARDS_REVEALED",
  ).toBe("CARDS_REVEALED");
  if (!peekEvent || peekEvent.type !== "CARDS_REVEALED") {
    throw new Error("post-peek precondition narrowing failed");
  }
  const peek = {
    cardIds: peekEvent.payload.cards.map((card) => card.cardId),
    instanceIds: peekEvent.payload.cards.map((card) => card.instanceId),
  };
  expect(
    peek.cardIds.length,
    "post-peek scenario must reveal at least one card",
  ).toBeGreaterThan(0);
  expect(
    peek.cardIds.every((cardId) => cardId !== "hidden"),
    "post-peek scenario must contain real card identities",
  ).toBe(true);
  expect(
    peek.instanceIds.every((instanceId) => !instanceId.startsWith("hidden-")),
    "post-peek scenario must contain real instance identities",
  ).toBe(true);
  const postShuffle = runValidAction(
    postPeek,
    { type: "ACTIVATE_EFFECT", cardInstanceId: sourceId, effectId: SHUFFLE_EFFECT_ID },
    built.cardDb,
    0,
  );
  expect(
    postShuffle.players[0].deck.map((card) => card.instanceId),
    "post-shuffle scenario must change authoritative deck order",
  ).not.toEqual(postPeek.players[0].deck.map((card) => card.instanceId));
  expect(
    postShuffle.executionContext.rngState,
    "post-shuffle scenario must consume deterministic RNG state",
  ).not.toBe(postPeek.executionContext.rngState);

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

const SCENARIOS: readonly ScenarioDefinition[] = [
  {
    name: "pregame",
    build: buildPregameScenario,
    inapplicable: {
      3: "Life has not been placed yet",
      4: "opening hands have not been dealt yet",
      6: "no peek has occurred",
    },
  },
  {
    name: "main phase",
    build: buildMainPhaseScenario,
    inapplicable: { 6: "no peek has occurred" },
  },
  {
    name: "mid-battle pending trigger",
    build: buildPendingTriggerScenario,
    inapplicable: { 6: "no deck peek has occurred" },
  },
  { name: "post-peek", build: () => buildPeekScenarios()[0] },
  { name: "post-shuffle", build: () => buildPeekScenarios()[1] },
];

const INVARIANTS = [
  {
    id: 1,
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
    id: 2,
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
    id: 3,
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
    id: 4,
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
    id: 5,
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
    id: 6,
    invariant: "6. private peek history persists for observers with identities hidden",
    assert: (scenario: Scenario) => {
      if (!scenario.peek) return;
      const spectator = spectatorFor(scenario);
      const privatePeekCards = spectator.eventLog.flatMap((event) =>
        event.type === "CARDS_REVEALED" &&
          event.payload.visibility === "CONTROLLER_ONLY"
          ? event.payload.cards
          : []
      );
      expect(privatePeekCards).toEqual(
        scenario.peek.cardIds.map(() => ({
          cardId: "hidden",
          instanceId: "hidden",
        }))
      );
      // The observer retains the historical event and its public metadata, but
      // never inherits the peeker's private identity entitlement.
      for (const identity of scenario.peek.cardIds) {
        expect(privatePeekCards.map((card) => card.cardId)).not.toContain(identity);
      }
      for (const identity of scenario.peek.instanceIds) {
        expect(privatePeekCards.map((card) => card.instanceId)).not.toContain(identity);
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
    id: 7,
    invariant: "7. fully visible zones never contain synthetic instance ids",
    assert: (scenario: Scenario) => {
      for (const card of fullyVisibleZoneCards(spectatorFor(scenario))) {
        expect(card.instanceId).not.toMatch(/^hidden-/);
      }
    },
  },
] as const satisfies readonly {
  id: InvariantId;
  invariant: string;
  assert: (scenario: Scenario) => void;
}[];

describe.each(SCENARIOS)("spectator visibility invariants — $name", (definition) => {
  let scenario: Scenario | undefined;
  const getScenario = () => scenario ??= definition.build();

  it("advertised scenario preconditions hold", () => {
    expect(getScenario().name).toBe(definition.name);
  });

  for (const invariant of INVARIANTS) {
    const reason = definition.inapplicable?.[invariant.id];
    if (reason) {
      it.skip(`${invariant.invariant} — not applicable: ${reason}`, () => {});
    } else {
      it(invariant.invariant, () => invariant.assert(getScenario()));
    }
  }
});
