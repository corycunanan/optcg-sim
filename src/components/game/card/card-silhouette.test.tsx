import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARD_SIZES } from "./sizes";
import { Card } from "./card";

// The board card is one silhouette painted by several stacked layers, so the
// pin here is deliberately whole-stack rather than per-layer: `box-shadow`
// (the focus ring, the highlight ring) and `overflow` (the clipped faces) both
// follow `border-radius`, so a single layer left at the chrome radius traces a
// visibly different corner over the one beneath it. Adopted board-side by
// OPT-720; see docs/design/SHAPE-LANGUAGE.md §The card radius.

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  motion: { div: "div" },
  useMotionValue: () => ({ set: vi.fn() }),
  useReducedMotion: () => motionState.reduced,
  useSpring: (value: unknown) => value,
}));

vi.mock("../use-card-tooltip", () => ({
  CardTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

let renderer: ReactTestRenderer | null = null;

/** Bare `rounded` — the 4px chrome/badge radius the board stack left behind. */
const CHROME_RADIUS = /(?:^|\s)rounded(?:\s|$)/;

function render(element: React.ReactElement) {
  act(() => {
    renderer = create(element);
  });
  if (!renderer) throw new Error("Card renderer did not mount");
  return renderer.root;
}

function classNamesOf(root: ReturnType<typeof render>) {
  return root
    .findAll((node) => typeof node.type === "string", {
      deep: true,
    })
    .map((node) => String(node.props.className ?? ""));
}

beforeEach(() => {
  motionState.reduced = false;
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("board card silhouette (OPT-720)", () => {
  it("puts the card radius on every layer of the clickable stack", () => {
    const root = render(
      <Card
        variant="field"
        onClick={() => {}}
        ariaLabel="Monkey D. Luffy"
        overlays={{
          highlightRing: "selected",
          powerMod: { kind: "delta", value: 1000 },
        }}
      />,
    );
    const classNames = classNamesOf(root);
    const silhouette = classNames.filter((name) =>
      name.includes("rounded-card"),
    );

    // Wrapper + state-rotation + breathing + interaction + front + back +
    // power flash + highlight ring. If a layer is added or removed, this
    // number moves with it — which is the point.
    expect(silhouette).toHaveLength(8);
    expect(classNames.filter((name) => CHROME_RADIUS.test(name))).toEqual([]);
  });

  it("keeps the focus ring and the clipped faces on the same corner", () => {
    const root = render(
      <Card variant="field" onClick={() => {}} ariaLabel="Monkey D. Luffy" />,
    );
    const classNames = classNamesOf(root);

    const focusRing = classNames.find((name) =>
      name.includes("focus-visible:ring-4"),
    );
    expect(focusRing).toContain("rounded-card");

    // Both faces clip art, so their radius is the seam between the border and
    // the image beneath it.
    const clipped = classNames.filter((name) => name.includes("overflow-hidden"));
    expect(clipped).toHaveLength(2);
    for (const name of clipped) expect(name).toContain("rounded-card");
  });

  it("gives the empty slot the card silhouette too", () => {
    const root = render(<Card variant="field" empty emptyLabel="LIFE" />);
    const slot = classNamesOf(root)[0];

    expect(slot).toContain("rounded-card");
    expect(slot).not.toMatch(CHROME_RADIUS);
  });

  it("draws every highlight ring variant on the card corner", () => {
    for (const ring of [
      "selected",
      "eligible",
      "attacker",
      "defender",
      "counter",
      "winner",
      "redirected",
      "negated",
      "usable-effect",
    ] as const) {
      const root = render(
        <Card variant="field" overlays={{ highlightRing: ring }} />,
      );
      const rings = classNamesOf(root).filter((name) =>
        name.includes("ring-4"),
      );

      expect(rings.length).toBeGreaterThan(0);
      for (const name of rings) expect(name).toContain("rounded-card");

      act(() => renderer?.unmount());
      renderer = null;
    }
  });

  // `rounded-card` is `4%` of the box's width, which is only the printed
  // card's ~2.5mm corner when the box is the printed card's 600/838. Every
  // size token the primitive can hand `PerspectiveContainer` must hold that
  // shape, or the percentage resolves against a box that is not a card.
  it("reserves a card-shaped box at every size token", () => {
    for (const [token, { width, height }] of Object.entries(CARD_SIZES)) {
      expect(
        Math.abs(width / height - 600 / 838),
        `${token} (${width}x${height}) is not card-shaped`,
      ).toBeLessThan(0.01);
    }
  });
});
