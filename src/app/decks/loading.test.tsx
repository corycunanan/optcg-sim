// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import DecksLoading from "./loading";

afterEach(() => cleanup());

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
});
