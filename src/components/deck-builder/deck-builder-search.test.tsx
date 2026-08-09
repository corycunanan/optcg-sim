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
  rarity: "SR",
  originSet: "OP01",
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
    expect(within(panel!).getByText("[On Play] Draw 1 card.")).toBeTruthy();
  });

  it("keeps the whole tile clickable for inspection", async () => {
    renderSearch();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Inspect Roronoa Zoro" })
    );

    expect(screen.getByText("Inspecting OP01-025")).toBeTruthy();
  });
});
