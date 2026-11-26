import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardFlip } from "@/lib/motion";
import { CardFaces } from "./card-faces";

// OPT-1054: the shared flip's clock, instant swaps and reduced motion.

interface AnimateCall {
  value: { set: (next: number) => void };
  target: number;
  options: { duration?: number; delay?: number; onComplete?: () => void };
}
const motionState = vi.hoisted(() => ({
  reduced: false,
  calls: [] as AnimateCall[],
}));

vi.mock("motion/react", async () => {
  const { useState } = await import("react");
  return {
    animate: (
      value: AnimateCall["value"],
      target: number,
      options: AnimateCall["options"]
    ) => {
      motionState.calls.push({ value, target, options });
      return { stop: () => {} };
    },
    motion: { div: "div" },
    // Stable per component, as the real hook is.
    useMotionValue: (initial: number) =>
      useState(() => {
        let current = initial;
        return {
          get: () => current,
          set: (next: number) => {
            current = next;
          },
        };
      })[0],
    useReducedMotion: () => motionState.reduced,
    useTransform: () => ({ get: () => 0 }),
  };
});

let renderer: ReactTestRenderer | null = null;
function render(element: React.ReactElement) {
  act(() => {
    renderer = create(element);
  });
}
function overlayCount() {
  return renderer!.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      /gb-card-flip-(shade|gloss)/.test(String(node.props.className ?? ""))
  ).length;
}

beforeEach(() => {
  motionState.reduced = false;
  motionState.calls.length = 0;
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("CardFaces flip (OPT-1054)", () => {
  it("rests without animating or mounting flip layers", () => {
    render(<CardFaces faceDown={false}>face</CardFaces>);
    expect(motionState.calls).toHaveLength(0);
    expect(overlayCount()).toBe(0);
  });

  it("turns a flipFrom card over after its delay with the shared flip", () => {
    render(
      <CardFaces faceDown={false} flipFrom={{ faceDown: true, delay: 0.27 }}>
        face
      </CardFaces>
    );
    expect(motionState.calls).toHaveLength(1);
    const [{ target, options }] = motionState.calls;
    expect(target).toBe(0);
    expect(options.delay).toBeCloseTo(0.27, 1);
    expect(options.duration).toBe(cardFlip.duration);
    // Shade and gloss on both faces while the flip runs, gone after.
    expect(overlayCount()).toBe(4);
    act(() => {
      motionState.calls[0].value.set(target);
      options.onComplete?.();
    });
    expect(overlayCount()).toBe(0);
  });

  it("swaps instantly for an instant flipFrom (a card under the pile top)", () => {
    render(
      <CardFaces
        faceDown={false}
        flipFrom={{ faceDown: true, delay: 0.3, instant: true }}
      >
        face
      </CardFaces>
    );
    const [{ options }] = motionState.calls;
    expect(options.duration).toBe(0);
    expect(options.delay).toBeCloseTo(0.3, 1);
    expect(overlayCount()).toBe(0);
  });

  it("swaps instantly under reduced motion", () => {
    motionState.reduced = true;
    render(
      <CardFaces faceDown={false} flipFrom={{ faceDown: true, delay: 0 }}>
        face
      </CardFaces>
    );
    const [{ target, options }] = motionState.calls;
    expect(target).toBe(0);
    expect(options.duration).toBe(0);
    expect(overlayCount()).toBe(0);
  });

  it("mounts the flip layers before the flip's first frame", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    try {
      render(
        <CardFaces faceDown={false} flipFrom={{ faceDown: true, delay: 0 }}>
          face
        </CardFaces>
      );
      // The flip has not started yet, but its shade is already in place.
      expect(motionState.calls).toHaveLength(0);
      expect(overlayCount()).toBe(4);
      act(() => frames.shift()?.(0));
      expect(motionState.calls).toHaveLength(1);
      expect(overlayCount()).toBe(4);
    } finally {
      act(() => renderer?.unmount());
      renderer = null;
      vi.unstubAllGlobals();
    }
  });
});
