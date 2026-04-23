"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { flipTransition } from "./state-presets";

/**
 * Inner motion wrapper that holds both card faces in 3D space. `preserve-3d`
 * on this layer lets the front + back children sit on opposite sides of the
 * flip. `rotateY` is animated through the dedicated `cardFlip` spring so the
 * flip composes cleanly with every other state transition through a single
 * motion primitive — a card flipping mid-flight or mid-rest doesn't inherit
 * the ambient state spring.
 *
 * Both faces are ALWAYS mounted — `faceDown` is a visual state, never a
 * separate render path. Under `prefers-reduced-motion` the flip collapses
 * to an instant swap.
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
  return (
    <motion.div
      animate={{ rotateY: faceDown ? 180 : 0 }}
      transition={flipTransition(reducedMotion ?? false)}
      className={cn(
        "absolute inset-0 [transform-style:preserve-3d]",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
