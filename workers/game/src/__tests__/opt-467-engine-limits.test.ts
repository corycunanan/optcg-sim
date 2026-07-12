import { afterEach, describe, expect, it, vi } from "vitest";
import { GameSession } from "../GameSession.js";
import type {
  CardData,
  EffectStackFrame,
  Env,
  GameAction,
  GameState,
  QueuedTrigger,
} from "../types.js";
import type { Action, EffectBlock } from "../engine/effect-types.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { buildTriggerSelectionPrompt } from "../engine/trigger-ordering.js";
import { MAX_RESOLUTION_ACTIONS } from "../engine/engine-limits.js";
import { advanceToPhase, setupGame } from "./factories.js";

const stubBlock: EffectBlock = { id: "opt-467-loop", category: "auto", actions: [] };

class MockWebSocket {
  sent: string[] = [];
  send(payload: string): void { this.sent.push(payload); }
}

class MockDurableObjectState {
  storage = {
    put: async () => undefined,
    get: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };
  getWebSockets(): WebSocket[] { return []; }
  getTags(): string[] { return []; }
}

type TestSession = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  handleAction(ws: WebSocket, playerIndex: 0 | 1, action: GameAction): Promise<void>;
};

function makeFrame(id: string, overrides: Partial<EffectStackFrame> = {}): EffectStackFrame {
  return {
    id,
    sourceCardInstanceId: `source-${id}`,
    controller: 0,
    effectBlock: stubBlock,
    phase: "AWAITING_TARGET_SELECTION",
    pausedAction: { type: "DRAW", params: { amount: 0 } } as Action,
    remainingActions: [],
    resultRefs: [],
    validTargets: ["pick"],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
    ...overrides,
  };
}

function mainPhaseState(): { state: GameState; cardDb: Map<string, import("../types.js").CardData> } {
  const setup = setupGame();
  return { state: advanceToPhase(setup.state, "MAIN", setup.cardDb), cardDb: setup.cardDb };
}

afterEach(() => vi.unstubAllGlobals());

describe("OPT-467 bounded engine resolution", () => {
  it("terminates a sequential action loop when the action budget is exhausted", () => {
    const { state, cardDb } = mainPhaseState();
    const actions = Array.from(
      { length: MAX_RESOLUTION_ACTIONS + 1 },
      () => ({ type: "DRAW", params: { amount: 0 } }) as Action,
    );

    const result = executeActionChain(
      state,
      actions,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state).toMatchObject({
      status: "FINISHED",
      winner: null,
      pendingPrompt: null,
      effectStack: [],
      engineOutcome: {
        type: "INFINITE_LOOP_DRAW",
        diagnostic: {
          kind: "ACTION_BUDGET",
          limit: MAX_RESOLUTION_ACTIONS,
          observed: MAX_RESOLUTION_ACTIONS + 1,
          actionType: "DRAW",
        },
      },
    });
    expect(result.state.eventLog.at(-1)).toMatchObject({
      type: "GAME_OVER",
      payload: { winner: null, diagnostic: { kind: "ACTION_BUDGET" } },
    });
  });

  it("cannot restore or re-prompt a continuation after budget exhaustion", () => {
    const { state, cardDb } = mainPhaseState();
    const frame = makeFrame("continuation");
    const awaitingPrompt: GameState = {
      ...state,
      engineActionCount: MAX_RESOLUTION_ACTIONS,
      effectStack: [frame],
      pendingPrompt: {
        options: {
          promptType: "SELECT_TARGET",
          cards: [],
          validTargets: ["pick"],
          effectDescription: "Pick",
          countMin: 1,
          countMax: 1,
          ctaLabel: "Pick",
        },
        respondingPlayer: 0,
        resumeContext: frame.id,
      },
    };

    const result = resumeFromStack(
      awaitingPrompt,
      { type: "SELECT_TARGET", selectedInstanceIds: ["pick"] },
      cardDb,
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.status).toBe("FINISHED");
    expect(result.state.pendingPrompt).toBeNull();
    expect(result.state.effectStack).toEqual([]);
    expect(result.state.engineOutcome?.diagnostic.kind).toBe("ACTION_BUDGET");
  });

  it("persists and surfaces the terminal draw through GameSession prompt routing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const { state, cardDb } = mainPhaseState();
    const frame = makeFrame("session-continuation");
    const session = new GameSession(
      new MockDurableObjectState() as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "test", NEXTJS_URL: "https://app.example.test" } as Env,
    ) as unknown as TestSession;
    session.cardDb = cardDb;
    session.gameState = {
      ...state,
      players: [
        { ...state.players[0], connected: true },
        { ...state.players[1], connected: true },
      ],
      engineActionCount: MAX_RESOLUTION_ACTIONS,
      effectStack: [frame],
      pendingPrompt: {
        promptId: "limit-prompt",
        options: {
          promptType: "SELECT_TARGET",
          cards: [],
          validTargets: ["pick"],
          effectDescription: "Pick",
          countMin: 1,
          countMax: 1,
          ctaLabel: "Pick",
        },
        respondingPlayer: 0,
        resumeContext: frame.id,
      },
    };

    const ws = new MockWebSocket();
    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["pick"],
      promptId: "limit-prompt",
    });

    expect(ws.sent).toEqual([]);
    expect(session.gameState.status).toBe("FINISHED");
    expect(session.gameState.winner).toBeNull();
    expect(session.gameState.pendingPrompt).toBeNull();
    expect(session.gameState.effectStack).toEqual([]);
    expect(session.gameState.engineOutcome?.diagnostic.kind).toBe("ACTION_BUDGET");
  });

  it("turns nested trigger-order stack exhaustion into a draw without a prompt", () => {
    const { state, cardDb } = mainPhaseState();
    const fullStack = Array.from({ length: 100 }, (_, index) => makeFrame(`nested-${index}`));
    const trigger: QueuedTrigger = {
      sourceCardInstanceId: state.players[0].leader.instanceId,
      controller: 0,
      effectBlock: stubBlock,
      triggeringEvent: { type: "TURN_STARTED", playerIndex: 0, payload: {} },
    };

    const result = buildTriggerSelectionPrompt(
      { ...state, effectStack: fullStack },
      [trigger, { ...trigger, effectBlock: { ...stubBlock, id: "second" } }],
      [],
      cardDb,
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.status).toBe("FINISHED");
    expect(result.state.effectStack).toEqual([]);
    expect(result.state.engineOutcome?.diagnostic).toMatchObject({
      kind: "EFFECT_STACK_DEPTH",
      observed: 101,
    });
  });
});
