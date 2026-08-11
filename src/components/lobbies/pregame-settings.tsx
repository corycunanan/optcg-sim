"use client";

import { Lock } from "lucide-react";
import type {
  LobbyRoomMode,
  LobbyRoomPregameMode,
} from "@/lib/lobbies/state";
import { Label, RadioGroup, RadioGroupItem } from "@/components/ui";
import { cn } from "@/lib/utils";

export const PREGAME_MODE_OPTIONS: ReadonlyArray<{
  value: LobbyRoomPregameMode;
  label: string;
  summary: string;
}> = [
  {
    value: "PRIORITY_ROLL",
    label: "Priority roll",
    summary: "Roll 2d6, then let the winner choose first or second.",
  },
  {
    value: "HOST_FIRST",
    label: "Host first",
    summary: "Skip the roll and make Side A the first player.",
  },
  {
    value: "GUEST_FIRST",
    label: "Guest first",
    summary: "Skip the roll and make Side B the first player.",
  },
  {
    value: "RANDOM_FIXED",
    label: "Random turn order",
    summary: "Choose the first player privately when the game starts.",
  },
];

export const SOLITAIRE_PREGAME_MODE_OPTIONS: ReadonlyArray<{
  value: LobbyRoomPregameMode;
  label: string;
  summary: string;
}> = [
  {
    value: "SIDE_A_FIRST",
    label: "Side A",
    summary: "Side A takes the first turn.",
  },
  {
    value: "SIDE_B_FIRST",
    label: "Side B",
    summary: "Side B takes the first turn.",
  },
  {
    value: "SOLITAIRE_RANDOM",
    label: "Random",
    summary: "Choose the first side privately when the game starts.",
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

      <fieldset className="mt-5">
        <legend className="sr-only">
          {solitaire ? "Side to go first" : "Pre-game flow"}
        </legend>
        <RadioGroup
          name="pregame-mode"
          value={value}
          disabled={!editable || disabled}
          onValueChange={(nextValue) =>
            onChange(nextValue as LobbyRoomPregameMode)
          }
        >
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
                <RadioGroupItem value={option.value} className="mt-1" />
                <span className="min-w-0 flex-1">
                  <span className="text-text-primary block text-sm font-semibold">
                    {option.label}
                  </span>
                  <span className="text-text-secondary mt-1 block text-xs">
                    {option.summary}
                  </span>
                </span>
              </Label>
            );
          })}
        </RadioGroup>
      </fieldset>
    </section>
  );
}
