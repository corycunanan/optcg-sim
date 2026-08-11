// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { DeckList, type DeckListItem } from "./deck-list";

// Radix's popper measures its trigger with a ResizeObserver, which jsdom does
// not implement. These cases assert the tooltip's *content*, not its
// placement, so a no-op observer is enough to let it mount.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

const DECK: DeckListItem = {
  id: "deck-1",
  name: "Straw Hat Aggro",
  totalCards: 47,
  colors: ["Red", "Green"],
  updatedAtIso: "2026-04-29T12:00:00.000Z",
  updatedAtLabel: "Apr 29, 2026",
  leader: {
    id: "OP01-001",
    name: "Roronoa Zoro",
    type: "Leader",
    imageUrl: "https://cdn.example/variant/OP01-001_p1.png",
    colors: ["Red"],
    cost: null,
    power: 5000,
    counter: null,
    life: 5,
    traits: ["Supernovas", "Straw Hat Crew"],
    attribute: ["Slash"],
    effectText: "[Activate: Main] Give up to 1 rested DON!! card to 1 Leader.",
    triggerText: null,
  },
};

function row() {
  return screen.getByRole("listitem");
}

/**
 * The Tier-5 panel the tooltip renders, wherever the portal put it.
 *
 * Radix mirrors tooltip content into a visually-hidden announcement node, so
 * the panel legitimately exists twice; both copies carry the same body and the
 * first is the visible one.
 */
async function openLeaderPanel(): Promise<HTMLElement> {
  await screen.findAllByText("Leader \u00b7 OP01-001");
  return document.querySelector<HTMLElement>("[data-tier5-surface]")!;
}

describe("DeckList row", () => {
  it("renders deck names as level-two headings without a level-one heading", () => {
    render(
      <DeckList
        decks={[DECK, { ...DECK, id: "deck-2", name: "Enel Control" }]}
      />
    );

    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual(expect.arrayContaining(["Straw Hat Aggro", "Enel Control"]));
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("renders the deck identity, metadata cluster, and delete action", () => {
    render(<DeckList decks={[DECK]} />);
    const listItem = row();

    const link = within(listItem).getByRole("link", {
      name: "Straw Hat Aggro",
    });
    expect(link.getAttribute("href")).toBe("/decks/deck-1");
    expect(within(listItem).getByText("Roronoa Zoro")).toBeTruthy();
    expect(within(listItem).getByText("47/50")).toBeTruthy();

    const updated = within(listItem).getByText("Apr 29, 2026");
    expect(updated.tagName).toBe("TIME");
    expect(updated.getAttribute("datetime")).toBe("2026-04-29T12:00:00.000Z");

    expect(
      within(listItem)
        .getByRole("group", { name: "Deck colors" })
        .querySelectorAll('[role="img"]')
    ).toHaveLength(2);
    expect(
      within(listItem).getByRole("button", {
        name: "More actions for Straw Hat Aggro",
      })
    ).toBeTruthy();
  });

  it("uses only text-base for the title and text-sm for row labels", () => {
    render(<DeckList decks={[DECK]} />);

    expect(
      within(row()).getByText("Straw Hat Aggro").parentElement!.className
    ).toContain("text-base");
    for (const label of ["Roronoa Zoro", "47/50", "Apr 29, 2026"]) {
      expect(within(row()).getByText(label).className).toContain("text-sm");
      expect(within(row()).getByText(label).className).not.toContain("text-xs");
    }
    for (const color of ["Red", "Green"]) {
      const indicator = within(row())
        .getByText(color)
        .closest<HTMLElement>('[role="img"]')!;
      expect(indicator.className).toContain("text-sm");
      expect(indicator.className).not.toContain("text-xs");
    }
  });

  it("keeps the ghost kebab visible at rest without a size override", () => {
    render(<DeckList decks={[DECK]} />);

    const kebab = within(row()).getByRole("button", {
      name: "More actions for Straw Hat Aggro",
    });
    expect(kebab.getAttribute("data-variant")).toBe("ghost");
    expect(kebab.className).not.toContain("opacity-0");
    expect(kebab.className).not.toContain("size-12");
  });

  it("renders the leader's selected art variant, not the base printing", () => {
    render(<DeckList decks={[DECK]} />);

    const art = row().querySelector("img")!;
    expect(art.getAttribute("src")).toBe(
      "https://cdn.example/variant/OP01-001_p1.png"
    );
    // Decorative: the trigger button carries the accessible name for the pair.
    expect(art.getAttribute("alt")).toBe("");
    // Figure-ground rule: the card silhouette keeps its radius.
    expect(art.className).toContain("rounded");
  });

  it("wraps the row in a borderless chamfered surface one step above the page", () => {
    render(<DeckList decks={[DECK]} />);

    const frame = row().querySelector<HTMLElement>(
      '[data-slot="chamfer-frame"]'
    )!;
    expect(frame.dataset.edge).toBe("none");
    expect(frame.dataset.corners).toBe("outer");
    expect(frame.dataset.cut).toBe("lg");
    // `interactive` is what draws the chamfered focus ring for the row.
    expect(frame.className).toContain("chamfer-focusable");
    expect(frame.querySelector('[data-slot="chamfer-focus"]')).not.toBeNull();

    const surface = row().querySelector<HTMLElement>(
      '[data-slot="chamfer-surface"]'
    )!;
    expect(surface.className).toContain("bg-surface-1");
    expect(surface.className).toContain("group-hover:bg-surface-2");
  });

  it("lets the metadata cluster wrap so a narrow row never overflows", () => {
    render(<DeckList decks={[DECK]} />);

    // jsdom cannot measure, so the invariant is asserted at class level: the
    // cluster's intrinsic width (colour labels + count + date + a 48px kebab)
    // exceeds the space beside the thumbnail at 320px, so it has to wrap
    // internally rather than only move below the deck name.
    const cluster = row().querySelector<HTMLElement>(
      '[data-slot="deck-row-meta"]'
    )!;
    expect(cluster.className).toContain("flex-wrap");
    expect(cluster.className).toContain("min-w-0");
    // It only refuses to shrink once there is room beside the name.
    expect(cluster.className).toContain("sm:shrink-0");
    expect(cluster.className).not.toMatch(/(?:^|\s)shrink-0(?:\s|$)/);
  });

  it("shows exactly one focus indicator per focus stop", () => {
    render(<DeckList decks={[DECK]} />);

    // `ChamferFrame`'s `:has(:focus-visible)` support cannot be narrowed to
    // the stretched link from the consumer side, so the frame ring is the
    // single indicator and every stop suppresses its own.
    const frame = row().querySelector<HTMLElement>(
      '[data-slot="chamfer-frame"]'
    )!;
    expect(frame.className).toContain("chamfer-focusable");

    const thumbnail = within(row()).getByRole("button", {
      name: "Leader details for Roronoa Zoro",
    });
    expect(thumbnail.className).toContain("focus-visible:outline-none");
    expect(thumbnail.className).not.toMatch(/focus-visible:ring/);

    // The link would otherwise take the global `:focus-visible` outline from
    // globals.css on top of the frame ring.
    const link = within(row()).getByRole("link", { name: "Straw Hat Aggro" });
    expect(link.className).toContain("focus-visible:outline-none");
    expect(link.className).not.toMatch(/focus-visible:ring/);

    const kebab = within(row()).getByRole("button", {
      name: "More actions for Straw Hat Aggro",
    });
    expect(kebab.className).toContain("focus-visible:outline-none");
  });

  it("stretches the deck link over the whole row", () => {
    render(<DeckList decks={[DECK]} />);

    const link = within(row()).getByRole("link", { name: "Straw Hat Aggro" });
    expect(link.className).toContain("after:absolute");
    expect(link.className).toContain("after:inset-0");

    // The two nested controls have to sit above that overlay to stay clickable.
    for (const name of [
      "Leader details for Roronoa Zoro",
      "More actions for Straw Hat Aggro",
    ]) {
      expect(within(row()).getByRole("button", { name }).className).toContain(
        "z-10"
      );
    }
  });

  it("opens the leader card panel on hover", async () => {
    const user = userEvent.setup();
    render(<DeckList decks={[DECK]} />);

    await user.hover(
      screen.getByRole("button", { name: "Leader details for Roronoa Zoro" })
    );
    const panel = await openLeaderPanel();
    expect(within(panel).getByText("Roronoa Zoro")).toBeTruthy();
    expect(within(panel).getByText("Life")).toBeTruthy();
    expect(within(panel).getByText("5")).toBeTruthy();
    expect(within(panel).getByText("Power")).toBeTruthy();
    expect(within(panel).getByText("5,000")).toBeTruthy();
    expect(
      within(panel).getByText(
        "[Activate: Main] Give up to 1 rested DON!! card to 1 Leader."
      )
    ).toBeTruthy();
  });

  it("opens the leader card panel from the keyboard", async () => {
    const user = userEvent.setup();
    render(<DeckList decks={[DECK]} />);

    // The thumbnail trigger is the row's first focus stop.
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Leader details for Roronoa Zoro" })
    );

    const panel = await openLeaderPanel();
    expect(within(panel).getByText("Roronoa Zoro")).toBeTruthy();
  });

  it("renders one row per deck", () => {
    render(
      <DeckList
        decks={[DECK, { ...DECK, id: "deck-2", name: "Enel Control" }]}
      />
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
