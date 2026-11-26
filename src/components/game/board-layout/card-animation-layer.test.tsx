import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardDb } from "@shared/game-types";
import type { CardTransition } from "@/hooks/use-card-transitions";
import {
  arcHeight,
  FLIP_SECONDS,
  flightDurationMs,
} from "@/lib/game/card-motion";
import { cardTransitions, donReturnFlight } from "@/lib/motion";
import { BOARD_CARD_H, BOARD_CARD_W } from "./constants";

// OPT-1054: the travel ghost's clock, live target and design-px geometry.

interface AnimateCall {
  options: {
    duration: number;
    delay: number;
    onUpdate: (p: number) => void;
    onComplete: () => void;
  };
}
const animateCalls = vi.hoisted(() => [] as AnimateCall[]);

vi.mock("motion/react", () => {
  const value = (initial: number) => {
    let current = initial;
    return {
      get: () => current,
      set: (next: number) => {
        current = next;
      },
    };
  };
  return {
    animate: (_value: unknown, _target: unknown, options: AnimateCall["options"]) => {
      animateCalls.push({ options });
      return { stop: () => {} };
    },
    motionValue: value,
    useMotionValue: value,
    useReducedMotion: () => false,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: ({ children, ...props }: Record<string, unknown>) => {
        const { style, ...rest } = props as { style?: unknown };
        return (
          <div data-motion-style={style} {...(rest as object)}>
            {children as React.ReactNode}
          </div>
        );
      },
    },
  };
});

const rects = vi.hoisted(() => new Map<string, DOMRect>());
vi.mock("@/contexts/zone-position-context", () => ({
  useZonePosition: () => ({
    getRect: (key: string) => rects.get(key) ?? null,
  }),
}));
vi.mock("../scaled-board", () => ({ getPortalContainer: () => null }));
vi.mock("../card", () => ({ Card: () => null }));

import {
  CardAnimationLayer,
  cardFootprint,
  clipOutside,
} from "./card-animation-layer";

function rect(left: number, top: number, width = 0, height = 0): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function transition(partial: Partial<CardTransition> = {}): CardTransition {
  return {
    id: "ct-test",
    cardId: "OP01-001",
    instanceId: "i-1",
    fromZoneKey: "p-hand",
    toZoneKey: "p-char-1",
    playerIndex: 0,
    startedAt: 0,
    sourceFaceDown: false,
    destinationFaceDown: false,
    ...partial,
  };
}

let renderer: ReactTestRenderer | null = null;
function mount(
  t: CardTransition,
  boardScale = 1,
  restedInstanceIds?: ReadonlySet<string>,
) {
  act(() => {
    renderer = create(
      <CardAnimationLayer
        transitions={[t]}
        cardDb={{} as CardDb}
        onComplete={() => {}}
        boardScale={boardScale}
        restedInstanceIds={restedInstanceIds}
      />,
    );
  });
}

type Values = Record<"x" | "y" | "rotate", { get: () => number }>;
function ghostPosition() {
  const ghost = renderer!.root.find(
    (node) => node.type === "div" && node.props["data-flight-id"] === "ct-test",
  );
  const style = ghost.props["data-motion-style"] as Values;
  return { x: style.x.get(), y: style.y.get(), rotate: style.rotate.get() };
}
function clipLayer() {
  return renderer!.root.find(
    (node) =>
      node.type === "div" &&
      typeof (node.props.style as { clipPath?: string } | undefined)?.clipPath === "string",
  );
}

beforeEach(() => {
  animateCalls.length = 0;
  rects.clear();
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("TravelGhost (OPT-1054)", () => {
  it("holds its departure for the flip when the card turns over first", () => {
    rects.set("p-deck", rect(0, 0));
    rects.set("p-hand", rect(400, 0));
    mount(
      transition({
        fromZoneKey: "p-deck",
        toZoneKey: "p-hand",
        sourceFaceDown: true,
        flip: "turn",
      }),
    );
    expect(animateCalls).toHaveLength(1);
    expect(animateCalls[0].options.delay).toBeCloseTo(FLIP_SECONDS);
  });

  it("re-reads its destination while it flies", () => {
    rects.set("p-hand", rect(0, 0));
    rects.set("p-char-1", rect(500, 0));
    mount(transition());
    act(() => animateCalls[0].options.onUpdate(1));
    const before = ghostPosition();
    rects.set("p-char-1", rect(640, 30));
    act(() => animateCalls[0].options.onUpdate(1));
    const after = ghostPosition();
    expect(after.x - before.x).toBeCloseTo(140);
    expect(after.y - before.y).toBeCloseTo(30);
  });

  it("times and arcs the flight in design px on a scaled board", () => {
    const scale = 2;
    rects.set("p-hand", rect(0, 300));
    rects.set("p-char-1", rect(1000, 300));
    mount(transition(), scale);
    const { options } = animateCalls[0];
    act(() => options.onUpdate(0));
    const from = ghostPosition();
    act(() => options.onUpdate(1));
    const to = ghostPosition();
    const viewportDistance = Math.hypot(to.x - from.x, to.y - from.y);
    expect(options.duration).toBeCloseTo(
      flightDurationMs(viewportDistance / scale) / 1000,
    );
    expect(options.duration).not.toBeCloseTo(
      flightDurationMs(viewportDistance) / 1000,
    );
    act(() => options.onUpdate(0.5));
    const peak = ghostPosition();
    const midY = (from.y + to.y) / 2;
    expect(midY - peak.y).toBeCloseTo(
      arcHeight(viewportDistance / scale) * scale,
    );
  });

  it("flies DON!! tokens on the shallow DON arc", () => {
    rects.set("p-cost", rect(0, 300));
    rects.set("p-char-1", rect(1000, 300));
    mount(
      transition({
        kind: "don-attach",
        cardId: null,
        instanceId: null,
        fromZoneKey: "p-cost",
      }),
    );
    const { options } = animateCalls[0];
    expect(options.duration).toBeCloseTo(cardTransitions.donAttach.durationMs / 1000);
    act(() => options.onUpdate(0));
    const from = ghostPosition();
    act(() => options.onUpdate(0.5));
    const peak = ghostPosition();
    expect(from.y - peak.y).toBeCloseTo(cardTransitions.donAttach.arcMaxPx);
  });
});

describe("DON!! beneath the card (OPT-1058)", () => {
  it("cuts the target card's footprint out of a given DON!!'s layer", () => {
    rects.set("p-cost", rect(0, 300, 200, 112));
    rects.set("p-char-1", rect(1000, 300, 112, 112));
    mount(
      transition({
        kind: "don-attach",
        cardId: null,
        instanceId: null,
        fromZoneKey: "p-cost",
        targetInstanceId: "c1",
      }),
    );
    expect(clipLayer().props.style.clipPath).toBe(
      clipOutside(cardFootprint(rects.get("p-char-1")!, false, 1)),
    );
  });

  it("turns the footprint sideways under a rested card", () => {
    rects.set("p-cost", rect(0, 300, 200, 112));
    rects.set("p-char-1", rect(1000, 300, 112, 112));
    mount(
      transition({
        kind: "don-attach",
        cardId: null,
        instanceId: null,
        fromZoneKey: "p-cost",
        targetInstanceId: "c1",
      }),
      1,
      new Set(["c1"]),
    );
    expect(clipLayer().props.style.clipPath).toBe(
      clipOutside(cardFootprint(rects.get("p-char-1")!, true, 1)),
    );
  });

  it("slides a Refresh return out from under its card and lands it rested, with no lean", () => {
    rects.set("p-leader", rect(1000, 300, 112, 112));
    rects.set("p-don", rect(0, 300, 200, 112));
    mount(
      transition({
        kind: "don-return",
        cardId: null,
        instanceId: "d1",
        fromZoneKey: "p-leader",
        toZoneKey: "p-don",
        targetInstanceId: "L",
      }),
    );
    expect(clipLayer().props.style.clipPath).toBe(
      clipOutside(cardFootprint(rects.get("p-leader")!, false, 1)),
    );
    const { options } = animateCalls[0];
    expect(options.duration).toBeCloseTo(donReturnFlight.durationMs / 1000);
    act(() => options.onUpdate(0.5));
    // Half-way through the turn to rested, with no lean added on top.
    expect(ghostPosition().rotate).toBeCloseTo(45);
    act(() => options.onUpdate(1));
    expect(ghostPosition().rotate).toBe(90);
  });
});

describe("cardFootprint", () => {
  it("is a portrait card centred in its slot, landscape when rested", () => {
    const slot = { left: 0, top: 0, width: 112, height: 112 };
    expect(cardFootprint(slot, false, 1)).toEqual({
      x: (112 - BOARD_CARD_W) / 2,
      y: 0,
      w: BOARD_CARD_W,
      h: BOARD_CARD_H,
    });
    expect(cardFootprint(slot, true, 0.5)).toEqual({
      x: (112 - BOARD_CARD_H * 0.5) / 2,
      y: (112 - BOARD_CARD_W * 0.5) / 2,
      w: BOARD_CARD_H * 0.5,
      h: BOARD_CARD_W * 0.5,
    });
  });

  it("winds the hole inside a frame larger than the viewport", () => {
    expect(clipOutside({ x: 10, y: 20, w: 30, h: 40 })).toBe(
      'path(evenodd, "M-10000 -10000H20000V20000H-10000Z M10 20h30v40h-30Z")',
    );
  });
});
