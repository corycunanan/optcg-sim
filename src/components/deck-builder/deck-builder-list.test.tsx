// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { DeckCardEntry, DeckLeaderEntry } from "@/lib/deck-builder/state";
import { DeckBuilderList } from "./deck-builder-list";

afterEach(cleanup);

const leader: DeckLeaderEntry = {
  id: "OP01-001",
  name: "Monkey.D.Luffy",
  color: ["Red"],
  type: "Leader",
  life: 5,
  power: 5000,
  imageUrl: "/leader.png",
  traits: ["Supernovas", "Straw Hat Crew"],
  effectText: "[Activate: Main] Give up to 1 rested DON!! card to a Character.",
  attribute: ["Strike"],
};

const zoro: DeckCardEntry = {
  cardId: "OP01-025",
  quantity: 4,
  selectedArtUrl: null,
  card: {
    id: "OP01-025",
    name: "Roronoa Zoro",
    color: ["Red"],
    type: "Character",
    cost: 3,
    power: 5000,
    counter: 1000,
    life: null,
    imageUrl: "/card.png",
    banStatus: "LEGAL",
    blockNumber: 1,
    traits: ["Supernovas", "Straw Hat Crew"],
    attribute: ["Slash"],
    effectText: "[On Play] Draw 1 card.",
    triggerText: null,
    rarity: "SR",
    originSet: "OP01",
  },
};

const noop = () => {};

function renderList(props?: {
  leader?: DeckLeaderEntry | null;
  cards?: DeckCardEntry[];
}) {
  return render(
    <DeckBuilderList
      cards={props?.cards ?? [zoro]}
      leader={props?.leader === undefined ? leader : props.leader}
      leaderArtUrl={null}
      onIncrement={noop}
      onDecrement={noop}
      onSetArtVariant={noop}
      onAddCard={noop}
      onRemoveLeader={noop}
      onSetLeaderArt={noop}
      totalCards={4}
    />
  );
}

/** Opens the hover tooltip for a stack and returns its Tier-5 panel. */
async function openTooltip(cardName: string): Promise<HTMLElement> {
  const user = userEvent.setup();
  await user.hover(screen.getAllByAltText(cardName)[0]);

  let panel: HTMLElement | null = null;
  await waitFor(() => {
    panel = document.querySelector<HTMLElement>("[data-tier5-surface]");
    expect(panel).not.toBeNull();
  });

  return panel!;
}

describe("DeckBuilderList card tooltip", () => {
  it("passes colour, traits and attribute from the card entry into the panel", async () => {
    renderList();

    const panel = await openTooltip("Roronoa Zoro");

    // The Frame 82 descriptor row must survive the CardGroup mapping — a
    // regression here silently drops colour and attribute at the call site
    // while every direct-props test on CardInfoPanel keeps passing.
    expect(
      within(panel).getByText("Red · Supernovas / Straw Hat Crew · Slash")
    ).toBeTruthy();
  });

  it("passes the leader's colour and attribute through too", async () => {
    renderList({ cards: [] });

    const panel = await openTooltip("Monkey.D.Luffy");

    expect(
      within(panel).getByText("Red · Supernovas / Straw Hat Crew · Strike")
    ).toBeTruthy();
  });

  it("renders the card's stats and effect text on a Tier-5 surface", async () => {
    renderList();

    const panel = await openTooltip("Roronoa Zoro");

    const classes = panel.className.split(/\s+/);
    expect(classes).toContain("bg-surface-info");
    expect(classes).toContain("edge-info");
    expect(classes).toContain("rounded-md");
    expect(classes).toContain("shadow-none");

    expect(within(panel).getByText("Character · OP01-025")).toBeTruthy();
    expect(within(panel).getByText("Cost").nextElementSibling?.textContent).toBe(
      "3"
    );
    expect(
      within(panel).getByText("Power").nextElementSibling?.textContent
    ).toBe("5,000");
    expect(
      within(panel).getByText("Counter").nextElementSibling?.textContent
    ).toBe("+1000");
    expect(within(panel).getByText("[On Play] Draw 1 card.")).toBeTruthy();

    // Numerals are white — no per-stat hue competing with card art.
    expect(panel.innerHTML).not.toContain("text-gold-600");
    expect(panel.innerHTML).not.toContain("text-green-600");
    expect(panel.innerHTML).not.toContain("text-purple-600");
  });

  it("swaps cost for life on the leader and drops the counter stat", async () => {
    renderList({ cards: [] });

    const panel = await openTooltip("Monkey.D.Luffy");

    expect(within(panel).getByText("Life").nextElementSibling?.textContent).toBe(
      "5"
    );
    expect(within(panel).queryByText("Cost")).toBeNull();
    expect(within(panel).queryByText("Counter")).toBeNull();
  });
});
