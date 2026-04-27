"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * Small numeric count badge for stacked zones — life size, trash size, deck
 * size. Positioning + counter-rotation are owned by the parent in `Card.tsx`
 * — this component just paints the pill.
 */
export function CardCountBadge({
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
        "rounded px-1 text-center text-sm font-bold",
        "bg-gb-board-dark/80 text-gb-text-bright",
        className,
      )}
    >
      {count}
    </span>
  );
}
