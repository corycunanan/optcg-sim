import { describe, expect, it, vi } from "vitest";
import { cardTravel } from "@/lib/motion";
import {
  FLIP_SECONDS,
  arcHeight,
  arcNormal,
  assignPileFlips,
  flightDurationMs,
  flightPose,
  needsFlip,
  onNextFrame,
  planFlight,
  zoneFaceDown,
  type FlipCandidate,
} from "./card-motion";

describe("zoneFaceDown", () => {
  it.each([
    ["p-deck", true],
    ["o-deck", true],
    ["p-don-deck", true],
    ["o-hand", true],
    ["p-hand", false],
    ["p-leader", false],
    ["o-stage", false],
    ["p-char-2", false],
    ["o-trash", false],
    ["p-don", false],
    ["spotlight-abc-i-1", false],
  ])("%s → face-down %s", (zoneKey, expected) => {
    expect(zoneFaceDown(zoneKey)).toBe(expected);
  });

  it("follows the received hand's visibility over the board side", () => {
    expect(zoneFaceDown("p-hand", { handFaceDown: true })).toBe(true);
    expect(zoneFaceDown("o-hand", { handFaceDown: false })).toBe(false);
  });

  it("lets Life take either side, face-down by default", () => {
    expect(zoneFaceDown("p-life")).toBe(true);
    expect(zoneFaceDown("p-life", { lifeFaceDown: false })).toBe(false);
  });
});

function draw(partial: Partial<FlipCandidate> = {}): FlipCandidate {
  return {
    cardId: "OP01-001",
    fromZoneKey: "p-deck",
    sourceFaceDown: true,
    destinationFaceDown: false,
    delay: 0,
    ...partial,
  };
}

describe("needsFlip", () => {
  it("flips a public card whose destination needs the other side", () => {
    expect(needsFlip(draw())).toBe(true);
    expect(needsFlip(draw({ sourceFaceDown: false }))).toBe(false);
  });

  it("never flips a hidden card", () => {
    expect(needsFlip(draw({ cardId: null }))).toBe(false);
    expect(needsFlip(draw({ cardId: "hidden" }))).toBe(false);
  });

  it("never flips a transform or DON token", () => {
    expect(needsFlip(draw({ kind: "transform" }))).toBe(false);
    expect(needsFlip(draw({ kind: "don-attach" }))).toBe(false);
  });
});

describe("assignPileFlips — top card only", () => {
  it("flips only the first card off a face-down pile; the rest come off turned", () => {
    const out = assignPileFlips([
      draw({ delay: 0 }),
      draw({ delay: 0.09 }),
      draw({ delay: 0.18 }),
    ]);
    expect(out.map((t) => t.flip)).toEqual(["turn", "under", "under"]);
    expect(out[1].pileFlipAt).toBeCloseTo(FLIP_SECONDS, 5);
    expect(out[2].pileFlipAt).toBeCloseTo(FLIP_SECONDS, 5);
  });

  it("times the under cards off the top card's own delay", () => {
    const out = assignPileFlips([draw({ delay: 0.2 }), draw({ delay: 0.29 })]);
    expect(out[1].pileFlipAt).toBeCloseTo(0.2 + FLIP_SECONDS, 5);
  });

  it("groups by source pile", () => {
    const out = assignPileFlips([
      draw({ fromZoneKey: "p-deck" }),
      draw({ fromZoneKey: "p-life" }),
      draw({ fromZoneKey: "p-deck" }),
    ]);
    expect(out.map((t) => t.flip)).toEqual(["turn", "turn", "under"]);
  });

  it("flips each non-pile card where it stands", () => {
    const out = assignPileFlips([
      draw({ fromZoneKey: "o-hand" }),
      draw({ fromZoneKey: "o-hand" }),
    ]);
    expect(out.map((t) => t.flip)).toEqual(["turn", "turn"]);
  });

  it("leaves hidden draws and same-side moves untouched", () => {
    const hidden = draw({ cardId: null });
    const sameSide = draw({ fromZoneKey: "p-hand", sourceFaceDown: false });
    const out = assignPileFlips([hidden, sameSide]);
    expect(out[0]).toBe(hidden);
    expect(out[1]).toBe(sameSide);
  });

  it("does not let a hidden top card turn the next public card into an under card", () => {
    const out = assignPileFlips([draw({ cardId: null }), draw()]);
    expect(out[1].flip).toBe("turn");
  });
});

describe("planFlight", () => {
  it("holds a turning card at its source for the flip, then departs", () => {
    const [t] = assignPileFlips([draw({ delay: 0.1 })]);
    expect(planFlight(t)).toEqual({
      initialFaceDown: true,
      faceDown: false,
      flipAt: 0.1,
      flipInstant: false,
      departAt: 0.1 + FLIP_SECONDS,
    });
  });

  it("swaps an under card instantly when the top card's flip ends", () => {
    const [, under] = assignPileFlips([
      draw({ delay: 0 }),
      draw({ delay: 0.09 }),
    ]);
    const plan = planFlight(under);
    expect(plan.flipInstant).toBe(true);
    expect(plan.flipAt).toBeCloseTo(FLIP_SECONDS, 5);
    expect(plan.departAt).toBeCloseTo(0.09 + FLIP_SECONDS, 5);
    expect(plan.initialFaceDown).toBe(true);
    expect(plan.faceDown).toBe(false);
  });

  it("keeps a hidden card sleeved with no flip and no hold", () => {
    expect(planFlight(draw({ cardId: null, delay: 0.09 }))).toEqual({
      initialFaceDown: true,
      faceDown: true,
      flipAt: null,
      flipInstant: false,
      departAt: 0.09,
    });
  });

  it("flies a same-side move immediately on the destination side", () => {
    const plan = planFlight(
      draw({ fromZoneKey: "p-hand", sourceFaceDown: false, delay: 0.06 })
    );
    expect(plan).toMatchObject({
      faceDown: false,
      flipAt: null,
      departAt: 0.06,
    });
  });
});

describe("flightDurationMs", () => {
  it("is 180ms + 0.12ms per px, clamped to 220–380ms", () => {
    expect(flightDurationMs(0)).toBe(220);
    expect(flightDurationMs(500)).toBeCloseTo(240, 5);
    expect(flightDurationMs(1000)).toBeCloseTo(300, 5);
    expect(flightDurationMs(2000)).toBe(380);
  });
});

describe("arc geometry", () => {
  it("peaks at 6% of the distance, capped at 48px", () => {
    expect(arcHeight(400)).toBeCloseTo(24, 5);
    expect(arcHeight(800)).toBe(48);
    expect(arcHeight(2000)).toBe(48);
  });

  it("always bulges toward screen-up", () => {
    for (const [dx, dy] of [
      [300, 0],
      [-300, 0],
      [300, 300],
      [-300, 300],
      [300, -300],
      [-300, -300],
    ]) {
      expect(arcNormal(dx, dy).y).toBeLessThan(0);
    }
  });

  it("picks a consistent side for near-vertical moves", () => {
    expect(arcNormal(0, 400).x).toBeGreaterThan(0);
    expect(arcNormal(0, -400).x).toBeGreaterThan(0);
    expect(arcNormal(1, 400).x).toBeGreaterThan(0);
    expect(arcNormal(-1, -400).x).toBeGreaterThan(0);
  });
});

describe("flightPose", () => {
  const from = { x: 100, y: 500 };
  const to = { x: 900, y: 500 };

  it("starts and lands exactly on its endpoints with no lean or growth", () => {
    expect(flightPose(0, from, to)).toEqual({
      x: 100,
      y: 500,
      rotate: 0,
      scale: 1,
    });
    const end = flightPose(1, from, to, { from: 0, to: 90 });
    expect(end.x).toBeCloseTo(900, 9);
    expect(end.y).toBeCloseTo(500, 9);
    expect(end.rotate).toBeCloseTo(90, 9);
    expect(end.scale).toBeCloseTo(1, 9);
  });

  it("arcs up, leans toward the travel direction and grows at the peak", () => {
    const mid = flightPose(0.5, from, to);
    expect(mid.x).toBeCloseTo(500, 9);
    expect(mid.y).toBeCloseTo(500 - 48, 9);
    expect(mid.rotate).toBeCloseTo(cardTravel.leanMaxDeg, 9);
    expect(mid.scale).toBeCloseTo(1 + cardTravel.peakScale, 9);
    expect(flightPose(0.5, to, from).rotate).toBeCloseTo(
      -cardTravel.leanMaxDeg,
      9
    );
  });

  it("is continuous: no step between samples exceeds the straight-line share", () => {
    const steps = 200;
    let prev = flightPose(0, from, to);
    for (let i = 1; i <= steps; i++) {
      const next = flightPose(i / steps, from, to);
      expect(Math.hypot(next.x - prev.x, next.y - prev.y)).toBeLessThan(5);
      prev = next;
    }
  });

  it("drops the arc, lean and growth under reduced motion", () => {
    expect(flightPose(0.5, from, to, undefined, true)).toEqual({
      x: 500,
      y: 500,
      rotate: 0,
      scale: 1,
    });
  });
});

describe("onNextFrame", () => {
  it("runs at once when there is no animation frame (server, node tests)", () => {
    let ran = false;
    onNextFrame(() => {
      ran = true;
    })();
    expect(ran).toBe(true);
  });

  it("defers to the next frame and can be cancelled", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    const cancelled: number[] = [];
    vi.stubGlobal("cancelAnimationFrame", (id: number) => cancelled.push(id));
    try {
      let ran = 0;
      onNextFrame(() => ran++);
      const cancel = onNextFrame(() => ran++);
      expect(ran).toBe(0);
      cancel();
      expect(cancelled).toEqual([2]);
      callbacks[0](0);
      expect(ran).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
