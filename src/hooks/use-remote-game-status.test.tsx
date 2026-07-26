import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteGameStatus } from "@/hooks/use-remote-game-status";

type GameStatusEvent = {
  type: "game:status";
  gameId: string;
  status: RemoteGameStatus["status"];
  winnerId: string | null;
  winReason: string | null;
};

type SpectatorRemovedEvent = {
  type: "lobby:spectator_removed";
  lobbyId: string;
  reason: "SPECTATING_DISABLED" | "REMOVED_BY_HOST";
};

const mocks = vi.hoisted(() => ({
  setterCalls: [] as unknown[][],
  setterIndex: 0,
  subscribeHandler: null as ((event: GameStatusEvent) => void) | null,
  spectatorRemovedHandler: null as
    | ((event: SpectatorRemovedEvent) => void | Promise<void>)
    | null,
  subscribeUnsub: vi.fn(),
  effectCleanups: [] as Array<() => void>,
  session: { data: { user: { id: "user-a" } } } as unknown,
}));

// Mock React's hooks to run synchronously and capture per-`useState` setter
// calls in declaration order. The hook declares state in this order:
//   0: remoteGameStatus, 1: remoteGameNotFound
vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useCallback: (cb: unknown) => cb,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === "function") {
        mocks.effectCleanups.push(cleanup);
      }
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => {
      const idx = mocks.setterIndex++;
      while (mocks.setterCalls.length <= idx) mocks.setterCalls.push([]);
      const value =
        typeof initial === "function" ? (initial as () => unknown)() : initial;
      const setter = (next: unknown) => {
        mocks.setterCalls[idx]!.push(next);
      };
      return [value, setter];
    },
  };
});

vi.mock("next-auth/react", () => ({
  useSession: () => mocks.session,
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    subscribe: (
      type: string,
      handler: (event: GameStatusEvent | SpectatorRemovedEvent) => void,
    ) => {
      if (type === "game:status") {
        mocks.subscribeHandler = handler as (event: GameStatusEvent) => void;
      }
      if (type === "lobby:spectator_removed") {
        mocks.spectatorRemovedHandler = handler as (
          event: SpectatorRemovedEvent
        ) => void | Promise<void>;
      }
      return mocks.subscribeUnsub;
    },
    connectionStatus: "connected" as const,
  }),
}));

import { useRemoteGameStatus } from "@/hooks/use-remote-game-status";

const baseStatus: RemoteGameStatus = {
  id: "game-1",
  mode: "PVP",
  status: "IN_PROGRESS",
  winnerId: null,
  winReason: null,
  winnerPerspective: "NONE",
  canFallbackConcede: true,
  playerIndex: 0,
};

beforeEach(() => {
  mocks.subscribeHandler = null;
  mocks.spectatorRemovedHandler = null;
  mocks.subscribeUnsub.mockReset();
  mocks.setterCalls = [];
  mocks.setterIndex = 0;
  mocks.effectCleanups = [];
  mocks.session = { data: { user: { id: "user-a" } } };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: baseStatus }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRemoteGameStatus subscribe behavior", () => {
  it("registers a `game:status` handler", () => {
    useRemoteGameStatus("game-1");

    expect(mocks.subscribeHandler).toBeTypeOf("function");
  });

  it("does not subscribe seated players to spectator revocation events", async () => {
    useRemoteGameStatus("game-1", false);
    await flushPromises();

    expect(mocks.spectatorRemovedHandler).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "SPECTATING_DISABLED",
      "/lobbies?joinError=Spectating%20was%20disabled%20for%20this%20party",
    ],
    [
      "REMOVED_BY_HOST",
      "/lobbies?joinError=You%20were%20removed%20from%20this%20party",
    ],
  ] as const)(
    "revalidates a mounted spectator on %s and redirects only after a 404",
    async (reason, expectedRedirect) => {
      vi.stubGlobal("window", { location: { href: "" } });
      useRemoteGameStatus("game-1", true);
      await flushPromises();

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Game not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      );

      await mocks.spectatorRemovedHandler?.({
        type: "lobby:spectator_removed",
        lobbyId: "lobby-1",
        reason,
      });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(window.location.href).toBe(expectedRedirect);
      expect(mocks.setterCalls[0]).toContain(null);
      expect(mocks.setterCalls[1]).toContain(true);
    }
  );

  it("keeps a mounted spectator when event-triggered revalidation still admits them", async () => {
    vi.stubGlobal("window", { location: { href: "" } });
    useRemoteGameStatus("game-1", true);
    await flushPromises();

    await mocks.spectatorRemovedHandler?.({
      type: "lobby:spectator_removed",
      lobbyId: "unrelated-lobby",
      reason: "REMOVED_BY_HOST",
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(window.location.href).toBe("");
    expect(mocks.setterCalls[1]).not.toContain(true);
  });

  it("recomputes winnerPerspective=SELF when the viewer is the winner", () => {
    mocks.session = { data: { user: { id: "user-a" } } };
    useRemoteGameStatus("game-1");

    // Seed `prev` non-null via the initial-fetch setter (calls[0] is the
    // remoteGameStatus setter; the first call is the resolved fetch result).
    // Then the push handler's updater function reads from that prev.
    const updater = invokeHandlerAndCaptureUpdater({
      type: "game:status",
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-a",
      winReason: "Life-out",
    });

    const next = updater(baseStatus);
    expect(next).toMatchObject({
      status: "FINISHED",
      winnerId: "user-a",
      winReason: "Life-out",
      winnerPerspective: "SELF",
      canFallbackConcede: false,
      mode: "PVP",
      playerIndex: 0,
    });
  });

  it("recomputes winnerPerspective=OPPONENT when the other player wins", () => {
    mocks.session = { data: { user: { id: "user-a" } } };
    useRemoteGameStatus("game-1");

    const updater = invokeHandlerAndCaptureUpdater({
      type: "game:status",
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-b",
      winReason: "Decked out",
    });

    const next = updater(baseStatus);
    expect(next).toMatchObject({
      winnerPerspective: "OPPONENT",
      status: "FINISHED",
      canFallbackConcede: false,
    });
  });

  it("preserves prev winnerPerspective when the session hasn't hydrated yet", () => {
    // Simulate a push that lands before next-auth resolves the session.
    mocks.session = { data: null };
    useRemoteGameStatus("game-1");

    const updater = invokeHandlerAndCaptureUpdater({
      type: "game:status",
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-a",
      winReason: "Life-out",
    });

    // `prev` claimed the viewer was the winner; without a hydrated userId,
    // recomputing would default to OPPONENT (winnerId !== "") — so we keep
    // the previous value instead.
    const prev: RemoteGameStatus = { ...baseStatus, winnerPerspective: "SELF" };
    const next = updater(prev);
    expect(next).toMatchObject({
      status: "FINISHED",
      winnerId: "user-a",
      winnerPerspective: "SELF",
      canFallbackConcede: false,
    });
  });

  it("treats null winnerId (abandoned) as winnerPerspective=NONE", () => {
    useRemoteGameStatus("game-1");

    const updater = invokeHandlerAndCaptureUpdater({
      type: "game:status",
      gameId: "game-1",
      status: "ABANDONED",
      winnerId: null,
      winReason: null,
    });

    const next = updater(baseStatus);
    expect(next).toMatchObject({
      winnerPerspective: "NONE",
      status: "ABANDONED",
      canFallbackConcede: false,
    });
  });

  it("ignores events whose gameId does not match the current gameId", () => {
    useRemoteGameStatus("game-1");
    const setterCallCountBefore = mocks.setterCalls[0]?.length ?? 0;

    mocks.subscribeHandler?.({
      type: "game:status",
      gameId: "game-2",
      status: "FINISHED",
      winnerId: "user-a",
      winReason: "Life-out",
    });

    expect(mocks.setterCalls[0]?.length ?? 0).toBe(setterCallCountBefore);
  });

  it("is a no-op when prev status is null (initial fetch hasn't landed yet)", () => {
    useRemoteGameStatus("game-1");

    const updater = invokeHandlerAndCaptureUpdater({
      type: "game:status",
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-a",
      winReason: "Life-out",
    });

    expect(updater(null)).toBeNull();
  });

  it("returns the unsubscribe function from the subscribe effect cleanup", () => {
    useRemoteGameStatus("game-1");

    expect(mocks.subscribeHandler).toBeTypeOf("function");
    expect(mocks.subscribeUnsub).not.toHaveBeenCalled();

    for (const cleanup of mocks.effectCleanups) {
      cleanup();
    }

    expect(mocks.subscribeUnsub).toHaveBeenCalledTimes(1);
  });
});

/**
 * Pushes a matching event through the captured handler, then returns the
 * `prev => next` updater the hook passed to `setRemoteGameStatus`. The hook
 * uses functional `setState` so the updater is a pure function of `prev` —
 * the test invokes it directly with a known `prev` to assert the merged
 * shape, rather than threading state through React.
 */
function invokeHandlerAndCaptureUpdater(event: GameStatusEvent) {
  const callsBefore = mocks.setterCalls[0]?.length ?? 0;
  mocks.subscribeHandler?.(event);
  const calls = mocks.setterCalls[0] ?? [];
  expect(calls.length).toBe(callsBefore + 1);
  const updater = calls[calls.length - 1];
  expect(updater).toBeTypeOf("function");
  return updater as (prev: RemoteGameStatus | null) => RemoteGameStatus | null;
}

async function flushPromises() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}
