"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * `+N DON!!` corner badge. Shares its visual vocabulary with `CardCountBadge`
 * for consistency across corner counters. Positioning + counter-rotation are
 * owned by the parent in `Card.tsx` — this component just paints the pill.
 */
export function CardDonBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "rounded px-1 text-center text-xs font-bold",
        "bg-gb-board-dark/80 text-gb-text-bright",
        className,
      )}
    >
      +{count} DON!!
    </span>
  );
}
