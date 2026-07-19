import { beforeEach, describe, expect, it, vi } from "vitest";
import { CardBrowseRateLimitFallback } from "./rate-limit-fallback";

const headersMock = vi.fn();
const rateLimitMock = vi.fn();
const browserDataMock = vi.fn();

function CardBrowserMock() {
  return null;
}

function SetBrowserMock() {
  return null;
}

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/lib/cards/public-rate-limit", () => ({
  checkPublicCardBrowseRateLimit: rateLimitMock,
}));
vi.mock("@/lib/cards/browser", () => ({
  getCardBrowserData: browserDataMock,
}));
vi.mock("@/components/cards/card-browser", () => ({
  CardBrowser: CardBrowserMock,
}));
vi.mock("@/components/cards/set-browser", () => ({
  SetBrowser: SetBrowserMock,
}));

const { default: CardsPage } = await import("./page");
const { default: SetsPage } = await import("../sets/page");

beforeEach(() => {
  headersMock.mockReset();
  rateLimitMock.mockReset();
  browserDataMock.mockReset();

  headersMock.mockResolvedValue(new Headers());
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 59 });
  browserDataMock.mockResolvedValue({
    initialCards: [],
    total: 0,
    page: 1,
    totalPages: 0,
    sets: [],
    currentFilters: {
      q: "",
      color: "",
      type: "",
      set: "",
      block: "",
      originOnly: "",
    },
  });
});

describe("public card browse rate limiting", () => {
  it("renders a graceful state without querying cards when limited", async () => {
    rateLimitMock.mockResolvedValue({ limited: true, remaining: 0 });

    const result = await CardsPage({
      searchParams: Promise.resolve({ q: "luffy" }),
    });

    expect(browserDataMock).not.toHaveBeenCalled();
    expect(result.props.children.type).toBe(CardBrowseRateLimitFallback);
  });

  it("preserves normal card browsing after an allowed check", async () => {
    const searchParams = { q: "luffy", page: "2" };

    const result = await CardsPage({
      searchParams: Promise.resolve(searchParams),
    });

    expect(rateLimitMock).toHaveBeenCalledWith(expect.any(Headers));
    expect(browserDataMock).toHaveBeenCalledWith(searchParams);
    expect(result.props.children.type).toBe(CardBrowserMock);
  });

  it("covers the public sets query with the same graceful state", async () => {
    rateLimitMock.mockResolvedValue({ limited: true, remaining: 0 });

    const result = await SetsPage();

    expect(result.type).toBe(CardBrowseRateLimitFallback);
    expect(result.type).not.toBe(SetBrowserMock);
  });
});
