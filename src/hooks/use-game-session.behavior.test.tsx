import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type {
  BattleSubPhase,
  GameState,
  ServerMessage,
} from "@shared/game-types";
import type { RemoteGameStatus } from "@/hooks/use-remote-game-status";

const boundaries = vi.hoisted(() => ({
  cardDbError: null as string | null,
  retryFetchCards: vi.fn(),
  remoteGameStatus: null as RemoteGameStatus | null,
  remoteGameNotFound: false,
  setRemoteGameStatus: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "user-a" } } }),
}));

vi.mock("@/hooks/use-card-database", () => ({
  useCardDatabase: () => ({
    cardDb: {},
    cardDbReady: true,
    cardDbError: boundaries.cardDbError,
    retryFetchCards: boundaries.retryFetchCards,
  }),
}));

vi.mock("@/hooks/use-remote-game-status", () => ({
  useRemoteGameStatus: () => ({
    remoteGameStatus: boundaries.remoteGameStatus,
    remoteGameNotFound: boundaries.remoteGameNotFound,
    setRemoteGameStatus: boundaries.setRemoteGameStatus,
  }),
}));

import { useGameFinalizer } from "@/hooks/use-game-finalizer";
import type { UseGameFinalizerReturn } from "@/hooks/use-game-finalizer";
import {
  useGameSession,
  type GameSessionPerspective,
} from "@/hooks/use-game-session";

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  simulateServerClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({});
  }

  simulateMessage(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const NOW = Date.parse("2026-07-15T18:00:00Z");

const inProgressStatus = (): RemoteGameStatus => ({
  id: "game-1",
  mode: "PVP",
  status: "IN_PROGRESS",
  winnerId: null,
  winReason: null,
  winnerPerspective: "NONE",
  canFallbackConcede: false,
  playerIndex: 0,
});

interface GameStateOptions {
  status?: GameState["status"];
  winner?: 0 | 1 | null;
  winReason?: string | null;
  activePlayerIndex?: 0 | 1;
  battleSubPhase?: BattleSubPhase | null;
  opponentConnected?: boolean;
  opponentAwayReason?: "LEFT" | "DISCONNECTED" | null;
  opponentDeadline?: number | null;
}

function createGameState({
  status = "IN_PROGRESS",
  winner = null,
  winReason = null,
  activePlayerIndex = 0,
  battleSubPhase = null,
  opponentConnected = true,
  opponentAwayReason = null,
  opponentDeadline = null,
}: GameStateOptions = {}): GameState {
  return {
    status,
    winner,
    winReason,
    players: [
      {
        playerId: "user-a",
        connected: true,
        awayReason: null,
        rejoinDeadlineAt: null,
      },
      {
        playerId: "opponent-b",
        connected: opponentConnected,
        awayReason: opponentAwayReason,
        rejoinDeadlineAt: opponentDeadline,
      },
    ],
    turn: {
      number: 1,
      activePlayerIndex,
      phase: "MAIN",
      battleSubPhase,
    },
    activeEffects: [],
    pendingPrompt: null,
  } as unknown as GameState;
}

type GameSession = ReturnType<typeof useGameSession>;

let renderer: ReactTestRenderer | null = null;
let latestSession: GameSession | null = null;
let latestFinalizer: UseGameFinalizerReturn | null = null;
let postResponder: () => Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;
let sessionPerspective: GameSessionPerspective = {};

function SessionProbe() {
  const value = useGameSession(
    "game-1",
    "https://worker.example",
    sessionPerspective
  );
  useEffect(() => {
    latestSession = value;
  }, [value]);
  return null;
}

function FinalizerProbe({ leaveGame }: { leaveGame: () => Promise<void> }) {
  const value = useGameFinalizer({
    gameId: "game-1",
    gameState: null,
    gameOver: null,
    matchClosed: false,
    leaveGame,
    setRemoteGameStatus: boundaries.setRemoteGameStatus,
  });
  useEffect(() => {
    latestFinalizer = value;
  }, [value]);
  return null;
}

function session(): GameSession {
  if (!latestSession) throw new Error("Session has not rendered");
  return latestSession;
}

function finalizer(): UseGameFinalizerReturn {
  if (!latestFinalizer) throw new Error("Finalizer has not rendered");
  return latestFinalizer;
}

async function mountSession(perspective: GameSessionPerspective = {}) {
  sessionPerspective = perspective;
  await act(async () => {
    renderer = create(<SessionProbe />);
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(FakeWebSocket.instances).toHaveLength(1);
}

async function rerenderSession() {
  await act(async () => {
    renderer?.update(<SessionProbe />);
  });
}

async function emit(message: ServerMessage) {
  await act(async () => {
    FakeWebSocket.instances.at(-1)?.simulateMessage(message);
  });
}

function postCalls() {
  return fetchMock.mock.calls.filter(
    ([url, init]) =>
      url === "/api/game/game-1" &&
      (init as RequestInit | undefined)?.method === "POST"
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("window", { location: { href: "/game/game-1" } });

  FakeWebSocket.instances = [];
  boundaries.cardDbError = null;
  boundaries.retryFetchCards.mockReset();
  boundaries.remoteGameStatus = inProgressStatus();
  boundaries.remoteGameNotFound = false;
  boundaries.setRemoteGameStatus.mockReset();
  latestSession = null;
  latestFinalizer = null;
  renderer = null;
  sessionPerspective = {};

  postResponder = async () =>
    new Response(JSON.stringify({ data: {} }), { status: 200 });
  fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const requestUrl = String(url);
    if (requestUrl.startsWith("/api/game/token?")) {
      return new Response(JSON.stringify({ data: { token: "token-1" } }), {
        status: 200,
      });
    }
    if (requestUrl === "/api/game/game-1" && init?.method === "POST") {
      return postResponder();
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer?.unmount();
    });
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useGameSession behavior", () => {
  it("connects, reconnects after a drop, and retries both failed connectivity domains", async () => {
    await mountSession();
    const firstSocket = FakeWebSocket.instances[0]!;

    expect(session().game.connectionStatus).toBe("connecting");
    await act(async () => firstSocket.simulateOpen());
    expect(session().game.connectionStatus).toBe("connected");

    await act(async () => firstSocket.simulateServerClose());
    expect(session().game.connectionStatus).toBe("disconnected");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);
    const reconnectedSocket = FakeWebSocket.instances[1]!;
    await act(async () => reconnectedSocket.simulateOpen());
    expect(session().game.connectionStatus).toBe("connected");

    boundaries.cardDbError = "Failed to load card data.";
    await rerenderSession();
    expect(session().game.connectivityFailed).toBe(true);

    await act(async () => {
      session().game.retryConnection();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(boundaries.retryFetchCards).toHaveBeenCalledOnce();
    expect(reconnectedSocket.close).toHaveBeenCalledOnce();
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(session().game.connectionStatus).toBe("connecting");
  });

  it("projects game state and accepted updates from the real message handler", async () => {
    await mountSession();
    const initialState = createGameState({ activePlayerIndex: 0 });

    await emit({ type: "game:state", state: initialState, canUndo: true });
    expect(session().game.gameState).toStrictEqual(initialState);
    expect(session().game.isMyTurn).toBe(true);
    expect(session().game.canUndo).toBe(true);

    const updatedState = createGameState({ activePlayerIndex: 1 });
    await emit({
      type: "game:update",
      action: { type: "ADVANCE_PHASE" },
      state: updatedState,
      canUndo: false,
    });

    expect(session().game.gameState).toStrictEqual(updatedState);
    expect(session().game.isMyTurn).toBe(false);
    expect(session().game.canUndo).toBe(false);
    expect(session().game.acceptedUpdate).toEqual({
      action: { type: "ADVANCE_PHASE" },
      sequence: 1,
    });
  });

  it("counts down disconnects and pauses opponent turns and response steps", async () => {
    await mountSession();
    const deadline = NOW + 5000;

    await emit({
      type: "game:state",
      state: createGameState({
        activePlayerIndex: 1,
        opponentConnected: false,
        opponentAwayReason: "DISCONNECTED",
        opponentDeadline: deadline,
      }),
    });

    expect(session().opponent).toEqual({
      opponentAway: true,
      opponentAwayText: "Opponent disconnected.",
      gamePausedForOpponent: true,
      opponentDeadlineRemaining: 5000,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(session().opponent.opponentDeadlineRemaining).toBe(4000);

    for (const battleSubPhase of [
      "BLOCK_STEP",
      "COUNTER_STEP",
      "DAMAGE_STEP",
    ] as const) {
      await emit({
        type: "game:update",
        state: createGameState({
          activePlayerIndex: 0,
          battleSubPhase,
          opponentConnected: false,
          opponentAwayReason: "LEFT",
          opponentDeadline: deadline,
        }),
      });
      expect(session().opponent.opponentAwayText).toBe(
        "Opponent left the game."
      );
      expect(session().opponent.gamePausedForOpponent).toBe(true);
    }

    await emit({
      type: "game:update",
      state: createGameState({
        activePlayerIndex: 0,
        battleSubPhase: "ATTACK_STEP",
        opponentConnected: false,
        opponentAwayReason: "LEFT",
        opponentDeadline: deadline,
      }),
    });
    expect(session().opponent.gamePausedForOpponent).toBe(false);
  });

  it("leaves an open match over the socket before navigating", async () => {
    await mountSession();
    const socket = FakeWebSocket.instances[0]!;
    await act(async () => socket.simulateOpen());

    await act(async () => {
      const navigation = session().navigation.handleBackToLobbies();
      await vi.advanceTimersByTimeAsync(100);
      await navigation;
    });

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "game:leave" })
    );
    expect(socket.close).toHaveBeenCalledOnce();
    expect(window.location.href).toBe("/lobbies");
    expect(postCalls()).toHaveLength(0);
  });

  it("surfaces leave failure through the rendered finalizer contract", async () => {
    const leaveGame = vi
      .fn()
      .mockRejectedValue(new Error("socket close failed"));
    await act(async () => {
      renderer = create(<FinalizerProbe leaveGame={leaveGame} />);
    });

    await act(async () => {
      await finalizer().handleLeaveGame();
    });

    expect(leaveGame).toHaveBeenCalledOnce();
    expect(finalizer().leavingGame).toBe(false);
    expect(finalizer().leaveError).toBe("Failed to leave the game cleanly");
    expect(window.location.href).toBe("/game/game-1");
  });

  it("surfaces fallback concede failure without navigating", async () => {
    boundaries.remoteGameStatus = {
      ...inProgressStatus(),
      canFallbackConcede: true,
    };
    postResponder = async () =>
      new Response(JSON.stringify({ error: "Concede rejected" }), {
        status: 503,
      });
    await mountSession();
    await act(async () => FakeWebSocket.instances[0]!.simulateOpen());
    expect(session().navigation.fallbackConcedeAvailable).toBe(true);

    await act(async () => {
      await session().navigation.handleFallbackConcede();
    });

    expect(session().navigation.fallbackSubmitting).toBe(false);
    expect(session().navigation.fallbackError).toBe("Concede rejected");
    expect(window.location.href).toBe("/game/game-1");
    expect(postCalls()).toHaveLength(1);
  });

  it("applies terminal precedence and finalizes once across duplicate signals", async () => {
    boundaries.remoteGameStatus = {
      ...inProgressStatus(),
      status: "FINISHED",
      winnerId: "opponent-b",
      winReason: "Persisted result",
      winnerPerspective: "OPPONENT",
      canFallbackConcede: false,
    };
    await mountSession();
    await act(async () => {
      await Promise.resolve();
    });

    expect(session().game.matchClosed).toBe(true);
    expect(session().endState).toEqual({
      endTitle: "DEFEAT",
      endColorClass: "text-gb-accent-red",
      endReason: "Persisted result",
    });
    expect(postCalls()).toHaveLength(1);

    await emit({
      type: "game:state",
      state: createGameState({
        status: "FINISHED",
        winner: 0,
        winReason: "Worker state result",
      }),
    });
    expect(session().endState).toEqual({
      endTitle: "VICTORY",
      endColorClass: "text-gb-accent-green",
      endReason: "Worker state result",
    });

    await emit({
      type: "game:over",
      winner: null,
      reason: "Socket result override",
    });
    expect(session().endState).toEqual({
      endTitle: "DRAW",
      endColorClass: "text-gb-accent-amber",
      endReason: "Socket result override",
    });
    expect(postCalls()).toHaveLength(1);

    const socket = FakeWebSocket.instances[0]!;
    await act(async () => {
      await session().navigation.handleBackToLobbies();
    });
    expect(postCalls()).toHaveLength(1);
    expect(socket.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: "game:leave" })
    );
    expect(window.location.href).toBe("/lobbies");
  });

  it("connects and retries spectators without a playerIndex token parameter", async () => {
    await mountSession({
      viewerRole: "spectator",
      bottomPlayerIndex: 1,
      lobbyId: "lobby-1",
    });
    const firstTokenUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(firstTokenUrl).toBe("/api/game/token?gameId=game-1");

    const firstSocket = FakeWebSocket.instances[0]!;
    await act(async () => firstSocket.simulateOpen());
    await act(async () => firstSocket.simulateServerClose());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);

    const reconnectedSocket = FakeWebSocket.instances[1]!;
    await act(async () => reconnectedSocket.simulateOpen());
    await act(async () => {
      session().game.retryConnection();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reconnectedSocket.close).toHaveBeenCalledOnce();
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(
      fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.startsWith("/api/game/token?"))
    ).not.toContainEqual(expect.stringContaining("playerIndex"));
  });

  it("keeps real spectator action, finalization, and concede transports inert", async () => {
    boundaries.remoteGameStatus = {
      ...inProgressStatus(),
      canFallbackConcede: true,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mountSession({
      viewerRole: "spectator",
      bottomPlayerIndex: 1,
      lobbyId: "lobby-1",
    });
    const socket = FakeWebSocket.instances[0]!;
    await act(async () => socket.simulateOpen());

    await emit({
      type: "game:state",
      state: createGameState({
        status: "FINISHED",
        winner: 0,
        winReason: "Player 1 won",
      }),
    });
    expect(session().game.viewerRole).toBe("spectator");
    expect(session().game.myIndex).toBeNull();
    expect(session().game.bottomPlayerIndex).toBe(1);
    expect(session().game.isMyTurn).toBe(false);

    await act(async () => {
      session().game.sendAction({ type: "ADVANCE_PHASE" });
      await session().navigation.handleFallbackConcede();
      await Promise.resolve();
    });

    expect(warn).toHaveBeenCalledOnce();
    expect(postCalls()).toHaveLength(0);
    expect(socket.send).not.toHaveBeenCalled();
    expect(session().navigation.fallbackConcedeAvailable).toBe(false);
    warn.mockRestore();
  });
});
