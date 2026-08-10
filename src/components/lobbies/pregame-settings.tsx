"use client";

import { Lock } from "lucide-react";
import type {
  LobbyRoomMode,
  LobbyRoomPregameMode,
} from "@/lib/lobbies/state";
import { Label } from "@/components/ui";
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

export const SOLITAIRE_PREGAME_MODE_OPTIONS: ReadonlyArray<{
  value: LobbyRoomPregameMode;
  label: string;
  summary: string;
  explanation: string;
}> = [
  {
    value: "SIDE_A_FIRST",
    label: "Side A",
    summary: "Side A takes the first turn.",
    explanation:
      "Side A also resolves its start-of-game Leader effect first.",
  },
  {
    value: "SIDE_B_FIRST",
    label: "Side B",
    summary: "Side B takes the first turn.",
    explanation:
      "Side B also resolves its start-of-game Leader effect first.",
  },
  {
    value: "SOLITAIRE_RANDOM",
    label: "Random",
    summary: "Choose the first side privately when the game starts.",
    explanation:
      "The server flips a private coin. There is no dice result or turn-order prompt.",
  },
];

export function PregameSettings({
  mode = "PVP",
  value,
  editable,
  disabled = false,
  onChange,
}: {
  mode?: LobbyRoomMode;
  value: LobbyRoomPregameMode;
  editable: boolean;
  disabled?: boolean;
  onChange: (value: LobbyRoomPregameMode) => void;
}) {
  const solitaire = mode === "SOLITAIRE";
  const options = solitaire
    ? SOLITAIRE_PREGAME_MODE_OPTIONS
    : PREGAME_MODE_OPTIONS;

  return (
    <section aria-labelledby="pregame-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="pregame-settings-title"
            className="text-text-primary text-lg font-semibold"
          >
            {solitaire ? "Side to go first" : "Pre-game"}
          </h2>
          <p className="text-text-secondary mt-1 text-sm">
            {solitaire
              ? "Skip the priority roll and choose which side leads the test."
              : "Choose how the first player is decided before setup begins."}
          </p>
        </div>
        {!editable && (
          <span className="text-text-tertiary flex items-center gap-2 text-xs font-semibold tracking-widest uppercase">
            <Lock aria-hidden="true" className="size-4" />
            Host controlled
          </span>
        )}
      </div>

      <fieldset className="mt-5 space-y-1">
        <legend className="sr-only">
          {solitaire ? "Side to go first" : "Pre-game flow"}
        </legend>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Label
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
            </Label>
          );
        })}
      </fieldset>
    </section>
  );
}
