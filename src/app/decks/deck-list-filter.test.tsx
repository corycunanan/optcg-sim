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
  it("toggles color chips and combines selections with OR semantics", async () => {
    const user = userEvent.setup();
    render(<DeckListFilter decks={DECKS} />);

    const blue = screen.getByRole("button", { name: "Blue" });
    const red = screen.getByRole("button", { name: "Red" });
    expect(blue.getAttribute("aria-pressed")).toBe("false");

    await user.click(blue);
    expect(blue.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Blue Deck")).toBeTruthy();
    expect(screen.queryByText("Red Deck")).toBeNull();
    expect(screen.queryByText("Mixed Deck")).toBeNull();

    await user.click(red);
    expect(screen.getByText("Blue Deck")).toBeTruthy();
    expect(screen.getByText("Red Deck")).toBeTruthy();
    expect(screen.getByText("Mixed Deck")).toBeTruthy();

    await user.click(blue);
    await user.click(red);
    expect(screen.getByText("Blue Deck")).toBeTruthy();
    expect(screen.getByText("Red Deck")).toBeTruthy();
    expect(screen.getByText("Mixed Deck")).toBeTruthy();
  });

  it("shows a filter-specific empty state and clears the selection", async () => {
    const user = userEvent.setup();
    render(<DeckListFilter decks={DECKS} />);

    expect(screen.queryByText("No decks match")).toBeNull();
    expect(screen.queryByText("No decks yet")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Yellow" }));
    expect(screen.getByText("No decks match")).toBeTruthy();
    expect(screen.queryByText("No decks yet")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.queryByText("No decks match")).toBeNull();
    expect(screen.getByText("Red Deck")).toBeTruthy();
    expect(screen.getByText("Blue Deck")).toBeTruthy();
    expect(screen.getByText("Mixed Deck")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Yellow" })
        .getAttribute("aria-pressed")
    ).toBe("false");
  });
});
