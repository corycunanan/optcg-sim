/**
 * Pure timeline for the opening-hand redraw (OPT-1060), played inside the
 * Mulligan modal. Spec: the Card Motion Lab "Mulligan" scene.
 *
 * 1. Return: the hand flips face-down left to right, then each card flies
 *    into the deck pile.
 * 2. Shuffle: the deck riffles in place.
 * 3. Deal: the top card flips and the new hand is dealt face-up, left to
 *    right. Only the top card flips; the cards under it come off already
 *    face-up (`assignPileFlips`, the OPT-1054 top-card rule).
 *
 * All positions are px relative to the left edge of the hand row, which is
 * the modal's layout box. The modal is not scaled, so px are design px and
 * feed `flightDurationMs` directly. Times are ms from the start of the phase
 * they belong to (return from the click, deal from when dealing starts).
 */

import { cardFlip, mulliganMotion } from "@/lib/motion";
import {
  assignPileFlips,
  flightDurationMs,
  planFlight,
  type FlipCandidate,
  type Point,
} from "./card-motion";

const FLIP_MS = cardFlip.duration * 1000;

export interface MulliganStageGeometry {
  cardWidth: number;
  /** Gap between hand slots. */
  gap: number;
  /** Gap between the last hand slot and the deck pile. */
  pileGap: number;
}

/** Left edge of hand slot `index`. */
export function mulliganSlotPoint(
  index: number,
  geometry: MulliganStageGeometry
): Point {
  return { x: index * (geometry.cardWidth + geometry.gap), y: 0 };
}

/** Width of a hand row of `count` cards. */
export function mulliganRowWidth(
  count: number,
  geometry: MulliganStageGeometry
): number {
  if (count <= 0) return 0;
  return count * geometry.cardWidth + (count - 1) * geometry.gap;
}

/** Left edge of the deck pile, just right of a full five-card row. The pile
 *  sits at the same place whatever the hand size, so it never shifts. */
export function mulliganPilePoint(geometry: MulliganStageGeometry): Point {
  return { x: mulliganRowWidth(5, geometry) + geometry.pileGap, y: 0 };
}

export interface MulliganCardMove {
  from: Point;
  to: Point;
  /** Side the card shows when it mounts. */
  initialFaceDown: boolean;
  /** Side the card shows on landing. */
  faceDown: boolean;
  /** When the card turns to `faceDown`; null when it never changes side. */
  flipAtMs: number | null;
  /** True when the side change is an instant swap hidden under the pile's
   *  top card. */
  flipInstant: boolean;
  departAtMs: number;
  durationMs: number;
  landAtMs: number;
}

export interface MulliganPhasePlan {
  cards: MulliganCardMove[];
  /** When the last card lands. */
  endsAtMs: number;
}

function distance(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/**
 * The hand flips face-down left to right (`flipStaggerMs` apart). Once the
 * last flip ends, the cards fly into the deck left to right
 * (`returnStaggerMs` apart).
 */
export function planMulliganReturn(
  count: number,
  geometry: MulliganStageGeometry
): MulliganPhasePlan {
  const pile = mulliganPilePoint(geometry);
  const flipsEndMs =
    count > 0 ? (count - 1) * mulliganMotion.flipStaggerMs + FLIP_MS : 0;
  const cards = Array.from({ length: count }, (_, index) => {
    const from = mulliganSlotPoint(index, geometry);
    const departAtMs = flipsEndMs + index * mulliganMotion.returnStaggerMs;
    const durationMs = flightDurationMs(distance(from, pile));
    return {
      from,
      to: pile,
      initialFaceDown: false,
      faceDown: true,
      flipAtMs: index * mulliganMotion.flipStaggerMs,
      flipInstant: false,
      departAtMs,
      durationMs,
      landAtMs: departAtMs + durationMs,
    };
  });
  return { cards, endsAtMs: lastLanding(cards) };
}

/**
 * The new hand is dealt from the deck pile to slots left to right
 * (`dealStaggerMs` apart). The top card flips on the pile first; the cards
 * under it swap to face-up hidden beneath it and leave already turned.
 */
export function planMulliganDeal(
  count: number,
  geometry: MulliganStageGeometry
): MulliganPhasePlan {
  const pile = mulliganPilePoint(geometry);
  const candidates: FlipCandidate[] = Array.from(
    { length: count },
    (_, index) => ({
      // Any public id: the viewer's own hand is never redacted.
      cardId: "own-hand",
      fromZoneKey: "p-deck",
      sourceFaceDown: true,
      destinationFaceDown: false,
      delay: (index * mulliganMotion.dealStaggerMs) / 1000,
    })
  );
  const cards = assignPileFlips(candidates).map((candidate, index) => {
    const plan = planFlight(candidate);
    const to = mulliganSlotPoint(index, geometry);
    const departAtMs = plan.departAt * 1000;
    const durationMs = flightDurationMs(distance(pile, to));
    return {
      from: pile,
      to,
      initialFaceDown: plan.initialFaceDown,
      faceDown: plan.faceDown,
      flipAtMs: plan.flipAt === null ? null : plan.flipAt * 1000,
      flipInstant: plan.flipInstant,
      departAtMs,
      durationMs,
      landAtMs: departAtMs + durationMs,
    };
  });
  return { cards, endsAtMs: lastLanding(cards) };
}

function lastLanding(cards: readonly MulliganCardMove[]): number {
  return cards.reduce((latest, card) => Math.max(latest, card.landAtMs), 0);
}
