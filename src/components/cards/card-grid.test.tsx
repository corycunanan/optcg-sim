import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handCardHover } from "@/lib/motion";
import type { CardWithRelations } from "./card-browser";

const motionState = vi.hoisted(() => ({ reduced: false }));

// `motion.button` renders a plain <button> here so react-test-renderer can
// inspect the animation props the tile hands to Motion. The preset values
// themselves are asserted against the shared export, not re-typed.
vi.mock("motion/react", () => ({
  motion: { button: "button" },
  useReducedMotion: () => motionState.reduced,
}));

import { CardGrid, CardGridSkeleton } from "./card-grid";

const CARD: CardWithRelations = {
  id: "OP01-001",
  originSet: "OP01",
  name: "Roronoa Zoro",
  color: ["Green"],
  type: "CHARACTER",
  cost: 3,
  power: 5000,
  counter: 1000,
  attribute: ["Slash"],
  traits: ["Supernovas", "Straw Hat Crew"],
  rarity: "SR",
  effectText: "",
  triggerText: null,
  imageUrl: "https://cdn.example.test/OP01-001.png",
  blockNumber: 1,
  banStatus: "LEGAL",
  isReprint: false,
  _count: { artVariants: 0 },
  cardSets: [{ setLabel: "OP01" }],
};

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  motionState.reduced = false;
});

function renderGrid() {
  act(() => {
    renderer = create(<CardGrid cards={[CARD]} onCardClick={() => {}} />);
  });
  return renderer!.root.findByType("button").props as {
    className: string;
    whileHover?: typeof handCardHover;
    transition?: { duration: number; ease: string };
  };
}

describe("CardGrid tile hover (OPT-693)", () => {
  it("applies the board's hand-card pop-and-raise preset on hover", () => {
    const props = renderGrid();

    // Same object identity as the board preset — no inline duplicate values.
    expect(props.whileHover).toBe(handCardHover);
    // Computed geometry the preset resolves to.
    expect(props.whileHover?.scale).toBe(1.05);
    expect(props.whileHover?.y).toBe(-8);
    expect(props.whileHover?.rotate).toEqual([0, 1.2, -1.2, 0]);
    expect(props.whileHover?.transition.scale).toEqual({
      type: "spring",
      stiffness: 420,
      damping: 13,
    });
    expect(props.whileHover?.transition.y).toEqual({
      type: "spring",
      stiffness: 420,
      damping: 13,
    });
  });

  it("tweens the hover transforms out instead of inheriting the spring", () => {
    const props = renderGrid();

    expect(props.transition).toEqual({ duration: 0.15, ease: "easeOut" });
  });

  it("rests at shadow-sm and hovers to shadow-md", () => {
    const { className } = renderGrid();

    expect(className).toContain("shadow-sm");
    expect(className).toContain("hover:shadow-md");
    expect(className).toContain("transition-shadow");
  });

  it("does not stack a CSS translate or an inner image zoom on the preset", () => {
    act(() => {
      renderer = create(<CardGrid cards={[CARD]} onCardClick={() => {}} />);
    });
    const html = JSON.stringify(renderer!.toJSON());

    expect(html).not.toContain("-translate-y-1");
    expect(html).not.toContain("group-hover:scale");
    expect(html).not.toContain("transition-all");
  });

  it("drops the hover animation under prefers-reduced-motion but keeps the shadow lift", () => {
    motionState.reduced = true;
    const props = renderGrid();

    expect(props.whileHover).toBeUndefined();
    expect(props.className).toContain("shadow-sm");
    expect(props.className).toContain("hover:shadow-md");
  });

  it("renders an empty state instead of tiles when there are no cards", () => {
    act(() => {
      renderer = create(<CardGrid cards={[]} onCardClick={() => {}} />);
    });

    expect(renderer!.root.findAllByType("button")).toHaveLength(0);
  });

  it("keeps the skeleton grid free of hover treatment", () => {
    act(() => {
      renderer = create(<CardGridSkeleton count={2} />);
    });
    const html = JSON.stringify(renderer!.toJSON());

    expect(html).not.toContain("hover:shadow-md");
  });
});
