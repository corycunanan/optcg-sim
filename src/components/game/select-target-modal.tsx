"use client";

import React, { useState } from "react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
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

const CARD_W = 80;

function TargetCard({
  card,
  cardDb,
  selection,
  onToggle,
}: {
  card: CardInstance;
  cardDb: CardDb;
  selection: TargetCardSelectionState;
  onToggle: () => void;
}) {
  const blocked = selection.disabledReason !== null;

  return (
    <div
      onClick={blocked ? undefined : onToggle}
      title={selection.disabledReason ?? undefined}
      className={cn(
        "relative rounded select-none shrink-0 transition-[box-shadow] duration-150",
        blocked && "opacity-30 cursor-not-allowed",
        !blocked &&
          selection.selected &&
          "ring-2 ring-gb-signal-selected ring-offset-1 ring-offset-transparent cursor-pointer",
        !blocked && !selection.selected && "cursor-pointer",
      )}
    >
      <Card
        variant="modal"
        size="field"
        data={{ card, cardId: card.cardId, cardDb }}
        interaction={{ tooltipDisabled: blocked }}
      />
      {selection.selected && (
        <div className="absolute top-1 right-1 z-10 w-4 h-4 rounded-full bg-gb-signal-selected flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2 2 4-4" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

interface SelectTargetModalProps {
  cards: CardInstance[];
  validTargets: string[];
  effectDescription: string;
  countMin: number;
  countMax: number;
  ctaLabel: string;
  aggregateConstraint?: { property: "power" | "cost"; operator: "<=" | ">=" | "=="; value: number };
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
  const prompt = {
    promptType: "SELECT_TARGET" as const,
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
    <Dialog open={!isHidden} onOpenChange={(open) => { if (!open) onHide(); }}>
      <DialogContent
        showCloseButton={false}
        className="bg-gb-surface border-gb-border-strong text-gb-text sm:max-w-[520px] p-0 gap-0"
      >
        <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b border-gb-border space-y-0">
          <DialogTitle className="text-sm font-bold text-gb-text-bright">
            {effectDescription}
          </DialogTitle>
          <GameButton variant="ghost" size="sm" onClick={onHide}>
            Hide
          </GameButton>
        </DialogHeader>

        <TooltipProvider delayDuration={0} disableHoverableContent>
          <div className="px-4 py-4 overflow-y-auto" style={{ maxHeight: 300 }}>
            <div
              className={cn("flex flex-wrap gap-2", cards.length <= 5 ? "justify-center" : "justify-start")}
              style={{ maxWidth: `${CARD_W * 5 + 8 * 4}px`, margin: "0 auto" }}
            >
              {cards.map((card) => (
                <TargetCard
                  key={card.instanceId}
                  card={card}
                  cardDb={cardDb}
                  selection={model.byId.get(card.instanceId)!}
                  onToggle={() => toggleCard(card.instanceId)}
                />
              ))}
            </div>
          </div>
        </TooltipProvider>

        <DialogFooter className="flex-row items-center justify-between px-4 py-3 border-t border-gb-border pt-3">
          <span className="text-xs text-gb-text-dim">
            {model.countLabel}
            {model.selectedCount > 0 && (
              <span className="text-gb-text-subtle ml-1">
                \u2014 {model.selectedCount} selected
              </span>
            )}
            {model.aggregateLabel && (
              <span className="ml-2 font-medium text-gb-text-bright">
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
