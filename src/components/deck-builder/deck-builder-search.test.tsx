// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/lib/api-client";
import { DeckBuilderSearch } from "./deck-builder-search";

vi.mock("@/lib/api-client", () => ({ apiGet: vi.fn() }));
vi.mock("./deck-builder-card-modal", () => ({
  DeckBuilderCardModal: ({ cardId }: { cardId: string }) => (
    <div>Inspecting {cardId}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const zoro = {
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
};

function renderSearch() {
  vi.mocked(apiGet).mockResolvedValue({
    data: [zoro],
    pagination: { total: 1, page: 1, limit: 40, totalPages: 1 },
  });

  return render(
    <DeckBuilderSearch
      onAddCard={vi.fn()}
      onRemoveCard={vi.fn()}
      onSetArtVariant={vi.fn()}
      deckCards={new Map()}
      leader={null}
    />
  );
}

describe("DeckBuilderSearch card tooltip", () => {
  it("renders CardInfoPanel content when the card image is hovered", async () => {
    renderSearch();
    const user = userEvent.setup();
    const image = await screen.findByAltText("Roronoa Zoro");

    await user.hover(image);

    let panel: HTMLElement | null = null;
    await waitFor(() => {
      panel = document.querySelector<HTMLElement>("[data-tier5-surface]");
      expect(panel).not.toBeNull();
    });

    expect(within(panel!).getByText("Character · OP01-025")).toBeTruthy();
    expect(
      within(panel!).getByText("Red · Supernovas / Straw Hat Crew · Slash")
    ).toBeTruthy();
    const timingChip = within(panel!).getByText("On Play");
    expect(timingChip.dataset.effectNotation).toBe("timing");
    expect(timingChip.className).toContain("bg-effect-timing");
    expect(timingChip.parentElement?.textContent).toBe("On Play Draw 1 card.");
  });

  it("keeps the whole tile clickable for inspection", async () => {
    renderSearch();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Inspect Roronoa Zoro" })
    );

    expect(screen.getByText("Inspecting OP01-025")).toBeTruthy();
  });

  it("opens the tooltip when keyboard focus reaches the tile", async () => {
    renderSearch();
    const tile = await screen.findByRole("button", {
      name: "Inspect Roronoa Zoro",
    });

    tile.focus();

    await waitFor(() => {
      expect(tile.getAttribute("aria-describedby")).toBeTruthy();
      expect(
        document.querySelector<HTMLElement>("[data-tier5-surface]")
      ).not.toBeNull();
    });
  });
});

describe("DeckBuilderSearch tile elevation", () => {
  it("rests at shadow-sm and hovers to shadow-md", async () => {
    renderSearch();
    const tile = await screen.findByRole("button", {
      name: "Inspect Roronoa Zoro",
    });

    expect(tile.className).toContain("shadow-sm");
    expect(tile.className).toContain("hover:shadow-md");
  });

  it("does not stack an inner image zoom on the altitude step", async () => {
    renderSearch();
    await screen.findByRole("button", { name: "Inspect Roronoa Zoro" });

    // ELEVATION-LANGUAGE §Anti-stacking: the hover moves one tier, and a
    // zoom inside the frame is a second register on the same interaction.
    const art = screen.getByAltText("Roronoa Zoro");
    expect(art.className).not.toContain("group-hover:scale");
  });
});
