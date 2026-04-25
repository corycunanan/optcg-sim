import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GameAction,
  GameEvent,
  PromptOptions,
  TurnState,
} from "@shared/game-types";
import {
  DEFAULT_EVENT_DELAY_MS,
  createScenarioRunner,
} from "../use-scenario-runner";
import {
  makeCard,
  makeDonStack,
  playerSlot,
} from "@/lib/sandbox/scenarios/helpers";
import type {
  PartialGameState,
  Scenario,
  ScenarioStep,
} from "@/lib/sandbox/scenarios/types";

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

function deckCard(i: number) {
  return makeCard({
    instanceId: `p0-deck-${i}`,
    cardId: `OP01-${String(100 + i).padStart(3, "0")}`,
    zone: "DECK",
    controller: 0,
  });
}

function baseInitialState(deckSize = 6): PartialGameState {
  const deck = Array.from({ length: deckSize }, (_, i) => deckCard(i));
  return {
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
        hand: [],
        deck,
        donCostArea: makeDonStack({ count: 0 }),
        donDeck: makeDonStack({ count: 10, prefix: "p0-don" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({
          instanceId: "p1-leader",
          cardId: "OP01-002",
          zone: "LEADER",
          controller: 1,
        }),
      }),
    ],
  };
}

function drawEvent(timestamp: number): GameEvent {
  return {
    type: "CARD_DRAWN",
    playerIndex: 0,
    payload: {},
    timestamp,
  } as GameEvent;
}

function eventStep(timestamp: number, delayMs?: number): ScenarioStep {
  return { type: "event", event: drawEvent(timestamp), delayMs };
}

const SAMPLE_PROMPT: PromptOptions = {
  promptType: "SELECT_TARGET",
  cards: [],
  validTargets: ["p0-leader"],
  effectDescription: "Test prompt",
  countMin: 1,
  countMax: 1,
  ctaLabel: "Confirm",
};

function makeScenario(
  script: ScenarioStep[],
  overrides: Partial<Scenario> = {},
): Scenario {
  return {
    id: "test-scenario",
    title: "Test Scenario",
    category: "draws",
    description: "Test",
    initialState: baseInitialState(),
    cardsUsed: [],
    script,
    inputMode: "spectator",
    ...overrides,
  };
}

const SELECT_ACTION: GameAction = {
  type: "SELECT_TARGET",
  selectedInstanceIds: ["p0-leader"],
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("createScenarioRunner — initial state", () => {
  it("starts idle with derivedGameState equal to initialState", () => {
    const scenario = makeScenario([eventStep(1), eventStep(2)]);
    const runner = createScenarioRunner(scenario);
    const state = runner.getState();
    expect(state.playbackState).toBe("idle");
    expect(state.currentStepIndex).toBe(0);
    expect(state.totalSteps).toBe(2);
    expect(state.derivedGameState).toEqual(scenario.initialState);
    expect(state.activePrompt).toBeNull();
    expect(state.eventLog).toEqual([]);
  });
});

describe("createScenarioRunner — play", () => {
  it("reaches \"ended\" after the expected duration for a 5-event spectator script", () => {
    const script = [
      eventStep(1),
      eventStep(2),
      eventStep(3),
      eventStep(4),
      eventStep(5),
    ];
    const scenario = makeScenario(script);
    const runner = createScenarioRunner(scenario);
    runner.play();
    expect(runner.getState().playbackState).toBe("playing");

    // Total expected duration: 5 * default delay.
    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS * 5);

    const state = runner.getState();
    expect(state.playbackState).toBe("ended");
    expect(state.currentStepIndex).toBe(5);
    expect(state.eventLog).toHaveLength(5);
    // First draw moves p0-deck-0 from deck top into hand.
    expect(state.derivedGameState.players[0].hand).toHaveLength(5);
    expect(state.derivedGameState.players[0].deck).toHaveLength(1);
  });

  it("notifies subscribers on each timer-driven advance", () => {
    const scenario = makeScenario([eventStep(1), eventStep(2), eventStep(3)]);
    const runner = createScenarioRunner(scenario);
    const listener = vi.fn();
    runner.subscribe(listener);

    runner.play();
    expect(listener).toHaveBeenCalledTimes(1); // play notified

    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS);
    expect(listener).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS);
    expect(listener).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS);
    expect(listener).toHaveBeenCalledTimes(4);
    expect(runner.getState().playbackState).toBe("ended");
  });

  it("respects per-step delayMs overrides and wait steps", () => {
    const script: ScenarioStep[] = [
      { type: "event", event: drawEvent(1), delayMs: 100 },
      { type: "wait", ms: 250 },
      { type: "event", event: drawEvent(2), delayMs: 50 },
    ];
    const scenario = makeScenario(script);
    const runner = createScenarioRunner(scenario);
    runner.play();

    vi.advanceTimersByTime(99);
    expect(runner.getState().currentStepIndex).toBe(0);
    vi.advanceTimersByTime(1);
    expect(runner.getState().currentStepIndex).toBe(1);
    vi.advanceTimersByTime(249);
    expect(runner.getState().currentStepIndex).toBe(1);
    vi.advanceTimersByTime(1);
    expect(runner.getState().currentStepIndex).toBe(2);
    vi.advanceTimersByTime(50);
    expect(runner.getState().playbackState).toBe("ended");
  });
});

describe("createScenarioRunner — reset", () => {
  it("restores initial state byte-identical (referentially equal)", () => {
    const scenario = makeScenario([eventStep(1), eventStep(2), eventStep(3)]);
    const runner = createScenarioRunner(scenario);
    const initialDerived = runner.getState().derivedGameState;

    runner.play();
    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS * 2);
    expect(runner.getState().currentStepIndex).toBe(2);

    runner.reset();
    const after = runner.getState();
    expect(after.playbackState).toBe("idle");
    expect(after.currentStepIndex).toBe(0);
    expect(after.eventLog).toEqual([]);
    expect(after.activePrompt).toBeNull();
    // Folding zero events returns initialState by reference (no mutation).
    expect(after.derivedGameState).toBe(scenario.initialState);
    expect(after.derivedGameState).toBe(initialDerived);
  });

  it("cancels the timer so post-reset advancement does nothing", () => {
    const scenario = makeScenario([eventStep(1), eventStep(2)]);
    const runner = createScenarioRunner(scenario);
    runner.play();
    runner.reset();

    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS * 5);
    expect(runner.getState().currentStepIndex).toBe(0);
    expect(runner.getState().playbackState).toBe("idle");
  });
});

describe("createScenarioRunner — pause / resume", () => {
  it("halts the timer on pause and continues from the same index on play", () => {
    const scenario = makeScenario([
      eventStep(1),
      eventStep(2),
      eventStep(3),
      eventStep(4),
    ]);
    const runner = createScenarioRunner(scenario);
    runner.play();

    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS); // applied step 0
    expect(runner.getState().currentStepIndex).toBe(1);

    runner.pause();
    expect(runner.getState().playbackState).toBe("paused");

    // Advancing time while paused must not advance the script.
    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS * 10);
    expect(runner.getState().currentStepIndex).toBe(1);

    runner.play();
    expect(runner.getState().playbackState).toBe("playing");
    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS);
    expect(runner.getState().currentStepIndex).toBe(2);
  });
});

describe("createScenarioRunner — stepForward", () => {
  it("from \"playing\" lands in \"paused\" at the next index", () => {
    const scenario = makeScenario([eventStep(1), eventStep(2), eventStep(3)]);
    const runner = createScenarioRunner(scenario);
    runner.play();
    expect(runner.getState().playbackState).toBe("playing");

    runner.stepForward();
    const state = runner.getState();
    expect(state.playbackState).toBe("paused");
    expect(state.currentStepIndex).toBe(1);
    expect(state.eventLog).toHaveLength(1);

    // Timer was cancelled — further wall time doesn't advance.
    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS * 5);
    expect(runner.getState().currentStepIndex).toBe(1);
  });

  it("lands in \"ended\" when stepping past the final event", () => {
    const scenario = makeScenario([eventStep(1)]);
    const runner = createScenarioRunner(scenario);
    runner.stepForward();
    expect(runner.getState().playbackState).toBe("ended");
    expect(runner.getState().currentStepIndex).toBe(1);
  });
});

describe("createScenarioRunner — prompt + resolvePrompt", () => {
  it("transitions to \"awaiting-response\" when play reaches a prompt step", () => {
    const scenario = makeScenario(
      [eventStep(1), { type: "prompt", prompt: SAMPLE_PROMPT }, eventStep(2)],
      { inputMode: "interactive" },
    );
    const runner = createScenarioRunner(scenario);
    runner.play();
    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS); // applies event, hits prompt

    const state = runner.getState();
    expect(state.playbackState).toBe("awaiting-response");
    expect(state.currentStepIndex).toBe(1);
    expect(state.activePrompt).toBe(SAMPLE_PROMPT);
  });

  it("resolvePrompt advances past the prompt and resumes \"playing\" if play was active", () => {
    const scenario = makeScenario(
      [{ type: "prompt", prompt: SAMPLE_PROMPT }, eventStep(1)],
      { inputMode: "interactive" },
    );
    const runner = createScenarioRunner(scenario);
    runner.play();
    expect(runner.getState().playbackState).toBe("awaiting-response");

    runner.resolvePrompt(SELECT_ACTION);
    expect(runner.getState().playbackState).toBe("playing");
    expect(runner.getState().currentStepIndex).toBe(1);
    expect(runner.getState().activePrompt).toBeNull();

    vi.advanceTimersByTime(DEFAULT_EVENT_DELAY_MS);
    expect(runner.getState().playbackState).toBe("ended");
    expect(runner.getState().currentStepIndex).toBe(2);
    expect(runner.getState().eventLog).toHaveLength(1);
  });

  it("resolvePrompt resumes \"paused\" if user step-stepped onto the prompt", () => {
    const scenario = makeScenario(
      [{ type: "prompt", prompt: SAMPLE_PROMPT }, eventStep(1)],
      { inputMode: "interactive" },
    );
    const runner = createScenarioRunner(scenario);
    runner.stepForward();
    expect(runner.getState().playbackState).toBe("awaiting-response");

    runner.resolvePrompt(SELECT_ACTION);
    expect(runner.getState().playbackState).toBe("paused");
    expect(runner.getState().currentStepIndex).toBe(1);
  });

  it("ignores resolvePrompt when not awaiting a response", () => {
    const scenario = makeScenario([eventStep(1), eventStep(2)]);
    const runner = createScenarioRunner(scenario);
    const before = runner.getState();
    runner.resolvePrompt(SELECT_ACTION);
    expect(runner.getState()).toEqual(before);
  });

  it("pause during awaiting-response sets resumeTo so the next resolve lands paused", () => {
    const scenario = makeScenario(
      [{ type: "prompt", prompt: SAMPLE_PROMPT }, eventStep(1)],
      { inputMode: "interactive" },
    );
    const runner = createScenarioRunner(scenario);
    runner.play(); // awaiting-response with resumeTo = "playing"
    runner.pause();
    runner.resolvePrompt(SELECT_ACTION);
    expect(runner.getState().playbackState).toBe("paused");
  });
});
