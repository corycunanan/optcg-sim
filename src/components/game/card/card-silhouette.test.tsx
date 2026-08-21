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

  // `rounded-card` writes `4% / calc(4% * 600/838)`, so the horizontal radius
  // resolves against the box's width and the vertical against its height. The
  // two are the same length — a true quarter-circle — only on a 600/838 box.
  //
  // No `CARD_SIZES` token is literally that: four are 5:7 and `hand` is 42:59.
  // So the invariant worth pinning is not the ratio but its consequence — how
  // far apart the two radius axes land. Today that is 0.005–0.020px, which is
  // a circle to well within a rendered pixel. A new token that drifted far
  // enough to paint a visible ellipse fails here.
  const MAX_RADIUS_AXIS_DELTA_PX = 0.05;

  it("keeps both radius axes within a sub-pixel of each other at every size token", () => {
    for (const [token, { width, height }] of Object.entries(CARD_SIZES)) {
      const horizontal = 0.04 * width;
      const vertical = 0.04 * (600 / 838) * height;

      expect(
        Math.abs(horizontal - vertical),
        `${token} (${width}x${height}) paints an elliptical corner: ` +
          `${horizontal.toFixed(4)}px vs ${vertical.toFixed(4)}px`,
      ).toBeLessThan(MAX_RADIUS_AXIS_DELTA_PX);
    }
  });
});
