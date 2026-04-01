/**
 * Motion presets — shared animation constants for motion.dev
 * Values from docs/design/BRANDING-GUIDELINES.md Section 9
 */

export const transitions = {
  /** 150ms ease-out — button press, toggle, checkbox */
  micro: { duration: 0.15, ease: "easeOut" as const },
  /** 200ms ease-out — hover states, tooltips, dropdowns */
  standard: { duration: 0.2, ease: "easeOut" as const },
  /** Spring — modal enter, card flip, page element reveal */
  emphasis: { type: "spring" as const, stiffness: 300, damping: 25 },
  /** 150ms ease-in — modal close, toast dismiss, dropdown close */
  exit: { duration: 0.15, ease: "easeIn" as const },
} as const;

export const variants = {
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

export const springs = {
  /** Fast, precise — dropdowns, tooltips */
  snappy: { type: "spring" as const, stiffness: 400, damping: 30 },
  /** Smooth, relaxed — page transitions, cards */
  gentle: { type: "spring" as const, stiffness: 200, damping: 20 },
  /** Lively, playful — card gallery modal, game board elements */
  bouncy: { type: "spring" as const, stiffness: 300, damping: 15 },
} as const;

// ─── Game Board Card Animations ──────────────────────────────────────────────

export const cardTransitions = {
  /** Card flying between zones */
  zoneMove: { type: "spring" as const, stiffness: 250, damping: 28 },
  /** Card entering a zone (scale in) */
  zoneEnter: { type: "spring" as const, stiffness: 300, damping: 25 },
  /** Card leaving a zone (fade out) */
  zoneExit: { duration: 0.1, ease: "easeIn" as const },
} as const;

/** Field card hover: scale(1.03), 200ms ease-out */
export const cardHover = {
  scale: 1.03,
  transition: { duration: 0.2, ease: "easeOut" as const },
} as const;

/** Field card tap: scale(0.97), 150ms ease-out */
export const cardTap = {
  scale: 0.97,
  transition: { duration: 0.15, ease: "easeOut" as const },
} as const;

/** Hand card hover: lift + scale, 200ms ease-out */
export const handCardHover = {
  scale: 1.05,
  y: -8,
  transition: { duration: 0.2, ease: "easeOut" as const },
} as const;
