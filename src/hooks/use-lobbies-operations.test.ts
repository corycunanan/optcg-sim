import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  cleanups: [] as Array<() => void>,
}));

vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === "function") mocks.cleanups.push(cleanup);
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => [initial, vi.fn()],
  };
});

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
}));

import { useLobbiesOperations } from "./use-lobbies-operations";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.apiPost.mockReset();
  mocks.cleanups = [];
});

describe("useLobbiesOperations", () => {
  it("ignores an older create completion after a newer request succeeds", async () => {
    const first = deferred<{
      data: { lobbyId: string; joinCode: string };
    }>();
    const second = deferred<{
      data: { lobbyId: string; joinCode: string };
    }>();
    mocks.apiPost
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onCreated = vi.fn();
    const operations = useLobbiesOperations({
      onCreated,
      onJoined: vi.fn(),
      onConceded: vi.fn(),
    });

    const firstExecution = operations.createLobby();
    const secondExecution = operations.createLobby();

    second.resolve({ data: { lobbyId: "newer", joinCode: "NEW123" } });
    await secondExecution;
    first.resolve({ data: { lobbyId: "older", joinCode: "OLD123" } });
    await firstExecution;

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith("newer");
  });

  it("does not navigate when join completes after unmount", async () => {
    const pending = deferred<{ data: { lobbyId: string } }>();
    mocks.apiPost.mockReturnValueOnce(pending.promise);
    const onJoined = vi.fn();
    const operations = useLobbiesOperations({
      onCreated: vi.fn(),
      onJoined,
      onConceded: vi.fn(),
    });

    const execution = operations.joinLobby("ABCD");
    for (const cleanup of mocks.cleanups) cleanup();
    pending.resolve({ data: { lobbyId: "late-lobby" } });
    await execution;

    expect(onJoined).not.toHaveBeenCalled();
  });

  it("commits concede state only for a current mounted execution", async () => {
    mocks.apiPost.mockResolvedValueOnce({});
    const onConceded = vi.fn();
    const operations = useLobbiesOperations({
      onCreated: vi.fn(),
      onJoined: vi.fn(),
      onConceded,
    });

    await operations.concedeGame("game-1");

    expect(onConceded).toHaveBeenCalledTimes(1);
  });
});
