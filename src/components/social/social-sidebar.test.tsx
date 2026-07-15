import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FriendEntry, FriendRequestEntry } from "./apply-friend-event";

type CapturedCallback = (...args: never[]) => unknown;

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  callbacks: [] as CapturedCallback[],
  setterCalls: [] as unknown[][],
  setterIndex: 0,
}));

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useCallback: <T,>(callback: T) => {
      mocks.callbacks.push(callback as CapturedCallback);
      return callback;
    },
    useEffect: () => undefined,
    useRef: <T,>(initial: T) => ({ current: initial }),
    useState: <T,>(initial: T) => {
      const index = mocks.setterIndex++;
      while (mocks.setterCalls.length <= index) mocks.setterCalls.push([]);
      return [
        initial,
        (next: T | ((previous: T) => T)) => {
          mocks.setterCalls[index]!.push(next);
        },
      ];
    },
  };
});

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({ data: { user: { name: "Tester" } } }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("@/lib/api-client", () => ({
  apiDelete: (...args: unknown[]) => mocks.apiDelete(...args),
  apiGet: (...args: unknown[]) => mocks.apiGet(...args),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  apiPut: (...args: unknown[]) => mocks.apiPut(...args),
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    subscribe: vi.fn(() => vi.fn()),
    connectionStatus: "connected",
    presence: {},
    trackPresence: vi.fn(),
  }),
}));

import { SocialSidebar } from "./social-sidebar";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function applyStateUpdates<T>(initial: T, updates: unknown[]): T {
  return updates.reduce<T>((state, update) => {
    if (typeof update === "function") {
      return (update as (previous: T) => T)(state);
    }
    return update as T;
  }, initial);
}

function captureSidebarCallbacks() {
  SocialSidebar({ onOpenChat: vi.fn() });
  return {
    fetchFriendsData: mocks.callbacks[0] as () => Promise<void>,
    removeFriend: mocks.callbacks[2] as (userId: string) => Promise<void>,
    handleFriendRequest: mocks.callbacks[4] as (
      requestId: string,
      action: "accept" | "decline"
    ) => Promise<void>,
  };
}

beforeEach(() => {
  mocks.apiDelete.mockReset();
  mocks.apiGet.mockReset();
  mocks.apiPost.mockReset();
  mocks.apiPut.mockReset();
  mocks.callbacks = [];
  mocks.setterCalls = [];
  mocks.setterIndex = 0;
});

describe("SocialSidebar fetch epochs", () => {
  it("does not restore a removed friend from a stale in-flight fetch", async () => {
    const friend: FriendEntry = {
      friendshipId: "friendship-1",
      user: {
        id: "friend-1",
        username: "nami",
        name: "Nami",
        image: null,
      },
    };
    const staleFriends = deferred<{ data: FriendEntry[] }>();
    const staleRequests = deferred<{
      data: { incoming: FriendRequestEntry[] };
    }>();
    let friendsFetches = 0;
    let requestFetches = 0;

    mocks.apiGet.mockImplementation((url: string) => {
      if (url === "/api/friends") {
        friendsFetches += 1;
        return friendsFetches === 1
          ? staleFriends.promise
          : Promise.resolve({ data: [] });
      }
      requestFetches += 1;
      return requestFetches === 1
        ? staleRequests.promise
        : Promise.resolve({ data: { incoming: [] } });
    });
    mocks.apiDelete.mockResolvedValue({});

    const { fetchFriendsData, removeFriend } = captureSidebarCallbacks();
    const staleFetch = fetchFriendsData();

    await removeFriend(friend.user.id);
    await Promise.resolve();
    staleFriends.resolve({ data: [friend] });
    staleRequests.resolve({ data: { incoming: [] } });
    await staleFetch;

    expect(applyStateUpdates([friend], mocks.setterCalls[0] ?? [])).toEqual([]);
  });

  it("does not restore a declined request from a stale in-flight fetch", async () => {
    const request: FriendRequestEntry = {
      id: "request-1",
      fromUser: {
        id: "friend-1",
        username: "nami",
        name: "Nami",
        image: null,
      },
    };
    const staleFriends = deferred<{ data: FriendEntry[] }>();
    const staleRequests = deferred<{
      data: { incoming: FriendRequestEntry[] };
    }>();
    let friendsFetches = 0;
    let requestFetches = 0;

    mocks.apiGet.mockImplementation((url: string) => {
      if (url === "/api/friends") {
        friendsFetches += 1;
        return friendsFetches === 1
          ? staleFriends.promise
          : Promise.resolve({ data: [] });
      }
      requestFetches += 1;
      return requestFetches === 1
        ? staleRequests.promise
        : Promise.resolve({ data: { incoming: [] } });
    });
    mocks.apiPut.mockResolvedValue({});

    const { fetchFriendsData, handleFriendRequest } = captureSidebarCallbacks();
    const staleFetch = fetchFriendsData();

    await handleFriendRequest(request.id, "decline");
    await Promise.resolve();
    staleFriends.resolve({ data: [] });
    staleRequests.resolve({ data: { incoming: [request] } });
    await staleFetch;

    expect(applyStateUpdates([request], mocks.setterCalls[1] ?? [])).toEqual(
      []
    );
  });
});
