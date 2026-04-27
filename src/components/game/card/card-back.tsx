"use client";

import React from "react";
import { cn } from "@/lib/utils";

const DEFAULT_SLEEVE_IMG = "/images/card-sleeves/ulti.jpg";

/**
 * Back face of the card — sleeve artwork. Pre-rotated 180° so it sits on the
 * opposite side of the 3D flip; `backface-visibility: hidden` keeps it
 * invisible until the flip completes.
 */
export function CardBack({
  sleeveUrl,
  label,
  className,
}: {
  sleeveUrl?: string | null;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden rounded border border-gb-border-strong",
        "[backface-visibility:hidden] [transform:rotateY(180deg)]",
        "bg-gb-board-dark",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sleeveUrl || DEFAULT_SLEEVE_IMG}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      {label && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gb-text-dim/40 select-none uppercase tracking-wider">
          {label}
        </span>
      )}
    </div>
  );
}
