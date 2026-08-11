// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import LobbyRoomLoading from "./loading";

afterEach(() => cleanup());

/**
 * The loading state paints the same frame as the room it stands in for. It
 * previously scrolled on its own terms — `overflow-y-auto` on the frame and
 * `min-h-[480px]` seat skeletons — which made it the one lobby view that could
 * scroll no matter what the live shell did.
 */
function renderLoading(): HTMLElement {
  const { container } = render(<LobbyRoomLoading />);
  return container;
}

function classNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>("[class]")].map((node) =>
    node.className.toString()
  );
}

describe("lobby room loading state", () => {
  it("paints the shell's no-scroll frame", () => {
    const container = renderLoading();

    const frame = container.querySelector<HTMLElement>("[data-lobby-frame]")!;
    expect(frame).not.toBeNull();
    expect(frame.className).toContain("overflow-hidden");
    expect(frame.className).toContain("min-h-0");
    expect(frame.className).toContain("flex-1");
    expect(frame.className).not.toContain("overflow-y-auto");

    const content = container.querySelector<HTMLElement>(
      "[data-lobby-content]"
    )!;
    expect(content).not.toBeNull();
    expect(content.className).toContain("min-h-0");
    expect(content.className).toContain("flex-1");
    expect(content.className).toContain("overflow-hidden");
  });

  it("keeps a busy status the shell can announce", () => {
    const frame = renderLoading().querySelector("[data-lobby-frame]")!;

    expect(frame.getAttribute("role")).toBe("status");
    expect(frame.getAttribute("aria-busy")).toBe("true");
    expect(frame.getAttribute("aria-label")).toBe("Loading lobby room");
  });

  it("carries no fixed minimum that could outgrow the frame", () => {
    const names = classNames(renderLoading());

    expect(names.some((name) => /\bmin-h-\[/.test(name))).toBe(false);
    expect(names.some((name) => /\bmin-h-(?!0\b)\w/.test(name))).toBe(false);
  });

  /**
   * The loading state used to hand-roll its own header with `py-*` on both the
   * header and the well, so the gap below the title was twice the header's own
   * inset and the fixed frame paid 16-32px more here than in any live state.
   */
  it("renders the shared header primitive, not a copy of its classes", () => {
    const container = renderLoading();

    const header = container.querySelector<HTMLElement>("[data-lobby-header]")!;

    expect(header).not.toBeNull();
    expect(header.tagName).toBe("HEADER");
    expect(header.className).toContain("max-w-7xl");
    expect(header.className).toContain("px-6");
    expect(header.className).not.toContain("border-b");
    expect(header.className).not.toContain("bg-navy-900");
  });

  it("spends the header rhythm once, at the live room's gates", () => {
    const container = renderLoading();

    const header = container.querySelector<HTMLElement>("[data-lobby-header]")!;
    const content = container.querySelector<HTMLElement>(
      "[data-lobby-content]"
    )!;

    // Top padding only: a `pb-*`/`py-*` on the header would double the gap.
    expect(header.className).toContain("pt-4");
    expect(header.className).toContain("lg:[@media(min-height:50rem)]:pt-8");
    expect(header.className).not.toMatch(/(?:^|\s|:)p[by]-/);

    // The well's top padding IS the header→content gap, and it matches the
    // header's own step at both height gates.
    expect(content.className).toContain("pt-4");
    expect(content.className).toContain("lg:[@media(min-height:50rem)]:pt-8");
    expect(content.className).not.toMatch(/(?:^|\s|:)py-/);
  });

  it("mirrors the seat's flexible leader and compact row", () => {
    const names = classNames(renderLoading());
    const leader = names.find((name) => name.includes("aspect-card"));

    expect(leader).toBeDefined();
    expect(leader).toContain("w-24");
    expect(leader).toContain("lg:w-auto");
    expect(leader).toContain("lg:flex-1");
    expect(leader).toContain("lg:max-h-[16.75rem]");

    expect(
      names.some(
        (name) => name.includes("lg:auto-rows-fr") && name.includes("lg:grid")
      )
    ).toBe(true);
  });
});
