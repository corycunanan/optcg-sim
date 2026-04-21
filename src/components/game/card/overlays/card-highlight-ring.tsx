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
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-10 rounded",
        color === "selected" &&
          "ring-2 ring-gb-accent-green shadow-[0_0_10px_var(--gb-accent-green)]",
        color === "valid" && "ring-2 ring-gb-accent-amber/70",
        color === "invalid" && "ring-2 ring-gb-accent-red/70",
        className,
      )}
    />
  );
}
