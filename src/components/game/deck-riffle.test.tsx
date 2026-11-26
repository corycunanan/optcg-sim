import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deckRiffle } from "@/lib/motion";
import { DeckRiffle } from "./deck-riffle";

// OPT-1055: the in-place deck riffle and its reduced-motion pop.

const motionState = vi.hoisted(() => ({
  reduced: false,
  starts: [] as unknown[],
}));

vi.mock("motion/react", async () => {
  const { forwardRef, createElement, useState } = await import("react");
  const MOTION_PROPS = new Set(["initial", "animate", "transition"]);
  const strip = (props: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key))
    );
  return {
    motion: {
      div: forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) =>
        createElement("div", { ...strip(props), ref })
      ),
    },
    useReducedMotion: () => motionState.reduced,
    // Stable per component, as the real hook is.
    useAnimationControls: () =>
      useState(() => ({
        start: (target: unknown) => {
          motionState.starts.push(target);
          return Promise.resolve();
        },
        set: () => {},
      }))[0],
  };
});

function render(nonce: number | undefined, onDone?: () => void) {
  return (
    <DeckRiffle nonce={nonce} slice={<span>back</span>} onDone={onDone}>
      <span>pile</span>
    </DeckRiffle>
  );
}

const pileWrapper = (root: ReactTestRenderer) =>
  root.root.find(
    (node) => node.type === "span" && node.props.children === "pile"
  ).parent!;

const slices = (root: ReactTestRenderer) =>
  root.root.findAll(
    (node) => node.type === "div" && node.props["data-riffle-slice"] !== undefined
  );

describe("DeckRiffle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    motionState.reduced = false;
    motionState.starts = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays idle without a nonce", () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(render(undefined));
    });
    expect(slices(root)).toHaveLength(0);
    expect(motionState.starts).toHaveLength(0);
  });

  it("riffles three slices over the hidden pile, then pops it", async () => {
    const onDone = vi.fn();
    let root!: ReactTestRenderer;
    act(() => {
      root = create(render(undefined, onDone));
    });
    act(() => {
      root.update(render(1, onDone));
    });
    expect(slices(root)).toHaveLength(deckRiffle.sliceCount);
    expect(pileWrapper(root).props.className).toContain("opacity-0");
    expect(motionState.starts).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(deckRiffle.totalMs);
    });
    expect(slices(root)).toHaveLength(0);
    expect(pileWrapper(root).props.className ?? "").not.toContain("opacity-0");
    expect(motionState.starts).toEqual([{ scale: 1.06 }, { scale: 1 }]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("restarts on a new nonce and ignores a repeated one", async () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(render(1));
    });
    await act(async () => {
      vi.advanceTimersByTime(deckRiffle.totalMs);
    });
    act(() => {
      root.update(render(1));
    });
    expect(slices(root)).toHaveLength(0);
    act(() => {
      root.update(render(2));
    });
    expect(slices(root)).toHaveLength(deckRiffle.sliceCount);
  });

  it("plays only the pile pop under reduced motion", async () => {
    motionState.reduced = true;
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(render(1));
    });
    expect(slices(root)).toHaveLength(0);
    expect(motionState.starts).toEqual([{ scale: 1.06 }, { scale: 1 }]);
  });

  it("finishes a riffle when the nonce clears early", async () => {
    const onDone = vi.fn();
    let root!: ReactTestRenderer;
    act(() => {
      root = create(render(1, onDone));
    });
    act(() => {
      root.update(render(undefined, onDone));
    });
    expect(slices(root)).toHaveLength(deckRiffle.sliceCount);
    await act(async () => {
      vi.advanceTimersByTime(deckRiffle.totalMs);
    });
    expect(slices(root)).toHaveLength(0);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
