import { beforeEach, describe, expect, it, vi } from "vitest";
import { CARD_BROWSER_SELECT } from "./card-select";

const cardFindManyMock = vi.fn();
const cardCountMock = vi.fn();
const setFindManyMock = vi.fn();
const setFindFirstMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      findMany: (...args: unknown[]) => cardFindManyMock(...args),
      count: (...args: unknown[]) => cardCountMock(...args),
    },
    cardSet: {
      findMany: (...args: unknown[]) => setFindManyMock(...args),
      findFirst: (...args: unknown[]) => setFindFirstMock(...args),
    },
  },
}));

const { getCardBrowserData } = await import("./browser");

beforeEach(() => {
  cardFindManyMock.mockReset();
  cardCountMock.mockReset();
  setFindManyMock.mockReset();
  setFindFirstMock.mockReset();

  cardFindManyMock.mockResolvedValue([]);
  cardCountMock.mockResolvedValue(45);
  setFindManyMock.mockResolvedValue([]);
  setFindFirstMock.mockResolvedValue({ setLabel: "OP16" });
});

describe("getCardBrowserData", () => {
  it("defaults an unfiltered browser to the latest booster set", async () => {
    const data = await getCardBrowserData({});

    expect(data.currentFilters.set).toBe("OP16");
    expect(cardCountMock).toHaveBeenCalledWith({
      where: { cardSets: { some: { setLabel: "OP16" } } },
    });
  });

  it.each(["0", "-1", "abc", "1.5"])(
    "defaults invalid page %s to the first page",
    async (requestedPage) => {
      const data = await getCardBrowserData({
        page: requestedPage,
        set: "all",
      });

      expect(data.page).toBe(1);
      expect(cardFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 })
      );
    }
  );

  it("clamps an absurd page to the last page before loading cards", async () => {
    const data = await getCardBrowserData({
      page: "1000000000",
      set: "all",
    });

    expect(data.page).toBe(3);
    expect(data.totalPages).toBe(3);
    expect(cardFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 40, take: 20 })
    );
    expect(cardCountMock.mock.invocationCallOrder[0]).toBeLessThan(
      cardFindManyMock.mock.invocationCallOrder[0]
    );
  });

  it("uses an explicit public projection without filtering the All Sets view", async () => {
    const data = await getCardBrowserData({ set: "all" });
    const query = cardFindManyMock.mock.calls[0]?.[0];

    expect(data.currentFilters.set).toBe("");
    expect(cardCountMock).toHaveBeenCalledWith({ where: {} });
    expect(query).toEqual(
      expect.objectContaining({
        where: {},
        select: CARD_BROWSER_SELECT,
      })
    );
    expect(query).not.toHaveProperty("include");
    expect(query.select).not.toHaveProperty("effectSchema");
  });
});
