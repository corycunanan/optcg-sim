"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

interface PriorityRollDisplayProps {
  rolls: [number, number] | null;
  priorityDeciderIndex: 0 | 1 | null;
  myIndex: 0 | 1 | null;
  children?: ReactNode;
}

/**
 * Renders the two d6 values from the pregame priority decision. While rolls
 * are null (during PRIORITY_ROLLING) shows spinning placeholders; once the
 * server broadcasts them the values land and the winner gets a highlight.
 */
export function PriorityRollDisplay({
  rolls,
  priorityDeciderIndex,
  myIndex,
  children,
}: PriorityRollDisplayProps) {
  const reduceMotion = useReducedMotion();
  const youWon = priorityDeciderIndex !== null && priorityDeciderIndex === myIndex;

  return (
    <div className="bg-gb-board/90 fixed inset-0 z-[200] flex flex-col items-center justify-center gap-8 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-gb-text-bright font-display text-3xl">
          Priority Decision
        </h2>
        <p className="text-gb-text-dim text-sm">
          Both players roll a d6 — high roll picks who goes first.
        </p>
      </div>

      <div className="flex items-center gap-12">
        <Die
          value={rolls?.[0] ?? null}
          highlight={priorityDeciderIndex === 0}
          reduceMotion={reduceMotion ?? false}
          label="Player 1"
        />
        <span className="text-gb-text-subtle text-2xl font-bold">vs</span>
        <Die
          value={rolls?.[1] ?? null}
          highlight={priorityDeciderIndex === 1}
          reduceMotion={reduceMotion ?? false}
          label="Player 2"
        />
      </div>

      {priorityDeciderIndex !== null && (
        <div className="flex flex-col items-center gap-2">
          <div className="text-gb-accent-amber text-sm font-bold uppercase tracking-widest">
            {youWon ? "You won the roll" : "Opponent won the roll"}
          </div>
          {!youWon && (
            <div className="text-gb-text-dim text-xs">
              Waiting for them to choose first or second…
            </div>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

interface DieProps {
  value: number | null;
  highlight: boolean;
  reduceMotion: boolean;
  label: string;
}

function Die({ value, highlight, reduceMotion, label }: DieProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        key={value ?? "rolling"}
        initial={value !== null && !reduceMotion ? { rotate: -25, scale: 0.6 } : false}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 18 }}
        className={cn(
          "flex h-24 w-24 items-center justify-center rounded-lg border-2 text-5xl font-bold",
          highlight
            ? "border-gb-accent-amber bg-gb-prompt-bg text-gb-accent-amber shadow-lg"
            : "border-gb-border-strong bg-gb-surface text-gb-text",
        )}
      >
        {value ?? "—"}
      </motion.div>
      <span className="text-gb-text-dim text-xs font-semibold uppercase tracking-widest">{label}</span>
    </div>
  );
}
