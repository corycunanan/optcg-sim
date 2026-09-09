"use client";

import React from "react";
import type { CardDb, GameAction, PromptSourceCard } from "@shared/game-types";
import { Minus, Plus } from "lucide-react";
import { GameButton } from "./game-button";
import { EffectPromptDialog } from "./effect-prompt-dialog";

interface PlayerChoiceModalProps {
  effectDescription: string;
  sourceEffectDescription?: string;
  sourceCard?: PromptSourceCard;
  choices: { id: string; label: string; disabled?: boolean }[];
  donReturn?: {
    count: number;
    sources: Array<{
      id: string;
      label: string;
      max: number;
      kind: "COST_ACTIVE" | "COST_RESTED" | "ATTACHED";
    }>;
  };
  /** The prompt accepts a `skip` choice; Skip is enabled only then. */
  confirmOrSkip?: boolean;
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

/**
 * A discrete choice between named options. A row is selected first and then
 * submitted with Confirm; nothing is sent on the row click itself.
 */
export function PlayerChoiceModal({
  effectDescription,
  sourceEffectDescription,
  sourceCard,
  choices,
  donReturn,
  confirmOrSkip = false,
  cardDb,
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

  const submitChoice = () => {
    if (selectedChoiceId === null) return;
    onAction({ type: "PLAYER_CHOICE", choiceId: selectedChoiceId });
  };

  // Defensive safeguard: a single-choice PLAYER_CHOICE is a server-side bug
  // (CHOICE and CHOOSE_ONE_COST auto-select when only one branch/option is
  // payable). Auto-dispatch the lone choice and log so we notice in dev.
  const autoDispatchedRef = React.useRef(false);
  React.useEffect(() => {
    if (confirmOrSkip || choices.length !== 1 || autoDispatchedRef.current)
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

  const note = sourceEffectDescription ? (
    <p className="text-gb-text-dim text-sm">{sourceEffectDescription}</p>
  ) : undefined;

  if (donReturn) {
    return (
      <EffectPromptDialog
        effectDescription={effectDescription}
        sourceCard={sourceCard}
        cardDb={cardDb}
        isHidden={isHidden}
        onHide={onHide}
        onConfirm={submitDonReturn}
        confirmDisabled={selectedDonCount !== donReturn.count}
        note={note}
        status={`${selectedDonCount} of ${donReturn.count} selected`}
        className="sm:max-w-[400px]"
      >
        <div className="flex flex-col">
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
                    className="text-gb-text-bright text-center text-sm font-semibold"
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
                    onClick={() => updateDonSelection(source.id, 1, source.max)}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </GameButton>
                </div>
              </div>
            );
          })}
        </div>
      </EffectPromptDialog>
    );
  }

  return (
    <EffectPromptDialog
      effectDescription={effectDescription}
      sourceCard={sourceCard}
      cardDb={cardDb}
      isHidden={isHidden}
      onHide={onHide}
      onConfirm={submitChoice}
      confirmDisabled={selectedChoiceId === null}
      onSkip={
        confirmOrSkip
          ? () => onAction({ type: "PLAYER_CHOICE", choiceId: "skip" })
          : undefined
      }
      note={note}
      className="sm:max-w-[400px]"
    >
      <div className="flex flex-col gap-2">
        {choices.map((choice) => (
          <GameButton
            key={choice.id}
            variant={selectedChoiceId === choice.id ? "amber" : "secondary"}
            onClick={() => {
              if (!choice.disabled) setSelectedChoiceId(choice.id);
            }}
            disabled={choice.disabled}
            aria-pressed={selectedChoiceId === choice.id}
            className="h-auto w-full justify-start px-4 py-3 text-sm"
          >
            {choice.label}
            {choice.disabled ? " — Resolved" : ""}
          </GameButton>
        ))}
      </div>
    </EffectPromptDialog>
  );
}
