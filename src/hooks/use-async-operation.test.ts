import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setters: [] as ReturnType<typeof vi.fn>[],
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
    useState: (initial: unknown) => {
      const setter = vi.fn();
      mocks.setters.push(setter);
      return [initial, setter];
    },
  };
});

import { useAsyncOperation } from "./use-async-operation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.setters = [];
  mocks.cleanups = [];
});

describe("useAsyncOperation", () => {
  it("keeps the newer result when overlapping submissions finish out of order", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const operation = vi
      .fn<(value: string) => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { execute } = useAsyncOperation(operation);

    const firstExecution = execute("first");
    const secondExecution = execute("second");

    second.resolve("second result");
    await expect(secondExecution).resolves.toBe("second result");
    first.resolve("first result");
    await expect(firstExecution).resolves.toBe("first result");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(mocks.setters[0]).toHaveBeenLastCalledWith({
      status: "success",
      data: "second result",
      error: null,
    });
  });

  it("records and rethrows a thrown operation error", async () => {
    const error = new Error("save failed");
    const { execute } = useAsyncOperation(async () => {
      throw error;
    });

    await expect(execute()).rejects.toBe(error);

    expect(mocks.setters[0]).toHaveBeenLastCalledWith({
      status: "error",
      data: null,
      error,
    });
  });

  it("invalidates an in-flight completion when reset", async () => {
    const pending = deferred<string>();
    const { execute, reset } = useAsyncOperation(() => pending.promise);

    const execution = execute();
    reset();
    pending.resolve("stale result");
    await execution;

    expect(mocks.setters[0]).toHaveBeenLastCalledWith({
      status: "idle",
      data: null,
      error: null,
    });
  });

  it("does not update state after unmount", async () => {
    const pending = deferred<string>();
    const { execute } = useAsyncOperation(() => pending.promise);

    const execution = execute();
    const callsBeforeUnmount = mocks.setters[0]?.mock.calls.length;
    for (const cleanup of mocks.cleanups) cleanup();
    pending.resolve("late result");
    await execution;

    expect(mocks.setters[0]).toHaveBeenCalledTimes(callsBeforeUnmount ?? 0);
  });
});
