import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("memoizes the result for ten minutes", async () => {
    setFindFirstMock.mockResolvedValue({ setLabel: "OP16" });
    const { getLatestBoosterSet } = await import("./latest-set");

    await getLatestBoosterSet();
    await getLatestBoosterSet();

    expect(setFindFirstMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no booster rows exist", null],
    ["the lookup errors", new Error("database unavailable")],
  ])("falls back to Browse All when %s", async (_description, result) => {
    if (result instanceof Error) {
      setFindFirstMock.mockRejectedValue(result);
    } else {
      setFindFirstMock.mockResolvedValue(result);
    }
    const { getLatestBoosterSet } = await import("./latest-set");

    await expect(getLatestBoosterSet()).resolves.toBe("");
  });
});
