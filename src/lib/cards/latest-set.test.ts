import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setFindFirstMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    cardSet: {
      findFirst: (...args: unknown[]) => setFindFirstMock(...args),
    },
  },
}));

beforeEach(() => {
  setFindFirstMock.mockReset();
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getLatestBoosterSet", () => {
  it("selects the highest fixed-width booster pack id", async () => {
    setFindFirstMock.mockResolvedValue({ setLabel: "OP16" });
    const { getLatestBoosterSet } = await import("./latest-set");

    await expect(getLatestBoosterSet()).resolves.toBe("OP16");
    expect(setFindFirstMock).toHaveBeenCalledWith({
      where: { packId: { startsWith: "5691" } },
      orderBy: { packId: "desc" },
      select: { setLabel: true },
    });
  });

  it("does not re-query within the ten-minute cache TTL", async () => {
    setFindFirstMock.mockResolvedValue({ setLabel: "OP16" });
    const { getLatestBoosterSet } = await import("./latest-set");

    await getLatestBoosterSet();
    vi.advanceTimersByTime(10 * 60 * 1000 - 1);
    await getLatestBoosterSet();

    expect(setFindFirstMock).toHaveBeenCalledTimes(1);
  });

  it("re-queries after the ten-minute cache TTL expires", async () => {
    setFindFirstMock
      .mockResolvedValueOnce({ setLabel: "OP16" })
      .mockResolvedValueOnce({ setLabel: "OP17" });
    const { getLatestBoosterSet } = await import("./latest-set");

    await expect(getLatestBoosterSet()).resolves.toBe("OP16");
    vi.advanceTimersByTime(10 * 60 * 1000);
    await expect(getLatestBoosterSet()).resolves.toBe("OP17");

    expect(setFindFirstMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent lookups", async () => {
    let resolveLookup: ((value: { setLabel: string }) => void) | undefined;
    setFindFirstMock.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );
    const { getLatestBoosterSet } = await import("./latest-set");

    const first = getLatestBoosterSet();
    const second = getLatestBoosterSet();
    resolveLookup?.({ setLabel: "OP16" });

    await expect(Promise.all([first, second])).resolves.toEqual(["OP16", "OP16"]);
    expect(setFindFirstMock).toHaveBeenCalledTimes(1);
  });

  it("caches an empty result for ten minutes", async () => {
    setFindFirstMock.mockResolvedValue(null);
    const { getLatestBoosterSet } = await import("./latest-set");

    await expect(getLatestBoosterSet()).resolves.toBe("");
    vi.advanceTimersByTime(10 * 60 * 1000 - 1);
    await expect(getLatestBoosterSet()).resolves.toBe("");
    expect(setFindFirstMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await expect(getLatestBoosterSet()).resolves.toBe("");
    expect(setFindFirstMock).toHaveBeenCalledTimes(2);
  });

  it("caches an error fallback for thirty seconds", async () => {
    setFindFirstMock.mockRejectedValue(new Error("database unavailable"));
    const { getLatestBoosterSet } = await import("./latest-set");

    await expect(getLatestBoosterSet()).resolves.toBe("");
    vi.advanceTimersByTime(30 * 1000 - 1);
    await expect(getLatestBoosterSet()).resolves.toBe("");
    expect(setFindFirstMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await expect(getLatestBoosterSet()).resolves.toBe("");
    expect(setFindFirstMock).toHaveBeenCalledTimes(2);
  });
});
