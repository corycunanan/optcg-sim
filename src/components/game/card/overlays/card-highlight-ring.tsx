"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { HighlightRingColor } from "../types";

/**
 * Absolutely-positioned ring that sits above the 3D face stack. Consumers
 * request it via `overlays.highlightRing`, decoupling selection/validation
 * feedback from the underlying motion state.
 */
export function CardHighlightRing({
  color,
  className,
}: {
  color: HighlightRingColor;
  className?: string;
}) {
  // `selected` / `invalid` intentionally render no visual treatment for now —
  // consumers will define their own feedback in downstream tickets. Only the
  // `valid` drop-target affordance still draws a ring.
  if (color !== "valid") return null;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-10 rounded ring-2 ring-gb-accent-amber/70",
        className,
      )}
    />
  );
}
