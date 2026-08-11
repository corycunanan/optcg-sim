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
