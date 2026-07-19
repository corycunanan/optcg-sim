import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cardWinnerPulse,
  negatedRing,
  redirectedSweep,
} from "@/lib/motion";
import {
  CardHighlightRing,
  resolveCardHighlightRingColor,
} from "./card-highlight-ring";

const motionState = vi.hoisted(() => ({ reduced: true }));

vi.mock("motion/react", () => ({
  motion: { div: "div" },
  useReducedMotion: () => motionState.reduced,
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
    const element = (
      <CardHighlightRing
        color={resolveCardHighlightRingColor(activeRing, hasUsableEffect)}
      />
    );
    if (renderer) renderer.update(element);
    else renderer = create(element);
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

describe("CardHighlightRing winner feedback", () => {
  it("uses a green board-floor ring distinct from amber battle rings", () => {
    motionState.reduced = false;
    const ring = renderRing("winner", false);
    const className = ring?.root.findByType("div").props.className;

    expect(className).toContain("ring-4");
    expect(className).toContain("ring-gb-signal-selected");
    expect(className).not.toContain("ring-gb-signal-battle");
  });

  it("keeps recoil off the ring overlay while retaining its pulse", () => {
    motionState.reduced = false;
    const ring = renderRing("winner", false);
    const props = ring?.root.findByType("div").props;
    if (!props) throw new Error("Winner ring did not render");

    expect(props.initial).not.toHaveProperty("x");
    expect(props.animate).not.toHaveProperty("x");
    expect(props.animate.opacity).toEqual(cardWinnerPulse.opacity);
    expect(props.animate.scale).toEqual(cardWinnerPulse.scale);
  });

  it("renders no winner effect for reduced motion", () => {
    motionState.reduced = true;
    const ring = renderRing("winner", false);

    expect(ring?.toJSON()).toBeNull();
  });
});

describe("CardHighlightRing indicator feedback", () => {
  it("renders a desaturated animated ring for effects negation", () => {
    motionState.reduced = false;
    const ring = renderRing("negated", false);
    const props = ring?.root.findByType("div").props;
    if (!props) throw new Error("Negated ring did not render");

    expect(props.className).toContain("ring-gb-signal-disabled/70");
    expect(props.animate.opacity).toEqual(negatedRing.opacity);
    expect(props.animate.scale).toEqual(negatedRing.scale);
  });

  it("renders an amber left-to-right sweep for attack redirection", () => {
    motionState.reduced = false;
    const ring = renderRing("redirected", false);
    const props = ring?.root.findByType("div").props;
    if (!props) throw new Error("Redirected ring did not render");

    expect(props.className).toContain("ring-gb-signal-battle");
    expect(props.animate.clipPath).toEqual(redirectedSweep.clipPath);
  });

  it("suppresses both transient indicators for reduced motion", () => {
    motionState.reduced = true;

    expect(renderRing("negated", false)?.toJSON()).toBeNull();
    expect(renderRing("redirected", false)?.toJSON()).toBeNull();
  });
});
