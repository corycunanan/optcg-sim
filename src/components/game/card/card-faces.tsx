"use client";

import React from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { flipTransition } from "./state-presets";

/**
 * Inner motion wrapper that holds both card faces in 3D space. `preserve-3d`
 * on this layer lets the front + back children sit on opposite sides of the
 * flip. `rotateY` is driven imperatively through `useAnimationControls` so
 * every `faceDown` transition triggers the `cardFlip` spring — even when
 * the flip happens in the same render as other tree changes (e.g. a Radix
 * Dialog portal opening) that historically kept the `animate` prop-change
 * detection from firing.
 *
 * Both faces are ALWAYS mounted — `faceDown` is a visual state, never a
 * separate render path. On mount the element renders at the correct angle
 * without animation. Under `prefers-reduced-motion` the flip collapses to
 * an instant swap via `flipTransition`.
 */
export function CardFaces({
  faceDown,
  children,
  className,
}: {
  faceDown: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const controls = useAnimationControls();
  const prevFaceDownRef = React.useRef<boolean | undefined>(undefined);

  React.useEffect(() => {
    // First commit: skip — the motion.div's `initial` already renders at
    // the correct rotateY, no animation needed.
    if (prevFaceDownRef.current === undefined) {
      prevFaceDownRef.current = faceDown;
      return;
    }
    if (prevFaceDownRef.current === faceDown) return;
    prevFaceDownRef.current = faceDown;
    void controls.start(
      { rotateY: faceDown ? 180 : 0 },
      flipTransition(reducedMotion ?? false),
    );
  }, [faceDown, reducedMotion, controls]);

  return (
    <motion.div
      initial={{ rotateY: faceDown ? 180 : 0 }}
      animate={controls}
      className={cn(
        "absolute inset-0 [transform-style:preserve-3d]",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
