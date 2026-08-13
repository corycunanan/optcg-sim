"use client";

import React, { useId, useState } from "react";
import type {
  CardDb,
  CardInstance,
  GameAction,
  SelectTargetPrompt,
} from "@shared/game-types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  TooltipProvider,
} from "@/components/ui";
import {
  buildTargetSelectionModel,
  type TargetCardSelectionState,
} from "@/lib/game/target-selection";
import { GameButton } from "./game-button";
import { Card } from "./card";
import { useRovingFocus } from "@/hooks/use-roving-focus";

const CARD_W = 80;

function TargetCard({
  card,
  cardDb,
  selection,
  onToggle,
  rovingTabIndex,
  onRovingFocus,
  onRovingKeyDown,
  setRovingRef,
}: {
  card: CardInstance;
  cardDb: CardDb;
  selection: TargetCardSelectionState;
  onToggle: () => void;
  rovingTabIndex: number;
  onRovingFocus: () => void;
  onRovingKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  setRovingRef: (node: HTMLButtonElement | null) => void;
}) {
  const blocked = selection.disabledReason !== null;
  const descriptionId = useId();
  const cardName = cardDb[card.cardId]?.name ?? card.cardId;

  return (
    <button
      type="button"
      ref={setRovingRef}
      tabIndex={rovingTabIndex}
      aria-label={[
        cardName,
        card.state === "RESTED" ? "rested" : "active",
        selection.selected
          ? "selected"
          : selection.eligible
            ? "eligible for selection"
            : null,
      ]
        .filter(Boolean)
        .join(". ")}
      aria-pressed={selection.selected}
      aria-disabled={blocked}
      aria-describedby={blocked ? descriptionId : undefined}
      onFocus={onRovingFocus}
      onKeyDown={onRovingKeyDown}
      onClick={() => {
        if (!blocked) onToggle();
      }}
      title={selection.disabledReason ?? undefined}
      className={cn(
        "focus-visible:ring-gb-signal-eligible relative shrink-0 rounded border-0 bg-transparent p-0 text-left transition-[box-shadow] duration-150 select-none focus-visible:ring-2 focus-visible:outline-none",
        blocked && "cursor-not-allowed opacity-30",
        !blocked &&
          selection.selected &&
          "ring-gb-signal-selected cursor-pointer ring-2 ring-offset-1 ring-offset-transparent",
        !blocked && !selection.selected && "cursor-pointer"
      )}
    >
      <Card
        variant="modal"
        size="field"
        data={{ card, cardId: card.cardId, cardDb }}
        interaction={{ tooltipDisabled: blocked }}
      />
      {selection.selected && (
        <div
          aria-hidden="true"
          className="bg-gb-signal-selected absolute top-1 right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5l2 2 4-4"
              stroke="black"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      {selection.disabledReason && (
        <span id={descriptionId} className="sr-only">
          {selection.disabledReason}
        </span>
      )}
    </button>
  );
}

interface SelectTargetModalProps {
  cards: CardInstance[];
  validTargets: string[];
  effectDescription: string;
  countMin: number;
  countMax: number;
  ctaLabel: string;
  aggregateConstraint?: {
    property: "power" | "cost";
    operator: "<=" | ">=" | "==";
    value: number;
  };
  uniquenessConstraint?: { field: "name" | "color" };
  namedDistribution?: { names: string[] };
  dualTargets?: {
    slots: Array<{ validIds: string[]; countMin: number; countMax: number }>;
  };
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

export function SelectTargetModal({
  cards,
  validTargets,
  effectDescription,
  countMin,
  countMax,
  ctaLabel,
  aggregateConstraint,
  uniquenessConstraint,
  namedDistribution,
  dualTargets,
  cardDb,
  isHidden,
  onHide,
  onAction,
}: SelectTargetModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const prompt: SelectTargetPrompt = {
    promptType: "SELECT_TARGET",
    cards,
    validTargets,
    effectDescription,
    countMin,
    countMax,
    ctaLabel,
    aggregateConstraint,
    uniquenessConstraint,
    namedDistribution,
    dualTargets,
  };
  const model = buildTargetSelectionModel(prompt, selectedIds, cardDb);
  const rovingFocus = useRovingFocus<HTMLButtonElement>(
    cards.map((card) => card.instanceId)
  );

  function toggleCard(instanceId: string) {
    if (model.byId.get(instanceId)?.disabledReason) return;
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(instanceId)) next.delete(instanceId);
      else next.add(instanceId);
      return next;
    });
  }

  function handleConfirm() {
    if (!model.canConfirm) return;
    onAction({
      type: "SELECT_TARGET",
      selectedInstanceIds: model.selectedCards.map((card) => card.instanceId),
    });
  }

  return (
    <Dialog
      open={!isHidden}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (selectedIds.size === 0) return;
          event.preventDefault();
          setSelectedIds(new Set());
        }}
        className="bg-gb-surface border-gb-border-strong text-gb-text gap-0 p-0 sm:max-w-[520px]"
      >
        <DialogHeader className="border-gb-border flex-row items-center justify-between space-y-0 border-b px-4 py-3">
          <DialogTitle className="text-gb-text-bright">
            {effectDescription}
          </DialogTitle>
          <GameButton variant="ghost" size="sm" onClick={onHide}>
            Hide
          </GameButton>
        </DialogHeader>

        <TooltipProvider delayDuration={0} disableHoverableContent>
          <div className="overflow-y-auto px-4 py-4" style={{ maxHeight: 300 }}>
            <div
              className={cn(
                "flex flex-wrap gap-2",
                cards.length <= 5 ? "justify-center" : "justify-start"
              )}
              style={{ maxWidth: `${CARD_W * 5 + 8 * 4}px`, margin: "0 auto" }}
            >
              {cards.map((card) => (
                <TargetCard
                  key={card.instanceId}
                  card={card}
                  cardDb={cardDb}
                  selection={model.byId.get(card.instanceId)!}
                  rovingTabIndex={rovingFocus.getTabIndex(card.instanceId)}
                  onRovingFocus={() => rovingFocus.onFocus(card.instanceId)}
                  onRovingKeyDown={(event) =>
                    rovingFocus.onKeyDown(event, card.instanceId)
                  }
                  setRovingRef={(node) =>
                    rovingFocus.setItemRef(card.instanceId, node)
                  }
                  onToggle={() => toggleCard(card.instanceId)}
                />
              ))}
            </div>
          </div>
        </TooltipProvider>

        <DialogFooter className="border-gb-border flex-row items-center justify-between border-t px-4 py-3 pt-3">
          <span className="text-gb-text-dim text-sm">
            {model.countLabel}
            {model.selectedCount > 0 && (
              <span className="text-gb-text-subtle ml-1">
                \u2014 {model.selectedCount} selected
              </span>
            )}
            {model.aggregateLabel && (
              <span className="text-gb-text-bright ml-2 font-medium">
                \u00b7 {model.aggregateLabel}
              </span>
            )}
          </span>
          <GameButton
            variant={model.canConfirm ? "amber" : "secondary"}
            size="sm"
            onClick={handleConfirm}
            disabled={!model.canConfirm}
          >
            {ctaLabel}
          </GameButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
