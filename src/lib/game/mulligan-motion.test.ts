import { describe, expect, it } from "vitest";
import { cardFlip, mulliganMotion } from "@/lib/motion";
import { flightDurationMs } from "./card-motion";
import {
  mulliganPilePoint,
  mulliganRowWidth,
  mulliganSlotPoint,
  planMulliganDeal,
  planMulliganReturn,
} from "./mulligan-motion";

const geometry = { cardWidth: 120, gap: 12, pileGap: 48 };
const FLIP_MS = cardFlip.duration * 1000;

describe("mulligan stage geometry", () => {
  it("lays slots out gap apart and puts the pile right of a full row", () => {
    expect(mulliganSlotPoint(0, geometry)).toEqual({ x: 0, y: 0 });
    expect(mulliganSlotPoint(4, geometry)).toEqual({ x: 528, y: 0 });
    expect(mulliganRowWidth(5, geometry)).toBe(648);
    expect(mulliganRowWidth(0, geometry)).toBe(0);
    expect(mulliganPilePoint(geometry)).toEqual({ x: 696, y: 0 });
  });
});

describe("planMulliganReturn", () => {
  const plan = planMulliganReturn(5, geometry);

  it("flips the hand face-down left to right, 40ms apart", () => {
    expect(plan.cards.map((card) => card.flipAtMs)).toEqual([
      0, 40, 80, 120, 160,
    ]);
    for (const card of plan.cards) {
      expect(card.initialFaceDown).toBe(false);
      expect(card.faceDown).toBe(true);
      expect(card.flipInstant).toBe(false);
    }
  });

  it("flies into the pile 50ms apart once every flip has ended", () => {
    const flipsEnd = 4 * mulliganMotion.flipStaggerMs + FLIP_MS;
    expect(plan.cards.map((card) => card.departAtMs)).toEqual([
      flipsEnd,
      flipsEnd + 50,
      flipsEnd + 100,
      flipsEnd + 150,
      flipsEnd + 200,
    ]);
    for (const [index, card] of plan.cards.entries()) {
      expect(card.from).toEqual(mulliganSlotPoint(index, geometry));
      expect(card.to).toEqual(mulliganPilePoint(geometry));
      expect(card.durationMs).toBe(flightDurationMs(696 - index * 132));
      expect(card.landAtMs).toBe(card.departAtMs + card.durationMs);
    }
  });

  it("ends when the last card lands", () => {
    expect(plan.endsAtMs).toBe(
      Math.max(...plan.cards.map((card) => card.landAtMs))
    );
    expect(planMulliganReturn(0, geometry)).toEqual({ cards: [], endsAtMs: 0 });
  });
});

describe("planMulliganDeal", () => {
  const plan = planMulliganDeal(5, geometry);

  it("flips only the top card; the cards under it swap when it ends", () => {
    const [top, ...under] = plan.cards;
    expect(top.initialFaceDown).toBe(true);
    expect(top.flipAtMs).toBe(0);
    expect(top.flipInstant).toBe(false);
    for (const card of under) {
      expect(card.initialFaceDown).toBe(true);
      expect(card.flipInstant).toBe(true);
      expect(card.flipAtMs).toBe(FLIP_MS);
    }
    for (const card of plan.cards) expect(card.faceDown).toBe(false);
  });

  it("deals face-up to the slots left to right, 90ms apart", () => {
    expect(plan.cards.map((card) => Math.round(card.departAtMs))).toEqual([
      300, 390, 480, 570, 660,
    ]);
    for (const [index, card] of plan.cards.entries()) {
      expect(card.from).toEqual(mulliganPilePoint(geometry));
      expect(card.to).toEqual(mulliganSlotPoint(index, geometry));
    }
    expect(plan.endsAtMs).toBe(
      Math.max(...plan.cards.map((card) => card.landAtMs))
    );
  });
});
