/**
 * Pure card-motion rules for the board's flight layer (OPT-1054).
 *
 * Three concerns, each consumed by a different layer:
 * - **Which side a zone shows** (`zoneFaceDown`): `use-card-transitions`
 *   stamps every travel transition with the face its source and destination
 *   need, so the flight layer can turn the card over *before* it moves.
 * - **Top-card-only** (`assignPileFlips`): when several cards leave a
 *   face-down pile for a face-up zone in one batch, only the first (top) card
 *   flips; the ones under it come off already face-up.
 * - **Flight geometry** (`flightDurationMs`, `flightPose`, `planFlight`): the
 *   arc, lean, distance-scaled duration and the flip-then-fly timeline that
 *   `card-animation-layer` renders.
 *
 * Timing and shape constants live in `src/lib/motion.ts` (`cardFlip`,
 * `cardTravel`, `cardStagger`) per INTERACTION-GRAMMAR MO-1; this module only
 * does the math. Spec: docs/design/INTERACTION-GRAMMAR.md MO-3 / MO-8.
 */

import { cardFlip, cardTravel } from "@/lib/motion";

/** Seconds the shared flip takes. Flights that turn a card over first hold
 *  their departure for this long. */
export const FLIP_SECONDS = cardFlip.duration;

// ─── Zone sides ──────────────────────────────────────────────────────

export interface ZoneFaceContext {
  /** Hand visibility from the received projection, when known. A hand whose
   *  cards are all redacted is face-down for this viewer whichever side of
   *  the board it sits on. */
  handFaceDown?: boolean;
  /** Life takes either side. Event payloads that carry `face` /
   *  `sourceFace` set this; Life defaults to face-down otherwise. */
  lifeFaceDown?: boolean;
}

/**
 * Which side a zone shows the viewer. Deck, DON!! deck and the top (opponent)
 * hand are face-down; the bottom hand, the field (leader, stage, characters),
 * trash, cost area and the spotlight are face-up. Life takes either side.
 *
 * Zone keys are the board's `p-*` (bottom) / `o-*` (top) registry keys, or a
 * `spotlight-*` key for a card leaving the spotlight.
 */
export function zoneFaceDown(
  zoneKey: string,
  context: ZoneFaceContext = {}
): boolean {
  if (zoneKey.startsWith("spotlight-")) return false;
  const match = /^([po])-(.+)$/.exec(zoneKey);
  if (!match) return false;
  const [, side, zone] = match;
  switch (zone) {
    case "deck":
    case "don-deck":
      return true;
    case "hand":
      return context.handFaceDown ?? side === "o";
    case "life":
      return context.lifeFaceDown ?? true;
    default:
      return false;
  }
}

/** Face-down when the zone is a stacked pile cards are dealt from. */
function isFaceDownPile(zoneKey: string): boolean {
  return /^[po]-(deck|don-deck|life)$/.test(zoneKey);
}

// ─── Flip assignment ─────────────────────────────────────────────────

/** How a travelling card turns over before it departs.
 *  - `turn`: it plays the shared flip where it stands.
 *  - `under`: it sat under a pile's top card while that card flipped, and is
 *    dealt already showing the destination side (an instant swap, hidden
 *    beneath the top card, at `pileFlipAt`). */
export type FlightFlip = "turn" | "under";

export interface FlipCandidate {
  cardId: string | null;
  fromZoneKey: string;
  kind?: string;
  delay?: number;
  sourceFaceDown?: boolean;
  destinationFaceDown?: boolean;
  flip?: FlightFlip;
  pileFlipAt?: number;
}

/** True when the card is public to this viewer and its destination needs the
 *  other side. Hidden cards (no public cardId) never flip; they stay
 *  sleeved for the whole move. */
export function needsFlip(candidate: FlipCandidate): boolean {
  if (candidate.kind !== undefined) return false;
  if (!candidate.cardId || candidate.cardId === "hidden") return false;
  if (
    candidate.sourceFaceDown === undefined ||
    candidate.destinationFaceDown === undefined
  ) {
    return false;
  }
  return candidate.sourceFaceDown !== candidate.destinationFaceDown;
}

/**
 * Mark which cards in a batch flip before they travel. Run after the batch's
 * stagger so the `under` swap can be timed off the top card's delay.
 *
 * When several cards leave the same face-down pile for a face-up zone (draw
 * 2), only the first — the top card — flips; each card under it is marked
 * `under` and swaps to its face the moment the top card's flip ends. Every
 * other card whose destination needs the other side flips where it stands.
 *
 * Pure: returns new objects for changed entries, leaves the rest untouched.
 */
export function assignPileFlips<T extends FlipCandidate>(
  batch: readonly T[]
): T[] {
  const pileTopDelay = new Map<string, number>();
  return batch.map((transition) => {
    if (!needsFlip(transition)) return transition;
    const fromPile =
      isFaceDownPile(transition.fromZoneKey) &&
      transition.sourceFaceDown === true;
    if (!fromPile) return { ...transition, flip: "turn" };

    const topDelay = pileTopDelay.get(transition.fromZoneKey);
    if (topDelay === undefined) {
      pileTopDelay.set(transition.fromZoneKey, transition.delay ?? 0);
      return { ...transition, flip: "turn" };
    }
    return {
      ...transition,
      flip: "under",
      pileFlipAt: topDelay + FLIP_SECONDS,
    };
  });
}

// ─── Flight timeline ─────────────────────────────────────────────────

export interface FlightPlan {
  /** Face the ghost shows when it mounts. */
  initialFaceDown: boolean;
  /** Face the ghost shows on landing. */
  faceDown: boolean;
  /** When (seconds after mount) the ghost turns to `faceDown`; null when it
   *  never changes side. */
  flipAt: number | null;
  /** True when the side change is an instant swap (`under` cards). */
  flipInstant: boolean;
  /** When (seconds after mount) the ghost leaves its source. */
  departAt: number;
}

/** Resolve one travel transition into its flip-then-fly timeline. A card
 *  that turns over (or sits under one that does) departs only after the
 *  flip, so it never changes side mid-air. */
export function planFlight(transition: FlipCandidate): FlightPlan {
  const delay = transition.delay ?? 0;
  const hidden = !transition.cardId || transition.cardId === "hidden";
  const destinationFaceDown = hidden
    ? true
    : (transition.destinationFaceDown ?? false);
  if (hidden || !transition.flip) {
    return {
      initialFaceDown: destinationFaceDown,
      faceDown: destinationFaceDown,
      flipAt: null,
      flipInstant: false,
      departAt: delay,
    };
  }
  const under = transition.flip === "under";
  return {
    initialFaceDown: !destinationFaceDown,
    faceDown: destinationFaceDown,
    flipAt: under ? (transition.pileFlipAt ?? delay + FLIP_SECONDS) : delay,
    flipInstant: under,
    departAt: delay + FLIP_SECONDS,
  };
}

// ─── Flight geometry ─────────────────────────────────────────────────

/** Flight duration in ms for a straight-line distance in design px:
 *  `baseMs + msPerPx × distance`, clamped to [`minMs`, `maxMs`]. */
export function flightDurationMs(distance: number): number {
  const raw = cardTravel.baseMs + cardTravel.msPerPx * Math.abs(distance);
  return Math.min(cardTravel.maxMs, Math.max(cardTravel.minMs, raw));
}

export interface Point {
  x: number;
  y: number;
}

export interface FlightPose {
  x: number;
  y: number;
  /** Degrees: the base rotation plus the travel lean. */
  rotate: number;
  scale: number;
}

/** Unit vector perpendicular to the travel direction that the arc bulges
 *  along. It always points toward screen-up (negative y); a near-vertical
 *  move, which has no "up" side, consistently bulges toward screen-right. */
export function arcNormal(dx: number, dy: number): Point {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: 0, y: -1 };
  let nx = -dy / distance;
  let ny = dx / distance;
  if (ny > 0 || (Math.abs(ny) < 0.05 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx + 0, y: ny + 0 };
}

/** Peak perpendicular offset of the arc for a distance in design px. */
export function arcHeight(distance: number): number {
  return Math.min(
    cardTravel.arcRatio * Math.abs(distance),
    cardTravel.arcMaxPx
  );
}

/**
 * Where a travelling card is at eased progress `p` (0 → 1). Position is the
 * straight line plus a perpendicular `sin(πp)` arc; the card leans toward its
 * horizontal travel direction and grows slightly at the arc's peak. At `p = 0`
 * and `p = 1` the pose is exactly `from` / `to` with no lean or growth, so a
 * flight starts and lands without a jump.
 *
 * `reducedMotion` drops the arc, lean and growth: a plain straight line.
 */
export function flightPose(
  p: number,
  from: Point,
  to: Point,
  rotation: { from: number; to: number } = { from: 0, to: 0 },
  reducedMotion = false
): FlightPose {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const baseRotate = rotation.from + (rotation.to - rotation.from) * p;
  const x = from.x + dx * p;
  const y = from.y + dy * p;
  const distance = Math.hypot(dx, dy);
  if (reducedMotion || distance === 0) {
    return { x, y, rotate: baseRotate, scale: 1 };
  }
  const bump = Math.sin(Math.PI * p);
  const normal = arcNormal(dx, dy);
  const arc = arcHeight(distance) * bump;
  const lean = Math.max(-1, Math.min(1, dx / distance)) * cardTravel.leanMaxDeg;
  return {
    x: x + normal.x * arc,
    y: y + normal.y * arc,
    rotate: baseRotate + lean * bump,
    scale: 1 + cardTravel.peakScale * bump,
  };
}

// ─── Clock start ─────────────────────────────────────────────────────

/**
 * Run `callback` on the next animation frame and return a canceller. Flights
 * and flips start their clocks here rather than in the mounting effect, so a
 * long commit right after mount cannot swallow the start of the motion.
 * Without `requestAnimationFrame` (server, non-DOM tests) it runs at once.
 */
export function onNextFrame(callback: () => void): () => void {
  if (typeof requestAnimationFrame !== "function") {
    callback();
    return () => {};
  }
  const id = requestAnimationFrame(() => callback());
  return () => cancelAnimationFrame(id);
}
