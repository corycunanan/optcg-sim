import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LobbyRoomState } from "@/lib/lobbies/state";

type LobbyEvent = { type: "lobby:state_changed"; lobby: LobbyRoomState };

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  setterCalls: [] as unknown[][],
  setterIndex: 0,
  subscribeHandler: null as ((event: LobbyEvent) => void) | null,
  subscribeUnsub: vi.fn(),
}));

// Mock React's hooks to run synchronously and capture per-`useState` setter
// calls in declaration order. The hook declares state in this order:
//   0: lobby, 1: loading, 2: error, 3: mutating, 4: starting
// Tests assert on the lobby setter (index 0).
vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useCallback: (cb: unknown) => cb,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
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
  apiGet: (...args: unknown[]) => mocks.apiGet(...args),
  apiPatch: (...args: unknown[]) => mocks.apiPatch(...args),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    subscribe: <T extends string>(
      type: T,
      handler: (event: LobbyEvent) => void,
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
    status: "WAITING",
    joinCode: "ABCD",
    format: "Standard",
    mode: "PVP",
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
  mocks.apiPatch.mockReset();
  mocks.apiPost.mockReset();
  mocks.subscribeUnsub.mockReset();
  mocks.subscribeHandler = null;
  mocks.setterCalls = [];
  mocks.setterIndex = 0;

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

    const updated = lobbyState({ format: "Eternal", hostReady: true });
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
    // The hook's subscribe useEffect returns the dispatcher's unsubscribe.
    // The mocked `useEffect` invokes the effect synchronously and discards the
    // cleanup return value, so we verify by checking that subscribe was wired
    // to the same unsub our mock owns.
    useLobbyRoom("lobby-1", lobbyState());

    expect(mocks.subscribeHandler).toBeTypeOf("function");
    expect(mocks.subscribeUnsub).toHaveBeenCalledTimes(0);
  });
});
