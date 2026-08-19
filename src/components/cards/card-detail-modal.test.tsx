// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDetail } from "@/lib/validators/cards";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: mocks.apiGet,
}));

// The gallery loads remote art and is covered by card-image-gallery.test.tsx;
// these cases assert the header's metadata row, not the image column.
vi.mock("./card-image-gallery", () => ({
  CardImageGallery: () => <div data-testid="card-image-gallery" />,
}));

import { CardDetailModal } from "./card-detail-modal";

afterEach(() => {
  cleanup();
  mocks.apiGet.mockReset();
});

const baseCard: CardDetail = {
  id: "OP16-006",
  name: "Shanks",
  color: ["Red"],
  type: "Character",
  cost: 9,
  power: 10000,
  counter: null,
  life: null,
  imageUrl: "https://cdn.test/op16-006.png",
  banStatus: "LEGAL",
  blockNumber: 4,
  traits: ["Red Hair Pirates"],
  attribute: ["Slash"],
  effectText: "[On Play] Draw a card.",
  triggerText: null,
  rarity: "Super Rare",
  originSet: "OP16",
  effectSchema: null,
  artVariants: [],
  cardSets: [],
};

async function renderModal(overrides: Partial<CardDetail> = {}) {
  mocks.apiGet.mockResolvedValue({ data: { ...baseCard, ...overrides } });
  const view = render(<CardDetailModal cardId={overrides.id ?? baseCard.id} onClose={vi.fn()} />);
  await screen.findByRole("heading", { name: overrides.name ?? baseCard.name });
  return view;
}

/** The header block that holds the card name and its badge row. */
function header() {
  return screen.getByRole("heading", { name: /shanks/i }).parentElement as HTMLElement;
}

describe("CardDetailModal header", () => {
  it("states id, type, color, and rarity as a badge row under the name", async () => {
    await renderModal();

    const badges = within(header()).getAllByText(
      (_, node) => node?.getAttribute("data-slot") === "badge"
    );
    expect(badges.map((b) => b.textContent)).toEqual([
      "OP16-006",
      "Character",
      "Super Rare",
    ]);
    expect(
      within(header()).getByRole("img", { name: "Red card color" })
    ).toBeTruthy();
  });

  it("orders the row id, type, color(s), rarity", async () => {
    await renderModal({ color: ["Red", "Green"] });

    const row = within(header()).getByRole("img", { name: "Red card color" })
      .parentElement as HTMLElement;
    const labels = Array.from(row.children).map((el) =>
      el.getAttribute("role") === "img"
        ? el.getAttribute("aria-label")
        : el.textContent
    );
    expect(labels).toEqual([
      "OP16-006",
      "Character",
      "Red card color",
      "Green card color",
      "Super Rare",
    ]);
  });

  it("normalizes badge height to the color chip's box", async () => {
    await renderModal();

    const badges = within(header()).getAllByText(
      (_, node) => node?.getAttribute("data-slot") === "badge"
    );
    for (const badge of badges) {
      expect(badge.className).toContain("py-1");
    }
  });

  it("drops the interpunct subtitle", async () => {
    await renderModal();

    expect(header().textContent).not.toContain("·");
  });

  it("appends the ban badge to the header row and leaves the body without a color row", async () => {
    await renderModal({ banStatus: "BANNED" });

    const banBadge = within(header()).getByText("BANNED");
    expect(banBadge.getAttribute("data-variant")).toBe("error");
    // Every color chip in the dialog now lives in the header row.
    expect(screen.getAllByRole("img", { name: /card color/ })).toHaveLength(1);
    expect(
      within(header()).getAllByRole("img", { name: /card color/ })
    ).toHaveLength(1);
  });

  it("stands in a two-line skeleton for the header while loading", async () => {
    mocks.apiGet.mockReturnValue(new Promise(() => {}));
    render(<CardDetailModal cardId="OP16-006" onClose={vi.fn()} />);

    expect(
      screen.getByRole("dialog", { name: "Loading card details" })
    ).toBeTruthy();

    let skeletons: NodeListOf<Element> = document.querySelectorAll(
      '[data-slot="skeleton"]'
    );
    await waitFor(() => {
      skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
    // The header's placeholder stands in for the name plus its badge row, so
    // resolving the card does not jump the dialog.
    const headerPlaceholder = skeletons[0].parentElement as HTMLElement;
    expect(
      headerPlaceholder.querySelectorAll('[data-slot="skeleton"]')
    ).toHaveLength(2);
  });
});
