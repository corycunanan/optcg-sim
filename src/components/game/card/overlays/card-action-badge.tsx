"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { CardActionBadgeState } from "../types";

export function CardActionBadge({
  state,
}: {
  state: CardActionBadgeState;
}) {
  return (
    <span
      aria-hidden
      data-effect-action-badge={state}
      className={cn(
        "rounded bg-gb-board-dark/80 px-1 text-base font-bold leading-none text-gb-signal-battle",
        state !== "available" && "opacity-40",
      )}
    >
      &#x26A1;
    </span>
  );
}
