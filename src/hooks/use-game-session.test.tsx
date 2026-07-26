import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { GameAction, GameState } from "@shared/game-types";
import type { ConnectionStatus } from "@/types/realtime";

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
  remoteStatusCalls: [] as Array<[string, boolean]>,
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
  useRemoteGameStatus: (gameId: string, revalidateSpectatorAccess: boolean) => {
    mocks.remoteStatusCalls.push([gameId, revalidateSpectatorAccess]);
    return {
      remoteGameStatus: mocks.remoteGameStatus,
      remoteGameNotFound: mocks.remoteGameNotFound,
      setRemoteGameStatus: mocks.setRemoteGameStatus,
    };
  },
}));

import {
  useGameSession,
  type GameSessionPerspective,
} from "@/hooks/use-game-session";

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

const useRenderedSession = (perspective: GameSessionPerspective = {}) =>
  useGameSession("game-1", "https://worker.example", perspective);

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
  mocks.remoteStatusCalls = [];
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

    const player0 = useRenderedSession({ requestedPlayerIndex: 0 });
    const player1 = useRenderedSession({ requestedPlayerIndex: 1 });

    expect(player0.game.myIndex).toBe(0);
    expect(player1.game.myIndex).toBe(1);
    expect(mocks.remoteStatusCalls).toEqual([
      ["game-1", false],
      ["game-1", false],
    ]);
  });

  it("keeps each instance wired to its own sendAction", () => {
    const player0SendAction = vi.fn();
    const player1SendAction = vi.fn();
    mocks.wsReturns = [
      createWsReturn({ sendAction: player0SendAction }),
      createWsReturn({ sendAction: player1SendAction }),
    ];

    const player0 = useRenderedSession({ requestedPlayerIndex: 0 });
    const player1 = useRenderedSession({ requestedPlayerIndex: 1 });
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

    const player0 = useRenderedSession({ requestedPlayerIndex: 0 });
    const player1 = useRenderedSession({ requestedPlayerIndex: 1 });

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

    useRenderedSession({ requestedPlayerIndex: 0 });
    const player1 = useRenderedSession({ requestedPlayerIndex: 1 });
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

    if (session.game.viewerRole !== "player") {
      throw new Error("Expected a resolved player session");
    }
    expectTypeOf(session.game.myIndex).toEqualTypeOf<0 | 1>();
    expectTypeOf(session.game.me).toEqualTypeOf<GameState["players"][number]>();
    expectTypeOf(session.game.opp).toEqualTypeOf<
      GameState["players"][number]
    >();
    // @ts-expect-error A resolved player session cannot have null identity.
    const impossiblePlayerIndex: null = session.game.myIndex;
    void impossiblePlayerIndex;
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

  it("projects spectator identity separately from the explicit board anchor", () => {
    const state = createGameState(["user-a", "opponent-b"]);
    mocks.wsReturns = [createWsReturn({ gameState: state })];

    const spectator = useRenderedSession({
      viewerRole: "spectator",
      bottomPlayerIndex: 1,
    });

    if (spectator.game.viewerRole !== "spectator") {
      throw new Error("Expected a spectator session");
    }
    expectTypeOf(spectator.game.myIndex).toEqualTypeOf<null>();
    expectTypeOf(spectator.game.me).toEqualTypeOf<null>();
    expectTypeOf(spectator.game.opp).toEqualTypeOf<null>();
    expectTypeOf(spectator.game.isMyTurn).toEqualTypeOf<false>();
    // @ts-expect-error A spectator session cannot expose a player seat.
    const impossibleSpectatorIndex: 0 | 1 = spectator.game.myIndex;
    void impossibleSpectatorIndex;
    expect(spectator.game.viewerRole).toBe("spectator");
    expect(spectator.game.myIndex).toBeNull();
    expect(spectator.game.me).toBeNull();
    expect(spectator.game.opp).toBeNull();
    expect(spectator.game.bottomPlayerIndex).toBe(1);
    expect(spectator.game.bottomPlayer).toBe(state.players[1]);
    expect(spectator.game.topPlayer).toBe(state.players[0]);
    expect(spectator.game.isMyTurn).toBe(false);
    expect(mocks.remoteStatusCalls).toEqual([["game-1", true]]);
  });

  it("represents unresolved player identity with the pending variant", () => {
    mocks.wsReturns = [createWsReturn({ gameState: null })];

    const pending = useRenderedSession();

    if (pending.game.viewerRole !== "pending") {
      throw new Error("Expected a pending player session");
    }
    expectTypeOf(pending.game.myIndex).toEqualTypeOf<null>();
    expectTypeOf(pending.game.me).toEqualTypeOf<null>();
    expectTypeOf(pending.game.opp).toEqualTypeOf<null>();
    expect(pending.game.myIndex).toBeNull();
  });

  it("logs and drops spectator actions before the websocket sender", () => {
    const rawSendAction = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.wsReturns = [createWsReturn({ sendAction: rawSendAction })];
    const spectator = useRenderedSession({ viewerRole: "spectator" });
    const action = { type: "END_TURN" } as unknown as GameAction;

    spectator.game.sendAction(action);

    expect(rawSendAction).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[game-session] Ignored spectator action",
      action
    );
    warn.mockRestore();
  });

  it("keeps finalization, leave, and fallback-concede mutations inert for spectators", async () => {
    const finishedState = createGameState(["user-a", "opponent-b"], "FINISHED");
    const leaveGame = vi.fn().mockResolvedValue(undefined);
    mocks.remoteGameStatus = {
      mode: "PVP",
      status: "IN_PROGRESS",
      canFallbackConcede: true,
    };
    mocks.wsReturns = [
      createWsReturn({
        gameState: finishedState,
        gameOver: { winner: 0, reason: "Victory" },
        leaveGame,
      }),
    ];

    const spectator = useRenderedSession({ viewerRole: "spectator" });
    await flushAsync();
    await spectator.navigation.handleFallbackConcede();
    await spectator.navigation.handleLeaveGame();

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(leaveGame).not.toHaveBeenCalled();
    expect(spectator.navigation.fallbackConcedeAvailable).toBe(false);
    expect(window.location.href).toBe("/lobbies");
  });

  it("hides fallback concede for a disconnected spectator without game state", () => {
    mocks.remoteGameStatus = {
      mode: "PVP",
      status: "IN_PROGRESS",
      canFallbackConcede: true,
    };
    mocks.wsReturns = [
      createWsReturn({
        gameState: null,
        connectionStatus: "failed",
      }),
    ];

    const spectator = useRenderedSession({ viewerRole: "spectator" });

    expect(spectator.game.viewerRole).toBe("spectator");
    expect(spectator.game.gameState).toBeNull();
    expect(spectator.game.connectivityFailed).toBe(true);
    expect(spectator.navigation.fallbackConcedeAvailable).toBe(false);
  });
});
