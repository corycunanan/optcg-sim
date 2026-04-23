/**
 * Motion presets — shared animation constants for motion.dev
 * Values from docs/design/BRANDING-GUIDELINES.md Section 9
 *
 * Organized by domain:
 * - motionPresets.transitions — duration-based timing
 * - motionPresets.springs — spring physics
 * - motionPresets.variants — enter/exit animation states
 * - motionPresets.board.card — hover, tap, hand interactions
 * - motionPresets.board.flight — zone-to-zone card movement
 */

// ─── UI Transitions ──────────────────────────────────────────────────

const transitions = {
  /** 150ms ease-out — button press, toggle, checkbox */
  micro: { duration: 0.15, ease: "easeOut" as const },
  /** 200ms ease-out — hover states, tooltips, dropdowns */
  standard: { duration: 0.2, ease: "easeOut" as const },
  /** Spring — modal enter, card flip, page element reveal */
  emphasis: { type: "spring" as const, stiffness: 300, damping: 25 },
  /** 150ms ease-in — modal close, toast dismiss, dropdown close */
  exit: { duration: 0.15, ease: "easeIn" as const },
} as const;

// ─── Spring Physics ──────────────────────────────────────────────────

const springs = {
  /** Fast, precise — dropdowns, tooltips */
  snappy: { type: "spring" as const, stiffness: 400, damping: 30 },
  /** Smooth, relaxed — page transitions, cards */
  gentle: { type: "spring" as const, stiffness: 200, damping: 20 },
  /** Lively, playful — card gallery modal, game board elements */
  bouncy: { type: "spring" as const, stiffness: 300, damping: 15 },
} as const;

// ─── Animation Variants ──────────────────────────────────────────────

const variants = {
  fadeIn: { initial: { opacity: 0 }, animate: { opacity: 1 } },
  fadeOut: { exit: { opacity: 0 } },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
  },
  slideUp: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
  },
  slideDown: {
    initial: { opacity: 0, y: -16 },
    animate: { opacity: 1, y: 0 },
  },
} as const;

// ─── Game Board ──────────────────────────────────────────────────────

const board = {
  card: {
    /** Field card hover: scale bounce + a single back-and-forth tilt.
     *  Springs in, tweens out. The `rotate` keyframes live on the card's
     *  *inner* motion layer (see `card.tsx`) so the wiggle is additive to
     *  state rotation (e.g. a rested card wiggles around 90°, not 0°). */
    hover: {
      scale: 1.08,
      rotate: [0, 1.2, -1.2, 0] as number[],
      transition: {
        scale: { type: "spring" as const, stiffness: 420, damping: 13 },
        rotate: { duration: 0.55, ease: "easeInOut" as const },
      },
    },
    /** Field card tap: scale-down + 3D `rotateX` dip, ~120ms (OPT-275).
     *  Composes with the outer state rotation (rest = rotateZ 90°) and with
     *  the pointer-driven tilt — dip takes priority briefly, then reverts. */
    tap: {
      scale: 0.96,
      rotateX: -6,
      transition: { duration: 0.12, ease: "easeOut" as const },
    },
    /** `prefers-reduced-motion` fallback for tap — plain scale, no 3D dip. */
    tapReduced: {
      scale: 0.96,
      transition: { duration: 0.12, ease: "easeOut" as const },
    },
    /** Balatro-style passive breathing (OPT-275). Subtle drift + scale pulse,
     *  3.5s loop. Applied on a dedicated motion layer inside state rotation
     *  so hover/tap composes on top without clobbering the loop. */
    breathing: {
      y: [0, -2, 0] as number[],
      scale: [1, 1.008, 1] as number[],
      transition: {
        duration: 3.5,
        ease: "easeInOut" as const,
        repeat: Infinity,
        repeatType: "loop" as const,
      },
    },
    /** Hand card hover: lift + scale, same spring-in / tween-out shape,
     *  same wiggle. */
    handHover: {
      scale: 1.05,
      y: -8,
      rotate: [0, 1.2, -1.2, 0] as number[],
      transition: {
        scale: { type: "spring" as const, stiffness: 420, damping: 13 },
        y: { type: "spring" as const, stiffness: 420, damping: 13 },
        rotate: { duration: 0.55, ease: "easeInOut" as const },
      },
    },
  },
  flight: {
    /** Card flying between zones */
    zoneMove: { type: "spring" as const, stiffness: 250, damping: 28 },
    /** Card entering a zone (scale in) */
    zoneEnter: { type: "spring" as const, stiffness: 300, damping: 25 },
    /** Card leaving a zone (fade out) */
    zoneExit: { duration: 0.1, ease: "easeIn" as const },
  },
  stateChange: {
    /** Resting (attack/block/cost): decisive, snappy */
    rest: { type: "spring" as const, stiffness: 300, damping: 25 },
    /** Activating (refresh): slight bounce, feels refreshing */
    activate: { type: "spring" as const, stiffness: 300, damping: 18 },
  },
} as const;

// ─── Combined Export ─────────────────────────────────────────────────

export const motionPresets = {
  transitions,
  springs,
  variants,
  board,
} as const;

// ─── Convenience re-exports for board components ─────────────────────
// These keep import sites concise while the namespace exists for discovery.

export const cardHover = board.card.hover;
export const cardTap = board.card.tap;
export const cardTapReduced = board.card.tapReduced;
export const cardBreathing = board.card.breathing;
export const handCardHover = board.card.handHover;
export const cardTransitions = board.flight;
export const cardRest = board.stateChange.rest;
export const cardActivate = board.stateChange.activate;
