import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteGameStatus } from "./use-remote-game-status";

const stateSetters = vi.hoisted(() => [] as ReturnType<typeof vi.fn>[]);

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useEffect: vi.fn(),
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => {
      const setter = vi.fn();
      stateSetters.push(setter);
      return [initial, setter];
    },
  };
});

import { useGameFinalizer } from "./use-game-finalizer";

afterEach(() => {
  stateSetters.length = 0;
  vi.unstubAllGlobals();
});

describe("useGameFinalizer", () => {
  it("finalizes a completed match before returning to the shared party", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { href: "/game/game-1" } });
    const leaveGame = vi.fn();

    const { handleBackToLobbies } = useGameFinalizer({
      gameId: "game-1",
      gameState: {
        players: [{ playerId: "user-1" }, { playerId: "user-2" }],
      } as never,
      gameOver: { winner: 0, reason: "Life-out" },
      matchClosed: true,
      leaveGame,
      setRemoteGameStatus: vi.fn(),
    });

    await handleBackToLobbies();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/game/game-1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "FINALIZE",
          winnerId: "user-1",
          winReason: "Life-out",
        }),
      })
    );
    expect(leaveGame).not.toHaveBeenCalled();
    expect(window.location.href).toBe("/lobbies");
  });

  it("returns an unfinished match to lobbies through the leave flow", async () => {
    vi.stubGlobal("window", { location: { href: "/game/game-1" } });
    const leaveGame = vi.fn().mockResolvedValue(undefined);

    const { handleBackToLobbies } = useGameFinalizer({
      gameId: "game-1",
      gameState: null,
      gameOver: null,
      matchClosed: false,
      leaveGame,
      setRemoteGameStatus: vi.fn(),
    });

    await handleBackToLobbies();

    expect(leaveGame).toHaveBeenCalledOnce();
    expect(window.location.href).toBe("/lobbies");
  });

  it("accepts the concession response, updates status, and redirects", async () => {
    const responseStatus = {
      id: "game-1",
      status: "FINISHED" as const,
      winnerId: "user-2",
      winReason: "Player conceded while disconnected",
      winnerPerspective: "OPPONENT" as const,
      canFallbackConcede: false,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: responseStatus }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { href: "/game/game-1" } });
    const setRemoteGameStatus = vi.fn();

    const { handleFallbackConcede } = useGameFinalizer({
      gameId: "game-1",
      gameState: null,
      gameOver: null,
      matchClosed: false,
      leaveGame: vi.fn(),
      setRemoteGameStatus,
    });

    await handleFallbackConcede();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/game/game-1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "CONCEDE" }),
      })
    );
    const updater = setRemoteGameStatus.mock.calls[0]?.[0] as (
      current: RemoteGameStatus
    ) => RemoteGameStatus;
    const current: RemoteGameStatus = {
      ...responseStatus,
      status: "IN_PROGRESS",
      winnerId: null,
      winReason: null,
      winnerPerspective: "NONE",
      canFallbackConcede: true,
      mode: "PVP",
      playerIndex: 0,
    };
    expect(updater(current)).toEqual({
      ...current,
      ...responseStatus,
    });
    expect(window.location.href).toBe("/lobbies");
    expect(stateSetters[3]).not.toHaveBeenCalledWith(expect.any(String));
  });
});
