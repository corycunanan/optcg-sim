"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * `+N DON` badge anchored to the bottom edge of a field card. Extracted from
 * the inline overlay that used to live on `board-card.tsx:183`. Sits above
 * the 3D face stack so it doesn't get clipped by `backface-visibility`.
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
    <div
      className={cn(
        "absolute bottom-0 left-0 right-0 z-10 py-1 text-center",
        "bg-gb-board-dark/75",
        className,
      )}
    >
      <span className="text-xs font-extrabold leading-none text-white">
        +{count} DON
      </span>
    </div>
  );
}
