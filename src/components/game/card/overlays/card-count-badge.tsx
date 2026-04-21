"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * Small numeric count badge for stacked zones — life size, trash size, deck
 * size. Top-right corner when faceUp, bottom-right when on a sleeved back.
 */
export function CardCountBadge({
  count,
  position = "top-right",
  className,
}: {
  count: number;
  position?: "top-right" | "bottom-right";
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <div
      className={cn(
        "absolute z-10 rounded px-1 text-center text-xs font-bold",
        "bg-gb-board-dark/80 text-gb-text-bright",
        position === "top-right" ? "top-1 right-1" : "bottom-1 right-1",
        className,
      )}
    >
      {count}
    </div>
  );
}
