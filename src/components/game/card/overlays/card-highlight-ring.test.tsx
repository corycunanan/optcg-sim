import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CardHighlightRing,
  resolveCardHighlightRingColor,
} from "./card-highlight-ring";

vi.mock("motion/react", () => ({
  motion: { div: "div" },
  useReducedMotion: () => true,
}));

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

function renderRing(
  activeRing: Parameters<typeof resolveCardHighlightRingColor>[0],
  hasUsableEffect: boolean
) {
  act(() => {
    renderer = create(
      <CardHighlightRing
        color={resolveCardHighlightRingColor(activeRing, hasUsableEffect)}
      />
    );
  });

  return renderer;
}

describe("CardHighlightRing usable-effect precedence", () => {
  it("keeps a prompt-driven target ring above usable-effect availability", () => {
    const ring = renderRing("selected", true);

    expect(ring?.root.findByType("div").props.className).toContain(
      "ring-gb-signal-selected"
    );
    expect(ring?.root.findByType("div").props.className).not.toContain(
      "ring-gold-500"
    );
  });

  it("renders a steady board-floor gold ring for usable effect availability", () => {
    const ring = renderRing(undefined, true);
    const className = ring?.root.findByType("div").props.className;

    expect(className).toContain("ring-4");
    expect(className).toContain("ring-gold-500");
    expect(className).not.toContain("animate-");
  });

  it("renders no ring when the server sent no usable availability", () => {
    const ring = renderRing(undefined, false);

    expect(ring?.toJSON()).toBeNull();
  });
});
