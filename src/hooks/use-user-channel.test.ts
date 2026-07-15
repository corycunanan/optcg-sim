import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus } from "@/types/realtime";

const mocks = vi.hoisted(() => ({
  authedCalls: [] as Array<{
    url: string | null;
    getToken: () => Promise<string>;
    onMessage: (msg: unknown) => void;
  }>,
  close: vi.fn(),
  send: vi.fn(),
  retry: vi.fn(),
  connectionStatus: "connecting" as ConnectionStatus,
  session: { data: null as { user: { id: string } } | null, status: "loading" as string },
  fetch: vi.fn(),
}));

// Shallow-render mock pattern (mirrors src/hooks/use-game-session.test.tsx).
vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useCallback: (cb: unknown) => cb,
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => [
      typeof initial === "function" ? (initial as () => unknown)() : initial,
      vi.fn(),
    ],
  };
});

vi.mock("next-auth/react", () => ({
  useSession: () => mocks.session,
}));

vi.mock("@/hooks/use-authed-websocket", async (importActual) => {
  const actual = await importActual<typeof import("@/hooks/use-authed-websocket")>();
  return {
    ...actual,
    useAuthedWebSocket: (opts: {
      url: string | null;
      getToken: () => Promise<string>;
      onMessage: (msg: unknown) => void;
    }) => {
      mocks.authedCalls.push(opts);
      return {
        connectionStatus: mocks.connectionStatus,
        lastError: null,
        send: mocks.send,
        retry: mocks.retry,
        close: mocks.close,
      };
    },
  };
});

const originalFetch = globalThis.fetch;
const originalWorkerUrl = process.env.NEXT_PUBLIC_GAME_WORKER_URL;

beforeEach(() => {
  mocks.authedCalls.length = 0;
  mocks.close.mockReset();
  mocks.send.mockReset();
  mocks.retry.mockReset();
  mocks.connectionStatus = "connecting";
  mocks.session = { data: null, status: "loading" };
  mocks.fetch.mockReset();
  globalThis.fetch = mocks.fetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWorkerUrl === undefined) {
    delete process.env.NEXT_PUBLIC_GAME_WORKER_URL;
  } else {
    process.env.NEXT_PUBLIC_GAME_WORKER_URL = originalWorkerUrl;
  }
});

async function importHook() {
  const mod = await import("./use-user-channel");
  return mod.useUserChannel;
}

describe("useUserChannel", () => {
  it("does not open a socket when there is no session", async () => {
    process.env.NEXT_PUBLIC_GAME_WORKER_URL = "https://worker.example";
    mocks.session = { data: null, status: "unauthenticated" };

    const useUserChannel = await importHook();
    const result = useUserChannel();

    expect(mocks.authedCalls).toHaveLength(1);
    expect(mocks.authedCalls[0].url).toBeNull();
    expect(result.connectionStatus).toBe("disconnected");
  });

  it("builds the user-channel URL once authenticated", async () => {
    process.env.NEXT_PUBLIC_GAME_WORKER_URL = "https://worker.example";
    mocks.session = { data: { user: { id: "user-7" } }, status: "authenticated" };

    const useUserChannel = await importHook();
    useUserChannel();

    expect(mocks.authedCalls[0].url).toBe("https://worker.example/user/user-7/ws");
  });

  it("getToken POSTs /api/realtime/token and returns the token string", async () => {
    process.env.NEXT_PUBLIC_GAME_WORKER_URL = "https://worker.example";
    mocks.session = { data: { user: { id: "user-7" } }, status: "authenticated" };
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ data: { token: "tok-abc", expiresAt: 0 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const useUserChannel = await importHook();
    useUserChannel();

    const token = await mocks.authedCalls[0].getToken();
    expect(mocks.fetch).toHaveBeenCalledWith("/api/realtime/token", { method: "POST" });
    expect(token).toBe("tok-abc");
  });

  it("getToken throws when the mint endpoint returns an error", async () => {
    process.env.NEXT_PUBLIC_GAME_WORKER_URL = "https://worker.example";
    mocks.session = { data: { user: { id: "user-7" } }, status: "authenticated" };
    mocks.fetch.mockResolvedValue(new Response("nope", { status: 500 }));

    const useUserChannel = await importHook();
    useUserChannel();

    await expect(mocks.authedCalls[0].getToken()).rejects.toThrow(/500/);
  });

  it("subscribers receive only events of their type and unsubscribe cleans up", async () => {
    process.env.NEXT_PUBLIC_GAME_WORKER_URL = "https://worker.example";
    mocks.session = { data: { user: { id: "user-7" } }, status: "authenticated" };

    const useUserChannel = await importHook();
    const { subscribe } = useUserChannel();

    const onA = vi.fn();
    const onB = vi.fn();
    const offA = subscribe("feature:a" as never, onA as never);
    subscribe("feature:b" as never, onB as never);

    const dispatch = mocks.authedCalls[0].onMessage;
    dispatch({ type: "feature:a", value: 1 });
    dispatch({ type: "feature:b", value: 2 });

    expect(onA).toHaveBeenCalledTimes(1);
    expect(onA).toHaveBeenCalledWith({ type: "feature:a", value: 1 });
    expect(onB).toHaveBeenCalledTimes(1);

    offA();
    dispatch({ type: "feature:a", value: 3 });
    expect(onA).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed inbound messages without throwing", async () => {
    process.env.NEXT_PUBLIC_GAME_WORKER_URL = "https://worker.example";
    mocks.session = { data: { user: { id: "user-7" } }, status: "authenticated" };

    const useUserChannel = await importHook();
    useUserChannel();

    const dispatch = mocks.authedCalls[0].onMessage;
    expect(() => dispatch(null)).not.toThrow();
    expect(() => dispatch({})).not.toThrow();
    expect(() => dispatch({ type: 123 })).not.toThrow();
  });

  it("closes the socket when initialized unauthenticated", async () => {
    // Shallow-render mock pattern can't simulate a true authed→unauthed
    // rerender (that would need jsdom + testing-library); this test pins the
    // contract that an unauthenticated call to the hook triggers `close()`.
    process.env.NEXT_PUBLIC_GAME_WORKER_URL = "https://worker.example";
    mocks.session = { data: null, status: "unauthenticated" };

    const useUserChannel = await importHook();
    useUserChannel();

    expect(mocks.close).toHaveBeenCalled();
  });
});
