import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { donBadgeExit } from "@/lib/motion";
import { Card } from "./card";

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => ({
  AnimatePresence: ({
    children,
    initial,
  }: {
    children: React.ReactNode;
    initial?: boolean;
  }) => (
    <div data-testid="animate-presence" data-initial={initial}>
      {children}
    </div>
  ),
  motion: { div: "div" },
  useMotionValue: () => ({ set: vi.fn() }),
  useReducedMotion: () => motionState.reduced,
  useSpring: (value: unknown) => value,
}));

vi.mock("../use-card-tooltip", () => ({
  CardTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./card-back", () => ({ CardBack: () => <div /> }));
vi.mock("./card-faces", () => ({
  CardFaces: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("./card-front", () => ({ CardFront: () => <div /> }));
vi.mock("./overlays/card-action-badge", () => ({
  CardActionBadge: () => null,
}));
vi.mock("./overlays/card-count-badge", () => ({ CardCountBadge: () => null }));
vi.mock("./overlays/card-don-badge", () => ({
  CardDonBadge: ({ count }: { count: number }) => <span>+{count} DON!!</span>,
}));
vi.mock("./overlays/card-highlight-ring", () => ({
  CardHighlightRing: () => null,
}));
vi.mock("./perspective-container", () => ({
  PerspectiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("./sizes", () => ({ resolveSize: () => ({ width: 80, height: 112 }) }));
vi.mock("./state-presets", () => ({
  idleBreathingConfig: () => null,
  stateToMotionConfig: () => ({
    animate: { rotate: 0 },
    transition: { duration: 0.2 },
    whileHover: undefined,
    whileTap: undefined,
  }),
}));

let renderer: ReactTestRenderer | null = null;

function renderCard(
  donCount?: number,
  powerMod?: {
    kind: "delta" | "absolute";
    value: number;
    nonce?: number;
  },
) {
  act(() => {
    const element = <Card variant="field" overlays={{ donCount, powerMod }} />;
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });
  if (!renderer) throw new Error("Card renderer did not mount");
  return renderer.root;
}

beforeEach(() => {
  motionState.reduced = false;
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("Card attached-DON badge exit", () => {
  it("keeps the badge under AnimatePresence with the fade-and-scale exit", () => {
    const root = renderCard(2);
    const badgeWrapper = root
      .findAllByType("div")
      .find(
        (node) => node.props.className === "absolute z-10" && node.props.exit
      );

    expect(badgeWrapper?.props.exit).toEqual(donBadgeExit);
    expect(
      root.findAllByProps({ "data-testid": "animate-presence" })[0].props[
        "data-initial"
      ]
    ).toBe(false);

    renderCard(0);
    expect(renderer?.root.findAllByType("span")).toHaveLength(0);
  });

  it("removes the scale transform from the reduced-motion exit", () => {
    motionState.reduced = true;
    const root = renderCard(1);
    const badgeWrapper = root
      .findAllByType("div")
      .find(
        (node) => node.props.className === "absolute z-10" && node.props.exit
      );

    expect(badgeWrapper?.props.exit).toEqual({
      opacity: 0,
      transition: { duration: 0 },
    });
    expect(badgeWrapper?.props.exit).not.toHaveProperty("scale");
  });
});

describe("Card power-modified feedback", () => {
  it("renders absolute replacement power distinctly from a signed delta", () => {
    const root = renderCard(undefined, {
      kind: "absolute",
      value: 0,
      nonce: 1,
    });
    const pill = root
      .findAllByType("div")
      .find((node) => node.children.join("") === "→ 0");
    const positioner = root
      .findAllByType("div")
      .find((node) =>
        String(node.props.className).includes("-translate-x-1/2"),
      );

    expect(pill?.props.className).toContain("bg-gb-accent-blue");
    expect(pill?.props.className).not.toContain("bg-gb-accent-red");
    expect(pill?.props.className).not.toContain("bg-gb-accent-green");
    expect(pill?.props.className).not.toContain("-translate-x-1/2");
    expect(positioner?.props.className).toContain("-translate-y-full");
    expect(positioner?.findAllByType("div")).toContain(pill);
  });
});
