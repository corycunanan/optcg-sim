"use client";

import React from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { flipTransition } from "./state-presets";

/**
 * Inner motion wrapper that holds both card faces in 3D space. `preserve-3d`
 * on this layer lets the front + back children sit on opposite sides of the
 * flip. `rotateY` is driven imperatively through `useAnimationControls` so
 * every `faceDown` transition triggers the `cardFlip` spring.
 *
 * Both faces are ALWAYS mounted — `faceDown` is a visual state, never a
 * separate render path. Under `prefers-reduced-motion` the flip collapses
 * to an instant swap via `flipTransition`.
 *
 * `flipFrom` (optional) seeds `initial` at the opposite face on mount.
 * Callers that know a flip just happened (e.g. `LifeZone` diffing prev vs.
 * current life state) pass the previous face so the mount-time animation
 * renders from the opposite side to the current `faceDown`. This is the
 * escape hatch for cases where motion.dev's animate-prop reconciliation
 * fails (Shirahoshi flipping life face-up in the same commit a Radix
 * Dialog portal opens) or the component genuinely remounts.
 */
export function CardFaces({
  faceDown,
  flipFrom,
  children,
  className,
}: {
  faceDown: boolean;
  flipFrom?: "UP" | "DOWN";
  children: React.ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const controls = useAnimationControls();
  const prevFaceDownRef = React.useRef<boolean | undefined>(undefined);

  // When flipFrom is set, mount starts from the opposite face. Otherwise
  // mount renders at the current face with no animation.
  const initialRotateY = React.useMemo(() => {
    if (flipFrom !== undefined) {
      return flipFrom === "DOWN" ? 180 : 0;
    }
    return faceDown ? 180 : 0;
  }, [flipFrom, faceDown]);

  // On mount, if flipFrom differs from current face, drive the animation
  // from initial (opposite) to target (current) explicitly. This covers the
  // "component just mounted after a flip" case.
  React.useEffect(() => {
    if (prevFaceDownRef.current === undefined) {
      prevFaceDownRef.current = faceDown;
      const flippedOnMount =
        flipFrom !== undefined &&
        (flipFrom === "DOWN") !== faceDown;
      if (flippedOnMount) {
        void controls.start(
          { rotateY: faceDown ? 180 : 0 },
          flipTransition(reducedMotion ?? false),
        );
      }
      return;
    }
    if (prevFaceDownRef.current === faceDown) return;
    prevFaceDownRef.current = faceDown;
    void controls.start(
      { rotateY: faceDown ? 180 : 0 },
      flipTransition(reducedMotion ?? false),
    );
  }, [faceDown, flipFrom, reducedMotion, controls]);

  return (
    <motion.div
      initial={{ rotateY: initialRotateY }}
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
