"use client";

import { Lock } from "lucide-react";
import type { LobbyRoomPregameMode } from "@/lib/lobbies/state";
import { cn } from "@/lib/utils";

export const PREGAME_MODE_OPTIONS: ReadonlyArray<{
  value: LobbyRoomPregameMode;
  label: string;
  summary: string;
  explanation: string;
}> = [
  {
    value: "PRIORITY_ROLL",
    label: "Priority roll",
    summary: "Roll 2d6, then let the winner choose first or second.",
    explanation:
      "The standard competitive flow. Ties reroll automatically before the winner chooses turn order.",
  },
  {
    value: "HOST_FIRST",
    label: "Host first",
    summary: "Skip the roll and make Side A the first player.",
    explanation:
      "Side A also becomes the priority decider for start-of-game effect ordering.",
  },
  {
    value: "GUEST_FIRST",
    label: "Guest first",
    summary: "Skip the roll and make Side B the first player.",
    explanation:
      "Side B also becomes the priority decider for start-of-game effect ordering.",
  },
  {
    value: "RANDOM_FIXED",
    label: "Random turn order",
    summary: "Choose the first player privately when the game starts.",
    explanation:
      "The server flips a private coin. There is no dice result or first-or-second prompt.",
  },
];

export function PregameSettings({
  value,
  editable,
  disabled = false,
  onChange,
}: {
  value: LobbyRoomPregameMode;
  editable: boolean;
  disabled?: boolean;
  onChange: (value: LobbyRoomPregameMode) => void;
}) {
  return (
    <section
      className="border-border bg-surface-1 rounded-lg border p-5"
      aria-labelledby="pregame-settings-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="pregame-settings-title"
            className="text-text-primary text-lg font-semibold"
          >
            Pre-game
          </h2>
          <p className="text-text-secondary mt-1 text-sm">
            Choose how the first player is decided before setup begins.
          </p>
        </div>
        {!editable && (
          <span className="text-text-tertiary flex items-center gap-2 text-xs font-semibold uppercase">
            <Lock aria-hidden="true" className="size-4" />
            Host controlled
          </span>
        )}
      </div>

      <fieldset className="border-border divide-border mt-5 divide-y rounded-md border">
        <legend className="sr-only">Pre-game flow</legend>
        {PREGAME_MODE_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-16 cursor-pointer items-start gap-3 px-4 py-3 transition-colors",
                selected && "bg-surface-2",
                (!editable || disabled) && "cursor-default",
              )}
            >
              <input
                type="radio"
                name="pregame-mode"
                value={option.value}
                checked={selected}
                disabled={!editable || disabled}
                onChange={() => onChange(option.value)}
                className="accent-navy-900 mt-1 size-4 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="text-text-primary block text-sm font-semibold">
                  {option.label}
                </span>
                <span className="text-text-secondary mt-1 block text-xs">
                  {option.summary}
                </span>
                <span className="text-text-tertiary mt-1 block text-xs">
                  {option.explanation}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}
