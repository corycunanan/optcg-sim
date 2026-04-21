"use client";

import React from "react";
import { motion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Inner motion wrapper that holds both card faces in 3D space. `preserve-3d`
 * on this layer lets the front + back children sit on opposite sides of the
 * flip. `rotateY` is animated so flipping composes with every other state
 * transition through a single motion primitive.
 *
 * Both faces are ALWAYS mounted — `faceDown` becomes a visual state, never a
 * separate render path. This is the load-bearing piece for OPT-276's flip
 * animation work.
 */
export function CardFaces({
  faceDown,
  transition,
  children,
  className,
}: {
  faceDown: boolean;
  transition: Transition;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      animate={{ rotateY: faceDown ? 180 : 0 }}
      transition={transition}
      className={cn(
        "absolute inset-0 [transform-style:preserve-3d]",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
