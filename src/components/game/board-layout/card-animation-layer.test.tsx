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
import { cardTransitions } from "@/lib/motion";

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

import { CardAnimationLayer } from "./card-animation-layer";

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
function mount(t: CardTransition, boardScale = 1) {
  act(() => {
    renderer = create(
      <CardAnimationLayer
        transitions={[t]}
        cardDb={{} as CardDb}
        onComplete={() => {}}
        boardScale={boardScale}
      />,
    );
  });
}

type Values = Record<"x" | "y", { get: () => number }>;
function ghostPosition() {
  const ghost = renderer!.root.find(
    (node) => node.type === "div" && node.props["data-flight-id"] === "ct-test",
  );
  const style = ghost.props["data-motion-style"] as Values;
  return { x: style.x.get(), y: style.y.get() };
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
