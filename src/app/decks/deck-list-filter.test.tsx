// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeckListItem } from "./deck-list";

vi.mock("./deck-list", () => ({
  DeckList: ({ decks }: { decks: DeckListItem[] }) => (
    <ul>
      {decks.map((deck) => (
        <li key={deck.id}>{deck.name}</li>
      ))}
    </ul>
  ),
}));

import { DeckListFilter } from "./deck-list-filter";

function deck(id: string, name: string, colors: string[]): DeckListItem {
  return {
    id,
    name,
    colors,
    totalCards: 50,
    updatedAtIso: "2026-08-08T12:00:00.000Z",
    updatedAtLabel: "Aug 8, 2026",
    leader: {
      id: `${id}-leader`,
      name: `${name} Leader`,
      type: "Leader",
      imageUrl: "https://cdn.example/leader.png",
      colors,
      cost: null,
      power: 5000,
      counter: null,
      life: 5,
      traits: [],
      attribute: [],
      effectText: null,
      triggerText: null,
    },
  };
}

const DECKS = [
  deck("red", "Red Deck", ["Red"]),
  deck("blue", "Blue Deck", ["Blue"]),
  deck("mixed", "Mixed Deck", ["Red", "Green"]),
];

afterEach(cleanup);

describe("DeckListFilter", () => {
  it("commits color filters on Apply and combines selections with OR semantics", async () => {
    const user = userEvent.setup();
    render(<DeckListFilter decks={DECKS} />);

    await user.click(screen.getByRole("button", { name: "Filter" }));
    const blue = screen.getByRole("button", { name: "Blue" });
    const red = screen.getByRole("button", { name: "Red" });
    expect(blue.getAttribute("aria-pressed")).toBe("false");

    await user.click(blue);
    expect(blue.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Red Deck")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Apply Filters" }));
    expect(screen.getByText("Blue Deck")).toBeTruthy();
    expect(screen.queryByText("Red Deck")).toBeNull();
    expect(screen.queryByText("Mixed Deck")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Filter — 1 applied" })
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Filter — 1 applied" })
    );
    await user.click(screen.getByRole("button", { name: "Red" }));
    await user.click(screen.getByRole("button", { name: "Apply Filters" }));
    expect(screen.getByText("Blue Deck")).toBeTruthy();
    expect(screen.getByText("Red Deck")).toBeTruthy();
    expect(screen.getByText("Mixed Deck")).toBeTruthy();
  });

  it("discards draft changes on Cancel", async () => {
    const user = userEvent.setup();
    render(<DeckListFilter decks={DECKS} />);

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("button", { name: "Red" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Blue Deck")).toBeTruthy();
    expect(screen.getByText("Red Deck")).toBeTruthy();
    expect(screen.getByText("Mixed Deck")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    expect(
      screen.getByRole("button", { name: "Red" }).getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("shows a filter-specific empty state and clears the selection", async () => {
    const user = userEvent.setup();
    render(<DeckListFilter decks={DECKS} />);

    expect(screen.queryByText("No decks match")).toBeNull();
    expect(screen.queryByText("No decks yet")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("button", { name: "Yellow" }));
    await user.click(screen.getByRole("button", { name: "Apply Filters" }));
    expect(screen.getByText("No decks match")).toBeTruthy();
    expect(screen.queryByText("No decks yet")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.queryByText("No decks match")).toBeNull();
    expect(screen.getByText("Red Deck")).toBeTruthy();
    expect(screen.getByText("Blue Deck")).toBeTruthy();
    expect(screen.getByText("Mixed Deck")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter" })).toBeTruthy();
  });

  it("renders color options as the shared color chip, filled once selected", async () => {
    const user = userEvent.setup();
    render(<DeckListFilter decks={DECKS} />);

    await user.click(screen.getByRole("button", { name: "Filter" }));
    const red = screen.getByRole("button", { name: "Red" });
    expect(red.getAttribute("aria-pressed")).toBe("false");
    expect(red.className).toContain("bg-surface-2");
    expect(red.className).not.toContain("bg-card-red");

    await user.click(red);
    expect(red.getAttribute("aria-pressed")).toBe("true");
    expect(red.className).toContain("bg-card-red");
    expect(red.className).toContain("border-card-red-border");
  });
});
