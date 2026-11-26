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
    /** Field card hover: a plain scale-up. Short easeOut tween with no
     *  spring overshoot and no wiggle (the bounce + tilt-wiggle was removed
     *  as distracting, 2026-11-24). Lives on the card's *inner* motion layer
     *  (see `card.tsx`) so it composes with state rotation. */
    hover: {
      scale: 1.08,
      transition: { duration: 0.15, ease: "easeOut" as const },
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
    /** The shared card flip (OPT-1054): every event that turns a card over
     *  uses this one 300ms ease-in-out tween on `rotateY`. The pose that rides
     *  on it (lift, grow, tilt, edge shade, gloss) is `flipPose`. Reduced
     *  motion fallback is an instant face swap — see `flipTransition` in
     *  state-presets. */
    flip: {
      duration: 0.3,
      ease: [0.45, 0, 0.55, 1] as [number, number, number, number],
    },
    /** Pose of a card while it flips (OPT-1054), scaled by how edge-on the
     *  card is (`|sin(rotateY)|`, which peaks at the flip's midpoint): it
     *  lifts `liftPx`, grows by `scaleBoost`, tilts `tiltDeg`, its face
     *  darkens toward `shadeMax` opacity and a light gloss sweep rises toward
     *  `glossMax`. All return to zero when the card lies flat. */
    flipPose: {
      liftPx: 8,
      scaleBoost: 0.1,
      tiltDeg: 3,
      shadeMax: 0.75,
      glossMax: 0.8,
    },
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
    /** Floating POWER_MODIFIED feedback (OPT-284). The pill rises above the
     *  card while fading on the same clock as the transient event hook. */
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
     *  feedback. This composes with the single semantic highlight ring. */
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
    /** Hand card hover: lift + scale on the same short easeOut tween as
     *  the field hover. No spring overshoot, no wiggle. */
    handHover: {
      scale: 1.05,
      y: -8,
      transition: { duration: 0.15, ease: "easeOut" as const },
    },
  },
  flight: {
    /** Card travelling between zones (OPT-1054). A shallow arc: the path
     *  bulges toward screen-up by `arcRatio` of the distance at its midpoint,
     *  capped at `arcMaxPx`; the card leans up to `leanMaxDeg` toward its
     *  horizontal travel direction and grows by `peakScale` at the arc peak
     *  (both a `sin(πp)` bump on the eased progress). Duration scales with
     *  distance: `baseMs + msPerPx × distance`, clamped to
     *  [`minMs`, `maxMs`]. The ease decelerates into the landing with no
     *  overshoot. Distances are design px (1920-wide canvas). The arrival pop
     *  lives on the destination card (`cardEntry` spring on mount). */
    travel: {
      ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
      baseMs: 180,
      msPerPx: 0.12,
      minMs: 220,
      maxMs: 380,
      arcRatio: 0.06,
      arcMaxPx: 48,
      leanMaxDeg: 5,
      peakScale: 0.035,
    },
    /** Hand cards sliding to their new places when the hand gains or loses
     *  a card (OPT-274; shared by every hand branch since OPT-1054). Arriving
     *  cards re-read their placeholder slot every frame, so they land flush
     *  while the hand settles. */
    handReflow: { type: "spring" as const, stiffness: 320, damping: 28 },
    /** Start-time offsets between siblings of one batch (OPT-1054). Draws
     *  (and DON!! tokens) deal `drawMs` apart; moves into a stacked pile
     *  (deck, trash, Life) `pileMs` apart; any other travel keeps the
     *  original `defaultMs` (OPT-274). */
    stagger: {
      drawMs: 90,
      pileMs: 70,
      defaultMs: 60,
    },
    /** Card entering a zone (scale in) */
    zoneEnter: { type: "spring" as const, stiffness: 300, damping: 25 },
    /** Card leaving a zone (fade out) */
    zoneExit: { duration: 0.1, ease: "easeIn" as const },
    /** DON token flight from DON pool onto a target card (OPT-274). Since
     *  OPT-1054 it flies the shared travel arc (ease, lean, peak growth) at a
     *  fixed `durationMs`, with the arc capped lower (`arcMaxPx`, design px)
     *  because tokens are small and travel in sets. */
    donAttach: { durationMs: 260, arcMaxPx: 24 },
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
     *  It is slightly longer than the 70ms pile-move stagger. */
    aggregateWindowMs: 80,
    /** OPT-1055 deck shuffle, played in place on a face-down pile (Card
     *  Motion Lab "Shuffle deck"). Three slices riffle twice and square up,
     *  then the pile pops. Offsets are fractions of the pile's own size, so
     *  the same riffle reads the same on the board and in the mulligan. */
    riffle: {
      sliceCount: 3,
      /** One slice's riffle. Slices start `sliceStaggerMs` apart, so the
       *  whole riffle takes `totalMs`. */
      sliceMs: 390,
      sliceStaggerMs: 30,
      totalMs: 450,
      /** The pile pop that closes the shuffle (same shape as `pop`). */
      popMs: 200,
      ease: [0.45, 0, 0.55, 1] as const,
      /** Per-slice keyframes, bottom slice first. `x` is % of pile width,
       *  `y` % of pile height, `rotate` degrees. The two outer slices swing
       *  out opposite ways twice; the top slice only lifts. */
      slices: [
        {
          x: ["0%", "27%", "-27%", "0%", "27%", "-27%", "0%"],
          y: ["0%", "-3.5%", "0%", "-3.5%", "0%", "0%", "0%"],
          rotate: [0, 2.2, -2.2, 0, 2.2, -2.2, 0],
        },
        {
          x: ["0%", "-27%", "27%", "0%", "-27%", "27%", "0%"],
          y: ["0%", "0%", "-3.5%", "0%", "-3.5%", "0%", "0%"],
          rotate: [0, -2.2, 2.2, 0, -2.2, 2.2, 0],
        },
        {
          x: ["0%", "0%", "0%", "0%", "0%", "0%", "0%"],
          y: ["0%", "-2.4%", "-2.4%", "-2.4%", "-2.4%", "0%", "0%"],
          rotate: [0, 0, 0, 0, 0, 0, 0],
        },
      ],
    },
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
export const cardFlip = board.card.flip;
export const cardFlipPose = board.card.flipPose;
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
export const cardTravel = board.flight.travel;
export const cardStagger = board.flight.stagger;
export const handReflow = board.flight.handReflow;
export const pilePop = board.pile.pop;
export const pileDelta = board.pile.delta;
export const pileDeltaReduced = board.pile.deltaReduced;
export const pileReceiptAggregateWindowMs = board.pile.aggregateWindowMs;
export const deckRiffle = board.pile.riffle;
export const cardRest = board.stateChange.rest;
export const cardActivate = board.stateChange.activate;
