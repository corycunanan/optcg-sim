"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { SQUARE } from "./constants";

/**
 * Bordered square placeholder for a zone that currently has no card
 * (empty leader / opponent character / etc). Mirrors the visual language of
 * `DroppableCharSlot` without the dnd-kit droppable wiring.
 */
export const EmptySlot = React.memo(function EmptySlot({
  label,
  style,
  className,
}: {
  label: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      style={{ ...style, width: SQUARE, height: SQUARE }}
      className={cn(
        "flex items-center justify-center rounded-md border border-gb-border-strong/30",
        className,
      )}
    >
      <span className="text-sm font-bold text-gb-text-dim/40 leading-none select-none uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
});
