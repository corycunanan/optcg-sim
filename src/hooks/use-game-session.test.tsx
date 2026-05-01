import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameAction, GameState } from "@shared/game-types";
import type { ConnectionStatus } from "@/hooks/use-game-ws";

const mocks = vi.hoisted(() => ({
  wsReturns: [] as Array<{
    gameState: GameState | null;
    connectionStatus: ConnectionStatus;
    lastError: string | null;
    activePrompt: null;
    gameOver: { winner: 0 | 1 | null; reason: string } | null;
    canUndo: boolean;
    sendAction: ReturnType<typeof vi.fn>;
    leaveGame: ReturnType<typeof vi.fn>;
    retryConnection: ReturnType<typeof vi.fn>;
  }>,
  wsCallIndex: 0,
  cardDbError: null as string | null,
  remoteGameStatus: {
    mode: "PVP",
    status: "IN_PROGRESS",
    canFallbackConcede: false,
  },
  remoteGameNotFound: false,
  setRemoteGameStatus: vi.fn(),
  retryFetchCards: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void | (() => void)) => effect(),
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => [
      typeof initial === "function" ? (initial as () => unknown)() : initial,
      vi.fn(),
    ],
  };
});

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "user-a" } } }),
}));

vi.mock("@/hooks/use-game-ws", () => ({
  useGameWs: vi.fn(() => {
    const value = mocks.wsReturns[mocks.wsCallIndex];
    mocks.wsCallIndex += 1;
    if (!value) throw new Error("Missing mocked useGameWs return");
    return value;
  }),
}));

vi.mock("@/hooks/use-card-database", () => ({
  useCardDatabase: () => ({
    cardDb: {},
    cardDbReady: true,
    cardDbError: mocks.cardDbError,
    retryFetchCards: mocks.retryFetchCards,
  }),
}));

vi.mock("@/hooks/use-remote-game-status", () => ({
  useRemoteGameStatus: () => ({
    remoteGameStatus: mocks.remoteGameStatus,
    remoteGameNotFound: mocks.remoteGameNotFound,
    setRemoteGameStatus: mocks.setRemoteGameStatus,
  }),
}));

import { useGameSession } from "@/hooks/use-game-session";

const createGameState = (
  playerIds: [string, string],
  status: GameState["status"] = "IN_PROGRESS"
): GameState =>
  ({
    status,
    winner: status === "IN_PROGRESS" ? null : 0,
    winReason: status === "IN_PROGRESS" ? null : "Game ended",
    players: playerIds.map((playerId) => ({
      playerId,
      connected: true,
      rejoinDeadlineAt: null,
      awayReason: null,
    })),
    turn: {
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
    },
    activeEffects: [],
  }) as unknown as GameState;

const createWsReturn = (
  overrides: Partial<(typeof mocks.wsReturns)[number]> = {}
): (typeof mocks.wsReturns)[number] => ({
  gameState: createGameState(["user-a", "opponent-b"]),
  connectionStatus: "connected",
  lastError: null,
  activePrompt: null,
  gameOver: null,
  canUndo: false,
  sendAction: vi.fn(),
  leaveGame: vi.fn().mockResolvedValue(undefined),
  retryConnection: vi.fn(),
  ...overrides,
});

const useRenderedSession = (requestedPlayerIndex?: 0 | 1) =>
  useGameSession("game-1", "https://worker.example", requestedPlayerIndex);

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  mocks.wsReturns = [];
  mocks.wsCallIndex = 0;
  mocks.cardDbError = null;
  mocks.remoteGameStatus = {
    mode: "PVP",
    status: "IN_PROGRESS",
    canFallbackConcede: false,
  };
  mocks.remoteGameNotFound = false;
  mocks.setRemoteGameStatus.mockReset();
  mocks.retryFetchCards.mockReset();
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ data: {} }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("window", { location: { href: "" } });
});

describe("useGameSession multi-instance composition", () => {
  it("derives independent player indexes for same-user Solitaire perspectives", () => {
    const sameUserState = createGameState(["user-a", "user-a"]);
    mocks.wsReturns = [
      createWsReturn({ gameState: sameUserState }),
      createWsReturn({ gameState: sameUserState }),
    ];

    const player0 = useRenderedSession(0);
    const player1 = useRenderedSession(1);

    expect(player0.game.myIndex).toBe(0);
    expect(player1.game.myIndex).toBe(1);
  });

  it("keeps each instance wired to its own sendAction", () => {
    const player0SendAction = vi.fn();
    const player1SendAction = vi.fn();
    mocks.wsReturns = [
      createWsReturn({ sendAction: player0SendAction }),
      createWsReturn({ sendAction: player1SendAction }),
    ];

    const player0 = useRenderedSession(0);
    const player1 = useRenderedSession(1);
    const action = { type: "END_TURN" } as unknown as GameAction;

    player0.game.sendAction(action);

    expect(player0SendAction).toHaveBeenCalledWith(action);
    expect(player1SendAction).not.toHaveBeenCalled();
    expect(player1.game.sendAction).toBeTypeOf("function");
  });

  it("reports connection status per instance", () => {
    mocks.wsReturns = [
      createWsReturn({ connectionStatus: "error" }),
      createWsReturn({ connectionStatus: "connected" }),
    ];

    const player0 = useRenderedSession(0);
    const player1 = useRenderedSession(1);

    expect(player0.game.connectionStatus).toBe("error");
    expect(player1.game.connectionStatus).toBe("connected");
  });

  it("finalizes once when dual Solitaire instances observe a closed match", async () => {
    const finishedState = createGameState(["user-a", "user-a"], "FINISHED");
    const gameOver = { winner: 0 as const, reason: "Victory" };
    mocks.wsReturns = [
      createWsReturn({ gameState: finishedState, gameOver }),
      createWsReturn({ gameState: finishedState, gameOver }),
    ];

    useRenderedSession(0);
    const player1 = useRenderedSession(1);
    await flushAsync();

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/game/game-1",
      expect.objectContaining({ method: "POST" })
    );
    await player1.navigation.handleBackToLobbies();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves single-instance PVP player derivation and finalization", async () => {
    const finishedState = createGameState(["opponent-b", "user-a"], "FINISHED");
    mocks.wsReturns = [
      createWsReturn({
        gameState: finishedState,
        gameOver: { winner: 1, reason: "Victory" },
      }),
    ];

    const session = useRenderedSession();
    await flushAsync();

    expect(session.game.myIndex).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/game/game-1",
      expect.objectContaining({
        body: JSON.stringify({
          action: "FINALIZE",
          winnerId: "user-a",
          winReason: "Victory",
        }),
      })
    );
  });
});
