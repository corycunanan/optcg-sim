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
 * - motionPresets.board.pile — stacked-zone receipt feedback
 */

// Motion's public types widen literal easing names and require mutable
// keyframe arrays. Assertions in this token-only module preserve those
// library contracts; no external or runtime data enters here.

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
    /** Face-up ↔ face-down flip (OPT-276). ~300ms spring so the card lands
     *  before a follow-up state change overlays its own transition. Reduced
     *  motion fallback is instant — see `flipTransition` in state-presets. */
    flip: { type: "spring" as const, stiffness: 260, damping: 22 },
    /** Attacker ring pulse (OPT-273). Sustained loop on the highlight ring
     *  while a card is the designated attacker — opacity + scale breathe
     *  together so the ring reads as a pulse rather than a blinking stroke. */
    attackerPulse: {
      opacity: [0.6, 1, 0.6] as number[],
      scale: [1, 1.03, 1] as number[],
      transition: {
        duration: 1.4,
        ease: "easeInOut" as const,
        repeat: Infinity,
        repeatType: "loop" as const,
      },
    },
    /** Blocker-selection pop (OPT-273). One-shot scale+lift spring when a
     *  card enters `state="blocking"`. Matches the existing board spring feel
     *  — quick to register, no overshoot. */
    blockerHighlight: {
      scale: 1.04,
      y: -2,
      transition: { type: "spring" as const, stiffness: 360, damping: 22 },
    },
    /** KO shrink (OPT-273). Applied to the flight ghost when a card flies
     *  to trash after a `CARD_KO` event — scale dips + opacity blips so the
     *  vanish reads as "shrinks before flying", not "instant teleport". */
    ko: {
      scale: [1, 0.82, 0.95] as number[],
      opacity: [1, 0.7, 1] as number[],
      transition: {
        duration: 0.5,
        ease: "easeOut" as const,
        times: [0, 0.3, 1] as number[],
      },
    },
    /** Counter pulse (OPT-273). Transient ring flash on the defender when
     *  a counter is used — single fade-in / fade-out, no loop. Clears after
     *  ~480ms so the card returns to its normal battle state. */
    counterPulse: {
      opacity: [0, 1, 0] as number[],
      scale: [0.98, 1.06, 1.02] as number[],
      transition: {
        duration: 0.48,
        ease: "easeOut" as const,
        times: [0, 0.35, 1] as number[],
      },
    },
    /** Combat-victory pulse (OPT-283). A green one-shot ring separates the
     *  winner from the sustained amber battle pair; the horizontal keyframes
     *  add a short recoil before the glow settles. */
    winnerPulse: {
      opacity: [0, 1, 0.85, 0] as number[],
      scale: [0.98, 1.07, 1.02, 1] as number[],
      x: [0, -5, 3, 0] as number[],
      transition: {
        duration: 0.56,
        ease: "easeOut" as const,
        times: [0, 0.25, 0.55, 1] as number[],
      },
    },
    /** Attached-DON badge exit (OPT-284). The count pill stays upright outside
     *  the rotating card layer, then scales down slightly as it fades. */
    donBadgeExit: {
      opacity: 0,
      scale: 0.9,
      transition: { duration: 0.15, ease: "easeIn" as const },
    },
    /** Floating POWER_MODIFIED delta (OPT-284). The pill rises above the card
     *  while fading on the same clock as the transient event hook. */
    floatingPowerMod: {
      initial: { opacity: 0, y: 4, scale: 0.9 },
      animate: {
        opacity: [0, 1, 1, 0] as number[],
        y: [4, -4, -8, -12] as number[],
        scale: [0.9, 1.05, 1, 1] as number[],
      },
      transition: {
        duration: 0.76,
        ease: "easeOut" as const,
        times: [0, 0.18, 0.68, 1] as number[],
      },
    },
    /** Subtle color wash across the card art alongside the floating power
     *  delta. This composes with the single semantic highlight ring. */
    powerModifiedFlash: {
      opacity: [0, 0.3, 0] as number[],
      transition: {
        duration: 0.48,
        ease: "easeOut" as const,
        times: [0, 0.3, 1] as number[],
      },
    },
    /** EFFECTS_NEGATED feedback (OPT-284). A restrained, desaturated ring
     *  contracts onto the card before dimming away. */
    negatedRing: {
      opacity: [0, 0.8, 0.55, 0] as number[],
      scale: [1.04, 1, 1, 1.02] as number[],
      transition: {
        duration: 0.64,
        ease: "easeOut" as const,
        times: [0, 0.25, 0.7, 1] as number[],
      },
    },
    /** ATTACK_REDIRECTED feedback (OPT-284). clipPath reveals the amber ring
     *  from left to right so the new defender reads as a swept-in target. */
    redirectedSweep: {
      opacity: [0, 1, 1, 0] as number[],
      scale: [1, 1.04, 1.02, 1] as number[],
      clipPath: [
        "inset(0 100% 0 0)",
        "inset(0 0% 0 0)",
        "inset(0 0% 0 0)",
        "inset(0 0 0 100%)",
      ] as string[],
      transition: {
        duration: 0.56,
        ease: "easeOut" as const,
        times: [0, 0.35, 0.72, 1] as number[],
      },
    },
    /** Accepted life [Trigger] feedback (OPT-283). The owning Life zone gets
     *  a compact amber pulse after the optional Trigger is confirmed. */
    lifeTriggerPulse: {
      opacity: [0, 1, 0] as number[],
      scale: [0.98, 1.05, 1] as number[],
      transition: {
        duration: 0.56,
        ease: "easeOut" as const,
        times: [0, 0.3, 1] as number[],
      },
    },
    /** LIFE_SCRIED feedback (OPT-284). A cool inspection flash shares the
     *  Life-zone overlay shape without borrowing the Trigger's amber tone. */
    lifeScriedFlash: {
      opacity: [0, 0.8, 0] as number[],
      scale: [0.99, 1.03, 1] as number[],
      transition: {
        duration: 0.56,
        ease: "easeOut" as const,
        times: [0, 0.32, 1] as number[],
      },
    },
    /** Life-damage impact (OPT-283). Red flash + asymmetric shake reads as a
     *  hit rather than the celebratory amber Trigger pulse. */
    lifeDamageImpact: {
      x: [0, -6, 5, -3, 0] as number[],
      opacity: [1, 0.65, 1, 0.8, 1] as number[],
      transition: {
        duration: 0.42,
        ease: "easeOut" as const,
        times: [0, 0.2, 0.45, 0.7, 1] as number[],
      },
    },
    /** Server rejection: three short horizontal oscillations while the card
     *  flashes into the shared disabled treatment, then recovers. */
    reject: {
      x: [0, -4, 4, -4, 4, -4, 4, 0] as number[],
      opacity: [1, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 1] as number[],
      transition: { duration: 0.36, ease: "easeOut" as const },
    },
    /** Reduced-motion rejection: retain only the disabled-state flash. */
    rejectReduced: {
      opacity: [1, 0.35, 1] as number[],
      transition: { duration: 0.1, ease: "easeOut" as const },
    },
    /** Transform-class exit for cards that are destroyed or consumed
     *  (OPT-465). Dissolves at the source instead of implying that the card
     *  still exists along a travel path to the destination pile. */
    fizzle: {
      opacity: [1, 0] as number[],
      scale: [1, 0.85] as number[],
      y: [0, -12] as number[],
      transition: { duration: 0.36, ease: "easeOut" as const },
    },
    /** Reduced-motion transform exit: retain the state change as a short
     *  cross-fade without scale or spatial drift. */
    fizzleReduced: {
      opacity: [1, 0] as number[],
      transition: { duration: 0.1, ease: "easeOut" as const },
    },
    /** Summon entry (OPT-274). Pop-in after a card lands in its destination
     *  zone — scale up from 0.9 and fade from 0 with a short bouncy spring.
     *  Composes with whatever ambient state (active/rest/attacking) the
     *  destination renders in; the consumer wraps its outer motion.div with
     *  `initial={{ scale: 0.9, opacity: 0 }}`. Reduced-motion consumers omit
     *  the `initial` so the card just appears. */
    entry: {
      type: "spring" as const,
      stiffness: 360,
      damping: 18,
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
    /** Card flying between zones (OPT-274 tuned). Short easeOut tween —
     *  straight line, ~220ms. The arrival pop lives on the destination card
     *  (`cardEntry` spring on mount) so the flight itself stays snappy. */
    zoneMove: { duration: 0.22, ease: "easeOut" as const },
    /** Card entering a zone (scale in) */
    zoneEnter: { type: "spring" as const, stiffness: 300, damping: 25 },
    /** Card leaving a zone (fade out) */
    zoneExit: { duration: 0.1, ease: "easeIn" as const },
    /** DON token flight from DON pool onto a target card (OPT-274). Matches
     *  `zoneMove` timing so multi-flight batches read as a coherent set. */
    donAttach: { duration: 0.22, ease: "easeOut" as const },
  },
  pile: {
    /** Destination-pile receipt: one quick top-card pulse after a batch has
     *  fully arrived. A short rise plus critically damped spring settle keeps
     *  the full acknowledgment at 200ms without bounce. */
    pop: {
      peak: { scale: 1.06 },
      peakTransition: { duration: 0.06, ease: "easeOut" as const },
      settled: { scale: 1 },
      settleTransition: {
        type: "spring" as const,
        visualDuration: 0.14,
        bounce: 0,
      },
    },
    /** Floating +N arrival acknowledgment. The component supplies the text;
     *  this preset owns the full opacity + transform path. */
    delta: {
      initial: { opacity: 0, y: 0 },
      animate: {
        opacity: [0, 1, 1, 0] as number[],
        y: [0, -4, -12, -20] as number[],
      },
      transition: {
        duration: 0.7,
        ease: "easeOut" as const,
        times: [0, 0.15, 0.55, 1] as number[],
      },
    },
    /** Reduced-motion pile delta: preserve the count acknowledgment on the
     *  same clock, but remove all spatial movement. */
    deltaReduced: {
      initial: { opacity: 0 },
      animate: { opacity: [0, 1, 1, 0] as number[] },
      transition: {
        duration: 0.7,
        ease: "easeOut" as const,
        times: [0, 0.15, 0.55, 1] as number[],
      },
    },
    /** Debounce window for folding staggered siblings into one +N receipt.
     *  It is slightly longer than the 60ms flight stagger. */
    aggregateWindowMs: 80,
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
export const cardFlip = board.card.flip;
export const cardAttackerPulse = board.card.attackerPulse;
export const cardBlockerHighlight = board.card.blockerHighlight;
export const cardKO = board.card.ko;
export const cardCounterPulse = board.card.counterPulse;
export const cardWinnerPulse = board.card.winnerPulse;
export const donBadgeExit = board.card.donBadgeExit;
export const floatingPowerMod = board.card.floatingPowerMod;
export const powerModifiedFlash = board.card.powerModifiedFlash;
export const negatedRing = board.card.negatedRing;
export const redirectedSweep = board.card.redirectedSweep;
export const lifeTriggerPulse = board.card.lifeTriggerPulse;
export const lifeScriedFlash = board.card.lifeScriedFlash;
export const lifeDamageImpact = board.card.lifeDamageImpact;
export const cardReject = board.card.reject;
export const cardRejectReduced = board.card.rejectReduced;
export const cardFizzle = board.card.fizzle;
export const cardFizzleReduced = board.card.fizzleReduced;
export const cardEntry = board.card.entry;
export const handCardHover = board.card.handHover;
export const cardTransitions = board.flight;
export const pilePop = board.pile.pop;
export const pileDelta = board.pile.delta;
export const pileDeltaReduced = board.pile.deltaReduced;
export const pileReceiptAggregateWindowMs = board.pile.aggregateWindowMs;
export const cardRest = board.stateChange.rest;
export const cardActivate = board.stateChange.activate;
