"use client";

import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { FIELD_W, MID_ZONE_H } from "./constants";

/** Who the pill names. `null` before the first turn (pregame). */
export type TurnOwner = "me" | "opp" | 0 | 1 | null;

export function turnPillLabel(owner: TurnOwner): string | null {
  if (owner === null) return null;
  if (owner === "me") return "Your turn";
  if (owner === "opp") return "Opponent's turn";
  return `Player ${owner + 1}'s turn`;
}

/**
 * The only thing in the strip between the two fields (OPT-776). It slides in
 * when the turn changes and stays until the next change. Every control the
 * strip used to hold lives in the prompt panel.
 */
export const TurnPill = React.memo(function TurnPill({
  top,
  owner,
  turnNumber,
}: {
  top: number;
  owner: TurnOwner;
  turnNumber: number | null;
}) {
  const reducedMotion = useReducedMotion();
  const label = turnPillLabel(owner);
  const mine = owner === "me";

  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center overflow-hidden"
      style={{ left: 0, top, width: FIELD_W, height: MID_ZONE_H }}
      data-turn-strip=""
    >
      <AnimatePresence mode="wait" initial={false}>
        {label && (
          <motion.div
            key={`${String(owner)}-${turnNumber ?? 0}`}
            data-turn-pill={mine ? "me" : "opp"}
            role="status"
            aria-live="polite"
            initial={reducedMotion ? { opacity: 1 } : { x: -120, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { x: 120, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.35, ease: "easeOut" }}
            className={cn(
              "font-display rounded-lg border px-6 py-2 text-lg",
              mine
                ? "border-gb-accent-amber/60 bg-gb-accent-amber/15 text-gb-accent-amber"
                : "border-gb-border-strong bg-gb-surface text-gb-text-dim"
            )}
          >
            {label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
