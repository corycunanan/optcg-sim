"use client";

import React from "react";
import type { GameAction } from "@shared/game-types";
import { Minus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { GameButton } from "./game-button";

interface PlayerChoiceModalProps {
  effectDescription: string;
  choices: { id: string; label: string }[];
  donReturn?: {
    count: number;
    sources: Array<{
      id: string;
      label: string;
      max: number;
      kind: "COST_ACTIVE" | "COST_RESTED" | "ATTACHED";
    }>;
  };
  confirmOrSkip?: boolean;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

export function PlayerChoiceModal({
  effectDescription,
  choices,
  donReturn,
  confirmOrSkip = false,
  isHidden,
  onHide,
  onAction,
}: PlayerChoiceModalProps) {
  const [donSelection, setDonSelection] = React.useState<
    Record<string, number>
  >({});
  const [selectedChoiceId, setSelectedChoiceId] = React.useState<string | null>(
    null
  );
  const selectedDonCount = Object.values(donSelection).reduce(
    (sum, count) => sum + count,
    0
  );

  const updateDonSelection = (sourceId: string, delta: number, max: number) => {
    setDonSelection((current) => {
      const currentValue = current[sourceId] ?? 0;
      const nextValue = Math.max(0, Math.min(max, currentValue + delta));
      const currentTotal = Object.values(current).reduce(
        (sum, count) => sum + count,
        0
      );
      if (
        donReturn &&
        currentTotal - currentValue + nextValue > donReturn.count
      )
        return current;
      return { ...current, [sourceId]: nextValue };
    });
  };

  const submitDonReturn = () => {
    if (!donReturn || selectedDonCount !== donReturn.count) return;
    const activeCount = donSelection["cost-active"] ?? 0;
    const attached = donReturn.sources
      .filter(
        (source) =>
          source.kind === "ATTACHED" && (donSelection[source.id] ?? 0) > 0
      )
      .map((source) => `${source.id}=${donSelection[source.id] ?? 0}`)
      .join(",");
    const choiceId = attached
      ? `don-return:${activeCount}:${donReturn.count}:${attached}`
      : `don-return:${activeCount}:${donReturn.count}`;
    if (choices.some((choice) => choice.id === choiceId)) {
      onAction({ type: "PLAYER_CHOICE", choiceId });
    }
  };

  // Defensive safeguard: a single-choice PLAYER_CHOICE is a server-side bug
  // (CHOICE and CHOOSE_ONE_COST auto-select when only one branch/option is
  // payable). Auto-dispatch the lone choice and log so we notice in dev.
  const autoDispatchedRef = React.useRef(false);
  React.useEffect(() => {
    if (
      confirmOrSkip ||
      choices.length !== 1 ||
      autoDispatchedRef.current
    )
      return;
    autoDispatchedRef.current = true;
    const [only] = choices;
    console.warn(
      "[PlayerChoiceModal] Received single-choice prompt from server — " +
        "server should auto-select when only one option is payable. " +
        "Auto-dispatching the only choice as a safe fallback.",
      { choiceId: only.id, label: only.label }
    );
    onAction({ type: "PLAYER_CHOICE", choiceId: only.id });
  }, [choices, confirmOrSkip, onAction]);

  if (!confirmOrSkip && choices.length <= 1) return null;

  return (
    <Dialog
      open={!isHidden}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="bg-gb-surface border-gb-border-strong text-gb-text flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[400px]"
      >
        <DialogHeader className="border-gb-border flex-row items-center justify-between space-y-0 border-b px-4 py-3">
          <DialogTitle className="text-gb-text-bright text-sm font-bold">
            {effectDescription}
          </DialogTitle>
          <GameButton variant="ghost" size="sm" onClick={onHide}>
            Hide
          </GameButton>
        </DialogHeader>

        {donReturn ? (
          <>
            <div className="overflow-y-auto px-4 py-2">
              {donReturn.sources.map((source) => {
                const value = donSelection[source.id] ?? 0;
                return (
                  <div
                    key={source.id}
                    className="border-gb-border flex min-h-12 items-center justify-between gap-4 border-b py-2 last:border-b-0"
                  >
                    <span className="text-gb-text text-sm">{source.label}</span>
                    <div className="grid shrink-0 grid-cols-[2rem_2rem_2rem] items-center">
                      <GameButton
                        variant="secondary"
                        size="sm"
                        className="size-8 p-0"
                        disabled={value === 0}
                        aria-label={`Remove one from ${source.label}`}
                        onClick={() =>
                          updateDonSelection(source.id, -1, source.max)
                        }
                      >
                        <Minus className="size-4" aria-hidden="true" />
                      </GameButton>
                      <span
                        className="text-gb-text-bright text-center text-sm font-bold"
                        aria-live="polite"
                      >
                        {value}
                      </span>
                      <GameButton
                        variant="secondary"
                        size="sm"
                        className="size-8 p-0"
                        disabled={
                          value === source.max ||
                          selectedDonCount === donReturn.count
                        }
                        aria-label={`Add one from ${source.label}`}
                        onClick={() =>
                          updateDonSelection(source.id, 1, source.max)
                        }
                      >
                        <Plus className="size-4" aria-hidden="true" />
                      </GameButton>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-gb-border flex items-center justify-between gap-4 border-t px-4 py-3">
              <span className="text-gb-text-dim text-xs">
                {selectedDonCount} of {donReturn.count} selected
              </span>
              <GameButton
                variant="amber"
                disabled={selectedDonCount !== donReturn.count}
                onClick={submitDonReturn}
              >
                Return DON!!
              </GameButton>
            </div>
          </>
        ) : confirmOrSkip ? (
          <>
            <div className="flex flex-col gap-2 overflow-y-auto px-4 py-4">
              {choices.map((choice) => (
                <GameButton
                  key={choice.id}
                  variant={
                    selectedChoiceId === choice.id ? "amber" : "secondary"
                  }
                  onClick={() => setSelectedChoiceId(choice.id)}
                  aria-pressed={selectedChoiceId === choice.id}
                  className="h-auto w-full justify-start px-4 py-3 text-sm"
                >
                  {choice.label}
                </GameButton>
              ))}
            </div>
            <div className="border-gb-border flex items-center justify-end gap-2 border-t px-4 py-3">
              <GameButton
                variant="secondary"
                onClick={() =>
                  onAction({ type: "PLAYER_CHOICE", choiceId: "skip" })
                }
              >
                Skip
              </GameButton>
              <GameButton
                variant="amber"
                disabled={selectedChoiceId === null}
                onClick={() => {
                  if (selectedChoiceId === null) return;
                  onAction({
                    type: "PLAYER_CHOICE",
                    choiceId: selectedChoiceId,
                  });
                }}
              >
                Confirm
              </GameButton>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto px-4 py-4">
            {choices.map((choice) => (
              <GameButton
                key={choice.id}
                variant="secondary"
                onClick={() =>
                  onAction({ type: "PLAYER_CHOICE", choiceId: choice.id })
                }
                className="h-auto w-full justify-start px-4 py-3 text-sm"
              >
                {choice.label}
              </GameButton>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
