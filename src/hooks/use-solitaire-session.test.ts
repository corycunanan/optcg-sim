import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameAction, GameState } from "@shared/game-types";
import type { useGameSession } from "@/hooks/use-game-session";

type GameSessionReturn = ReturnType<typeof useGameSession>;

const mocks = vi.hoisted(() => ({
  sessions: [] as GameSessionReturn[],
  useGameSession: vi.fn(),
  stateCursor: 0,
  stateValues: [] as unknown[],
  refCursor: 0,
  refValues: [] as Array<{ current: unknown }>,
}));

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void | (() => void)) => effect(),
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => {
      const index = mocks.refCursor;
      mocks.refCursor += 1;
      if (!mocks.refValues[index]) {
        mocks.refValues[index] = { current: initial };
      }
      return mocks.refValues[index];
    },
    useState: (initial: unknown) => {
      const index = mocks.stateCursor;
      mocks.stateCursor += 1;
      if (!(index in mocks.stateValues)) {
        mocks.stateValues[index] =
          typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      return [
        mocks.stateValues[index],
        (next: unknown) => {
          mocks.stateValues[index] =
            typeof next === "function"
              ? (next as (current: unknown) => unknown)(mocks.stateValues[index])
              : next;
        },
      ];
    },
  };
});

vi.mock("@/hooks/use-game-session", () => ({
  useGameSession: mocks.useGameSession,
}));

import { useSolitaireSession } from "@/hooks/use-solitaire-session";

const createGameState = (
  activePlayerIndex: 0 | 1,
  respondingPlayer?: 0 | 1,
): GameState =>
  ({
    id: "game-1",
    status: "IN_PROGRESS",
    winner: null,
    winReason: null,
    players: [
      { playerId: "user-a", connected: true, rejoinDeadlineAt: null },
      { playerId: "user-a", connected: true, rejoinDeadlineAt: null },
    ],
    turn: {
      activePlayerIndex,
      phase: "MAIN",
      battleSubPhase: null,
    },
    pendingPrompt:
      respondingPlayer === undefined
        ? null
        : {
            respondingPlayer,
            options: {
              promptType: "SELECT_TARGET",
              validTargets: [],
              min: 0,
              max: 1,
              effectDescription: "Choose a target",
            },
            resumeContext: null,
          },
    effectStack: [],
    eventLog: [],
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
  }) as unknown as GameState;

const createSession = (
  index: 0 | 1,
  overrides: Partial<GameSessionReturn["game"]> = {},
): GameSessionReturn =>
  ({
    game: {
      gameState: createGameState(0),
      cardDb: {},
      cardDbReady: true,
      connectionStatus: "connected",
      lastError: null,
      activePrompt: null,
      gameOver: null,
      sendAction: vi.fn(),
      myIndex: index,
      me: null,
      opp: null,
      turn: null,
      isMyTurn: index === 0,
      phase: "MAIN",
      battlePhase: null,
      inBattle: false,
      matchClosed: false,
      canUndo: false,
      retryConnection: vi.fn(),
      connectivityFailed: false,
      ...overrides,
    },
    opponent: {
      opponentAway: false,
      opponentAwayText: "",
      gamePausedForOpponent: false,
      opponentDeadlineRemaining: null,
    },
    navigation: {
      remoteGameStatus: null,
      remoteGameNotFound: false,
      fallbackConcedeAvailable: false,
      fallbackSubmitting: false,
      fallbackError: null,
      handleFallbackConcede: vi.fn(),
      leavingGame: false,
      leaveError: null,
      handleLeaveGame: vi.fn(),
      handleBackToLobbies: vi.fn(),
    },
    endState: {
      endTitle: "",
      endColorClass: "",
      endReason: "",
    },
  }) as GameSessionReturn;

const renderSolitaireSession = () => {
  mocks.stateCursor = 0;
  mocks.refCursor = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSolitaireSession("game-1", "https://worker.example");
};

beforeEach(() => {
  mocks.sessions = [createSession(0), createSession(1)];
  mocks.useGameSession.mockReset();
  mocks.useGameSession.mockImplementation(
    (_gameId: string, _workerUrl: string, requestedIndex: 0 | 1) =>
      mocks.sessions[requestedIndex],
  );
  mocks.stateCursor = 0;
  mocks.stateValues = [];
  mocks.refCursor = 0;
  mocks.refValues = [];
});

describe("useSolitaireSession", () => {
  it("mounts one game session for each Solitaire side", () => {
    renderSolitaireSession();

    expect(mocks.useGameSession).toHaveBeenCalledWith(
      "game-1",
      "https://worker.example",
      0,
    );
    expect(mocks.useGameSession).toHaveBeenCalledWith(
      "game-1",
      "https://worker.example",
      1,
    );
  });

  it("starts from the active turn perspective", () => {
    mocks.sessions = [
      createSession(0, { gameState: createGameState(1) }),
      createSession(1, { gameState: createGameState(1) }),
    ];

    const session = renderSolitaireSession();

    expect(session.perspective.myIndex).toBe(1);
    expect(session.game.myIndex).toBe(1);
    expect(session.sides[1]).toBe(mocks.sessions[1]);
  });

  it("routes actions through the current perspective side", () => {
    const player0SendAction = vi.fn();
    const player1SendAction = vi.fn();
    mocks.sessions = [
      createSession(0, {
        gameState: createGameState(1),
        sendAction: player0SendAction,
      }),
      createSession(1, {
        gameState: createGameState(1),
        sendAction: player1SendAction,
      }),
    ];
    const action = { type: "ADVANCE_PHASE" } as GameAction;

    const session = renderSolitaireSession();
    session.game.sendAction(action);

    expect(player1SendAction).toHaveBeenCalledWith(action);
    expect(player0SendAction).not.toHaveBeenCalled();
  });

  it("lets manual flip override until the next automatic target changes", () => {
    mocks.sessions = [
      createSession(0, { gameState: createGameState(0) }),
      createSession(1, { gameState: createGameState(0) }),
    ];

    let session = renderSolitaireSession();
    session.perspective.flipPerspective();
    session = renderSolitaireSession();
    expect(session.perspective.myIndex).toBe(1);

    mocks.sessions = [
      createSession(0, { gameState: createGameState(0) }),
      createSession(1, { gameState: createGameState(0) }),
    ];
    session = renderSolitaireSession();
    expect(session.perspective.myIndex).toBe(1);

    mocks.sessions = [
      createSession(0, { gameState: createGameState(0, 0) }),
      createSession(1, { gameState: createGameState(0, 0) }),
    ];
    renderSolitaireSession();
    session = renderSolitaireSession();
    expect(session.perspective.myIndex).toBe(0);
  });

  it("auto-flips to reactive prompts on the inactive side", () => {
    mocks.sessions = [
      createSession(0, { gameState: createGameState(0) }),
      createSession(1, { gameState: createGameState(0) }),
    ];

    let session = renderSolitaireSession();
    expect(session.perspective.myIndex).toBe(0);

    mocks.sessions = [
      createSession(0, { gameState: createGameState(0, 1) }),
      createSession(1, { gameState: createGameState(0, 1) }),
    ];
    renderSolitaireSession();
    session = renderSolitaireSession();

    expect(session.perspective.promptedIndex).toBe(1);
    expect(session.perspective.myIndex).toBe(1);
  });

  it("restores the prompted side from an inactive-side active prompt after refresh", () => {
    mocks.sessions = [
      createSession(0, { gameState: createGameState(0) }),
      createSession(1, {
        gameState: createGameState(0),
        activePrompt: {
          promptType: "SELECT_TARGET",
          cards: [],
          validTargets: [],
          countMin: 0,
          countMax: 1,
          effectDescription: "Choose a target",
          ctaLabel: "Choose",
        },
      }),
    ];

    const session = renderSolitaireSession();

    expect(session.perspective.promptedIndex).toBe(1);
    expect(session.perspective.myIndex).toBe(1);
  });

  it("resets to the active side when refreshed into an already-running game", () => {
    mocks.sessions = [
      createSession(0, { gameState: createGameState(1) }),
      createSession(1, { gameState: createGameState(1) }),
    ];

    const session = renderSolitaireSession();

    expect(session.perspective.activeTurnIndex).toBe(1);
    expect(session.perspective.myIndex).toBe(1);
  });
});
