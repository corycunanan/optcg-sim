"use client";

import React from "react";
import { cn } from "@/lib/utils";

const DEFAULT_SLEEVE_IMG = "/images/card-sleeves/ulti.jpg";

/**
 * Back face of the card. Two flavors:
 *   - `sleeveUrl` (or default) → real sleeve artwork for hand/deck/life.
 *   - no sleeve → subtle diagonal stripe pattern for generic face-down slots.
 *
 * Pre-rotated 180° so it sits on the opposite side of the 3D flip. Combined
 * with `backface-visibility: hidden` it is invisible until the flip completes.
 */
export function CardBack({
  sleeveUrl,
  showSleeveArt = true,
  className,
}: {
  sleeveUrl?: string | null;
  /** When false, render the stripe pattern instead of a sleeve image. */
  showSleeveArt?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden rounded border border-gb-border-strong",
        "[backface-visibility:hidden] [transform:rotateY(180deg)]",
        showSleeveArt ? "bg-gb-board-dark" : "bg-gb-surface-inset",
        className,
      )}
    >
      {showSleeveArt ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={sleeveUrl || DEFAULT_SLEEVE_IMG}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 opacity-15",
            "bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,currentColor_3px,currentColor_4px)]",
            "text-gb-border-strong",
          )}
        />
      )}
    </div>
  );
}
