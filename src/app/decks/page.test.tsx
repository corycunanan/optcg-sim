// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const deckFindManyMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: { deck: { findMany: (...args: unknown[]) => deckFindManyMock(...args) } },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

const DecksPage = (await import("./page")).default;

const LEADER = {
  id: "OP01-001",
  name: "Roronoa Zoro",
  type: "Leader",
  color: ["Red"],
  cost: null,
  power: 5000,
  counter: null,
  life: 5,
  traits: ["Supernovas"],
  attribute: ["Slash"],
  effectText: "Effect body",
  triggerText: null,
  imageUrl: "https://cdn.example/base/OP01-001.png",
};

function deckRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "deck-1",
    name: "Straw Hat Aggro",
    leaderId: "OP01-001",
    leaderArtUrl: null,
    updatedAt: new Date("2026-04-29T12:00:00.000Z"),
    cards: [
      { quantity: 4, card: { color: ["Red"] } },
      { quantity: 3, card: { color: ["Green"] } },
    ],
    leader: LEADER,
    ...overrides,
  };
}

/** Renders the async server component's returned tree. */
async function renderPage() {
  render(await DecksPage());
}

beforeEach(() => {
  authMock.mockReset();
  deckFindManyMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "user-1" } });
  deckFindManyMock.mockResolvedValue([deckRecord()]);
});

afterEach(cleanup);

describe("DecksPage", () => {
  it("loads the leader through the Deck.leader relation in one query", async () => {
    await renderPage();

    expect(deckFindManyMock).toHaveBeenCalledTimes(1);
    const args = deckFindManyMock.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "user-1" });
    // The tooltip needs the leader's rules text and stats, so they come down
    // with the deck rather than through a second card.findMany.
    expect(args.include.leader.select).toMatchObject({
      life: true,
      power: true,
      effectText: true,
      triggerText: true,
      type: true,
      color: true,
    });
  });

  it("renders the leader's chosen art variant over the base printing", async () => {
    deckFindManyMock.mockResolvedValue([
      deckRecord({ leaderArtUrl: "https://cdn.example/variant/OP01-001_p2.png" }),
    ]);

    await renderPage();

    expect(screen.getByRole("listitem").querySelector("img")!.src).toBe(
      "https://cdn.example/variant/OP01-001_p2.png"
    );
  });

  it("falls back to the base printing when no variant is selected", async () => {
    await renderPage();

    expect(screen.getByRole("listitem").querySelector("img")!.src).toBe(
      "https://cdn.example/base/OP01-001.png"
    );
  });

  it("counts the main deck and shows a leader-inclusive colour identity", async () => {
    await renderPage();
    const listItem = screen.getByRole("listitem");

    expect(within(listItem).getByText("7/50")).toBeTruthy();
    expect(
      [
        ...within(listItem)
          .getByRole("group", { name: "Deck colors" })
          .querySelectorAll('[role="img"]'),
      ].map((node) => node.getAttribute("aria-label"))
    ).toEqual(["Red deck color", "Green deck color"]);
  });

  it("shows the leader's colour on a deck with no main-deck cards yet", async () => {
    deckFindManyMock.mockResolvedValue([deckRecord({ cards: [] })]);

    await renderPage();

    expect(
      screen
        .getByRole("group", { name: "Deck colors" })
        .querySelectorAll('[role="img"]')
    ).toHaveLength(1);
    expect(screen.getByText("0/50")).toBeTruthy();
  });

  it("keeps the empty state when the user has no decks", async () => {
    deckFindManyMock.mockResolvedValue([]);

    await renderPage();

    expect(screen.getByText("No decks yet")).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("redirects signed-out visitors to login", async () => {
    authMock.mockResolvedValue(null);

    await expect(DecksPage()).rejects.toThrow("redirect:/login");
  });
});
