"use client";

import React from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { onNextFrame } from "@/lib/game/card-motion";
import { cardFlipPose } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { faceDownRotateY, flipTransition } from "./state-presets";
import type { CardFlipFrom } from "./types";

/** How edge-on the card is: 0 lying flat (either side up), 1 at 90°. */
function edgeOn(rotateY: number): number {
  const edge = Math.abs(Math.sin((rotateY * Math.PI) / 180));
  // sin(180°) is ~1e-16 in floating point; a card lying flat is exactly 0.
  return edge < 1e-6 ? 0 : edge;
}

/**
 * Inner motion wrapper that holds both card faces in 3D space and owns the
 * shared card flip (OPT-276, reworked by OPT-1054). `preserve-3d` on this
 * layer lets the front + back children sit on opposite sides of the flip.
 *
 * The flip is one 300ms ease-in-out tween on `rotateY` (`cardFlip`). Every
 * other part of the flip pose is derived from that single angle, so it can
 * never drift out of step and an interrupted flip reverses without a jump:
 * as the card turns edge-on (`|sin(rotateY)|`, peaking at the midpoint) it
 * lifts, grows and tilts slightly (`cardFlipPose`), each face darkens and a
 * light gloss sweeps across it.
 *
 * Both faces are ALWAYS mounted — `faceDown` is a visual state, never a
 * separate render path. `flipFrom` mounts the card on the other side and
 * turns it after a delay (flight ghosts flip where they stand before they
 * travel). Under `prefers-reduced-motion` the flip is an instant face swap
 * with no lift, tilt, shade or gloss.
 */
export function CardFaces({
  faceDown,
  flipFrom,
  children,
  className,
}: {
  faceDown: boolean;
  flipFrom?: CardFlipFrom;
  children: React.ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const target = faceDownRotateY(faceDown);
  const rotateY = useMotionValue(
    faceDownRotateY(flipFrom ? flipFrom.faceDown : faceDown)
  );
  const edge = useTransform(rotateY, edgeOn);
  // Reduced motion swaps faces instantly, so `edge` stays 0 and these rest.
  const y = useTransform(edge, (e) => -cardFlipPose.liftPx * e);
  const scale = useTransform(edge, (e) => 1 + cardFlipPose.scaleBoost * e);
  const rotate = useTransform(edge, (e) => cardFlipPose.tiltDeg * e);
  const shade = useTransform(edge, (e) => cardFlipPose.shadeMax * e);
  const gloss = useTransform(edge, (e) => cardFlipPose.glossMax * e);

  // The scheduled `flipFrom` delay counts from the first painted frame after
  // mount — the same clock the flight layer starts on — so a long commit
  // cannot eat the start of the flip. Refs survive StrictMode's effect
  // replay, so a replayed effect resumes the remaining wait instead of
  // restarting (or skipping) it.
  const startedAtRef = React.useRef<number | null>(null);
  const flipDelay = flipFrom?.delay ?? 0;
  const flipInstant = flipFrom?.instant ?? false;
  // The shade and gloss layers exist only while a flip is pending or
  // running, so a resting card carries no extra layers. A pending flip is
  // read from props and the current angle during render, so the layers are
  // in the same commit that schedules the flip (shade from its first frame)
  // and the server and first client render agree. `flipping` keeps them
  // mounted until the tween completes.
  const [flipping, setFlipping] = React.useState(false);
  const instantFlip = reducedMotion || flipInstant;
  const showFlipLayers =
    !instantFlip && (flipping || rotateY.get() !== target);

  React.useEffect(() => {
    let controls: { stop: () => void } | null = null;
    const cancelStart = onNextFrame(() => {
      const now = performance.now();
      startedAtRef.current ??= now;
      if (rotateY.get() === target) return;
      const elapsed = (now - startedAtRef.current) / 1000;
      const delay = Math.max(0, flipDelay - elapsed);
      const instant = reducedMotion || flipInstant;
      const base = flipTransition(instant);
      if (!instant) setFlipping(true);
      controls = animate(rotateY, target, {
        ...base,
        delay,
        onComplete: () => setFlipping(false),
      });
    });
    return () => {
      cancelStart();
      controls?.stop();
    };
  }, [target, rotateY, flipDelay, flipInstant, reducedMotion]);

  return (
    <motion.div
      data-card-faces=""
      style={{ rotateY, y, scale, rotate }}
      className={cn(
        "absolute inset-0 [transform-style:preserve-3d]",
        className
      )}
    >
      {children}
      {/* Edge shade + gloss, one pair per face, mounted only while a flip
          runs (never for an instant swap). Each pair sits on its face's side
          of the card (the back pair is pre-rotated 180°) and hides its
          backface, so only the visible face darkens. */}
      {showFlipLayers && (
        <>
          <motion.div
            aria-hidden
            className="gb-card-flip-shade rounded-card pointer-events-none absolute inset-0 [transform:translateZ(1px)] [backface-visibility:hidden]"
            style={{ opacity: shade }}
          />
          <motion.div
            aria-hidden
            className="gb-card-flip-gloss rounded-card pointer-events-none absolute inset-0 [transform:translateZ(1px)] [backface-visibility:hidden]"
            style={{ opacity: gloss }}
          />
          <motion.div
            aria-hidden
            className="gb-card-flip-shade rounded-card pointer-events-none absolute inset-0 [transform:rotateY(180deg)_translateZ(1px)] [backface-visibility:hidden]"
            style={{ opacity: shade }}
          />
          <motion.div
            aria-hidden
            className="gb-card-flip-gloss rounded-card pointer-events-none absolute inset-0 [transform:rotateY(180deg)_translateZ(1px)] [backface-visibility:hidden]"
            style={{ opacity: gloss }}
          />
        </>
      )}
    </motion.div>
  );
}
