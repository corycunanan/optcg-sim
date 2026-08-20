// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import DecksLoading from "./loading";
import { DeckList, type DeckListItem } from "./deck-list";

afterEach(() => cleanup());

const DECK: DeckListItem = {
  id: "deck-1",
  name: "Straw Hat Aggro",
  totalCards: 47,
  colors: ["Red"],
  updatedAtIso: "2026-04-29T12:00:00.000Z",
  updatedAtLabel: "Apr 29, 2026",
  leader: {
    id: "OP01-001",
    name: "Roronoa Zoro",
    type: "Leader",
    imageUrl: "https://cdn.example/OP01-001.png",
    colors: ["Red"],
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

/**
 * The resting cast step on a frame, ignoring any `hover:`-prefixed step — a
 * skeleton has nothing to hover, so only the rest state can be compared.
 */
function restingCastStep(frame: HTMLElement) {
  return frame.className
    .split(/\s+/)
    .find((token) => /^chamfer-shadow-/.test(token));
}

function rowFrames(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-slot="chamfer-frame"]')
  );
}

/**
 * The skeleton streams before the page does, so any header it hand-rolls is
 * visible on its own terms. It used to copy the old `bg-navy-900 py-12` band,
 * which meant the first paint was a navy banner that then swapped to the
 * bannerless header — the exact drift the shared primitive exists to prevent.
 */
describe("decks loading skeleton", () => {
  it("renders the shared header primitive rather than a copy of its classes", () => {
    const { container } = render(<DecksLoading />);

    const header = container.querySelector("header")!;

    expect(header).not.toBeNull();
    expect(header.className).toContain("max-w-7xl");
    expect(header.className).toContain("px-6");
    expect(header.className).toContain("pt-8");
    expect(header.className).not.toContain("bg-navy-900");
    expect(header.className).not.toContain("border-b");
    // Top padding only, so the well below owns the whole header→content gap.
    expect(header.className).not.toMatch(/(?:^|\s)p[by]-/);
  });

  it("pairs the header with a well whose top padding matches it", () => {
    const { container } = render(<DecksLoading />);

    const well = container.querySelector("header")!.nextElementSibling!;

    expect(well.className).toContain("max-w-7xl");
    expect(well.className).toContain("px-6");
    expect(well.className).toContain("py-8");
  });

  it("keeps a busy status the route can announce", () => {
    const { container } = render(<DecksLoading />);

    const root = container.firstElementChild!;

    expect(root.getAttribute("role")).toBe("status");
    expect(root.getAttribute("aria-busy")).toBe("true");
    expect(root.getAttribute("aria-label")).toBe("Loading decks");
  });

  /**
   * The skeleton and the real list are two files that have to agree on the
   * row's altitude. If only one of them carries the resting cast, the rows
   * visibly rise or drop the moment the data arrives — the same class of drift
   * as the header band above, one register down.
   *
   * The expected value is read off `DeckList` rather than written out here, so
   * a change to the row's rest step that skips the skeleton fails, and so does
   * the reverse.
   */
  it("casts the same resting shadow step as the real rows", () => {
    const { container: skeleton } = render(<DecksLoading />);
    const skeletonFrames = rowFrames(skeleton);

    const { container: list } = render(<DeckList decks={[DECK]} />);
    const realFrame = rowFrames(list)[0];

    const expected = restingCastStep(realFrame);
    // Guards the guard: if the real row stops casting, this case would
    // otherwise pass by comparing `undefined` to `undefined`.
    expect(expected).toBe("chamfer-shadow-sm");

    expect(skeletonFrames.length).toBeGreaterThan(0);
    for (const frame of skeletonFrames) {
      expect(restingCastStep(frame)).toBe(expected);
      expect(
        frame.querySelector('[data-slot="chamfer-shadow"]')
      ).not.toBeNull();
    }
  });

  it("leaves the hover step to the real rows, which alone can be hovered", () => {
    const { container } = render(<DecksLoading />);

    for (const frame of rowFrames(container)) {
      expect(frame.className).not.toContain("hover:chamfer-shadow");
    }
  });
});
