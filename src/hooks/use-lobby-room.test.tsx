import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LobbyRoomState } from "@/lib/lobbies/state";

type LobbyEvent = { type: "lobby:state_changed"; lobby: LobbyRoomState };

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  setterCalls: [] as unknown[][],
  setterIndex: 0,
  subscribeHandler: null as ((event: LobbyEvent) => void) | null,
  subscribeUnsub: vi.fn(),
  effectCleanups: [] as Array<() => void>,
}));

// Mock React's hooks to run synchronously and capture per-`useState` setter
// calls in declaration order. The hook declares state in this order:
//   0: lobby, 1: loading, 2: error, 3: mutating, 4: starting, 5: leaving,
//   6: closing
// Tests assert on the lobby setter (index 0) and the error setter (index 2).
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

vi.mock("@/lib/api-client", () => ({
  apiDelete: (...args: unknown[]) => mocks.apiDelete(...args),
  apiGet: (...args: unknown[]) => mocks.apiGet(...args),
  apiPatch: (...args: unknown[]) => mocks.apiPatch(...args),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    subscribe: <T extends string>(
      type: T,
      handler: (event: LobbyEvent) => void
    ) => {
      if (type === "lobby:state_changed") {
        mocks.subscribeHandler = handler;
      }
      return mocks.subscribeUnsub;
    },
    connectionStatus: "connected" as const,
  }),
}));

import { useLobbyRoom } from "@/hooks/use-lobby-room";

function lobbyState(overrides: Partial<LobbyRoomState> = {}): LobbyRoomState {
  return {
    id: "lobby-1",
    version: 1,
    status: "WAITING",
    joinCode: "ABCD",
    format: "Standard",
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    hostReady: false,
    hostUserId: "host-user",
    host: { username: "hosty", name: null, image: null },
    hostDeck: null,
    guest: null,
    gameId: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.apiGet.mockReset();
  mocks.apiDelete.mockReset();
  mocks.apiPatch.mockReset();
  mocks.apiPost.mockReset();
  mocks.addEventListener.mockReset();
  mocks.removeEventListener.mockReset();
  mocks.subscribeUnsub.mockReset();
  mocks.subscribeHandler = null;
  mocks.setterCalls = [];
  mocks.setterIndex = 0;
  mocks.effectCleanups = [];
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: mocks.addEventListener,
    removeEventListener: mocks.removeEventListener,
  });

  // Default API responses so the initial refresh doesn't blow up the tests
  // that exercise subscribe behavior.
  mocks.apiGet.mockResolvedValue({ data: lobbyState() });
});

describe("useLobbyRoom subscribe behavior", () => {
  it("registers a `lobby:state_changed` handler", () => {
    useLobbyRoom("lobby-1", lobbyState());

    expect(mocks.subscribeHandler).toBeTypeOf("function");
  });

  it("updates the lobby state when the event matches the current lobbyId", () => {
    useLobbyRoom("lobby-1", lobbyState());

    const updated = lobbyState({
      version: 2,
      format: "Eternal",
      hostReady: true,
    });
    mocks.subscribeHandler?.({ type: "lobby:state_changed", lobby: updated });

    // setterCalls[0] is the lobby setter (declaration order, see mock).
    expect(mocks.setterCalls[0]).toContainEqual(updated);
  });

  it("ignores events whose lobby.id does not match the current lobbyId", () => {
    useLobbyRoom("lobby-1", lobbyState());
    const lobbySetterCallCountBefore = mocks.setterCalls[0]?.length ?? 0;

    mocks.subscribeHandler?.({
      type: "lobby:state_changed",
      lobby: lobbyState({ id: "lobby-2", format: "Eternal" }),
    });

    expect(mocks.setterCalls[0]?.length ?? 0).toBe(lobbySetterCallCountBefore);
  });

  it("returns the unsubscribe function from the subscribe effect cleanup", () => {
    useLobbyRoom("lobby-1", lobbyState());

    expect(mocks.subscribeHandler).toBeTypeOf("function");
    expect(mocks.subscribeUnsub).not.toHaveBeenCalled();

    // Run every captured cleanup; the dispatcher unsub must be one of them.
    for (const cleanup of mocks.effectCleanups) {
      cleanup();
    }

    expect(mocks.subscribeUnsub).toHaveBeenCalledTimes(1);
  });

  it("clears stale error state when a matching event arrives", () => {
    useLobbyRoom("lobby-1", lobbyState());

    mocks.subscribeHandler?.({
      type: "lobby:state_changed",
      lobby: lobbyState({ format: "Eternal" }),
    });

    // setterCalls[2] is the error setter (declaration order: lobby, loading,
    // error, mutating, starting). The push handler must reset it to null so
    // a stale "Lobby unavailable" doesn't linger after the room recovers.
    expect(mocks.setterCalls[2]).toContain(null);
  });

  it("refreshes once when the tab becomes visible", async () => {
    useLobbyRoom("lobby-1", lobbyState());
    await Promise.resolve();
    const initialFetchCount = mocks.apiGet.mock.calls.length;

    const visibilityHandler = mocks.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "visibilitychange"
    )?.[1] as (() => void) | undefined;
    expect(visibilityHandler).toBeTypeOf("function");

    visibilityHandler?.();
    await Promise.resolve();

    expect(mocks.apiGet).toHaveBeenCalledTimes(initialFetchCount + 1);
  });
});

describe("useLobbyRoom leave behavior", () => {
  it("posts to the dedicated guest leave endpoint", async () => {
    mocks.apiPost.mockResolvedValueOnce({ success: true });
    const room = useLobbyRoom("lobby-1", lobbyState());

    await room.leaveLobby();

    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/lobbies/lobby-1/leave",
      undefined,
      expect.anything()
    );
  });
});

describe("useLobbyRoom close behavior", () => {
  it("deletes through the host close endpoint", async () => {
    mocks.apiDelete.mockResolvedValueOnce({ success: true });
    const room = useLobbyRoom("lobby-1", lobbyState());

    await room.closeLobby();

    expect(mocks.apiDelete).toHaveBeenCalledWith(
      "/api/lobbies/lobby-1",
      expect.anything()
    );
  });
});
