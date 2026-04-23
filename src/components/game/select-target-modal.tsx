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
import { GameButton } from "./game-button";
import { Card } from "./card";

const CARD_W = 80;

type DualSlot = { validIds: string[]; countMin: number; countMax: number };

function canAssignDualTargets(selectedIds: string[], slots: DualSlot[]): boolean {
  const counts = slots.map(() => 0);
  const validSets = slots.map((s) => new Set(s.validIds));

  function backtrack(idx: number): boolean {
    if (idx === selectedIds.length) {
      return slots.every((s, i) => counts[i] >= s.countMin);
    }
    const id = selectedIds[idx];
    for (let s = 0; s < slots.length; s++) {
      if (validSets[s].has(id) && counts[s] < slots[s].countMax) {
        counts[s]++;
        if (backtrack(idx + 1)) return true;
        counts[s]--;
      }
    }
    return false;
  }

  return backtrack(0);
}

function TargetCard({
  card,
  cardDb,
  selected,
  invalid,
  disabledReason,
  onToggle,
}: {
  card: CardInstance;
  cardDb: CardDb;
  selected: boolean;
  invalid: boolean;
  disabledReason: string | null;
  onToggle: () => void;
}) {
  const blocked = invalid || disabledReason !== null;

  return (
    <div
      onClick={blocked ? undefined : onToggle}
      title={disabledReason ?? undefined}
      className={cn(
        "relative rounded select-none shrink-0 transition-[box-shadow] duration-150",
        blocked && "opacity-30 cursor-not-allowed",
        !blocked && selected && "ring-2 ring-gb-accent-amber ring-offset-1 ring-offset-transparent cursor-pointer",
        !blocked && !selected && "cursor-pointer",
      )}
    >
      <Card
        variant="modal"
        size="field"
        data={{ card, cardId: card.cardId, cardDb }}
        interaction={{ tooltipDisabled: blocked }}
      />
      {selected && (
        <div className="absolute top-1 right-1 z-10 w-4 h-4 rounded-full bg-gb-accent-amber flex items-center justify-center">
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

  const validSet = new Set(validTargets);
  const selectedCards = cards.filter((c) => selectedIds.has(c.instanceId));

  const aggregateSum = aggregateConstraint
    ? selectedCards.reduce((sum, c) => {
        const v = cardDb[c.cardId]?.[aggregateConstraint.property];
        return sum + (v ?? 0);
      }, 0)
    : 0;

  const takenNames = new Set<string>();
  const takenColors = new Set<string>();
  if (uniquenessConstraint) {
    for (const c of selectedCards) {
      const data = cardDb[c.cardId];
      if (!data) continue;
      if (uniquenessConstraint.field === "name") takenNames.add(data.name);
      else for (const col of data.color) takenColors.add(col);
    }
  }

  const takenDistNames = new Set<string>();
  if (namedDistribution) {
    for (const c of selectedCards) {
      const data = cardDb[c.cardId];
      if (data) takenDistNames.add(data.name);
    }
  }

  function getDisabledReason(card: CardInstance): string | null {
    if (selectedIds.has(card.instanceId)) return null;
    const data = cardDb[card.cardId];
    if (!data) return null;

    if (aggregateConstraint) {
      const v = data[aggregateConstraint.property] ?? 0;
      const next = aggregateSum + v;
      if (
        (aggregateConstraint.operator === "<=" || aggregateConstraint.operator === "==") &&
        next > aggregateConstraint.value
      ) {
        return `Adding this would exceed ${aggregateConstraint.value} ${aggregateConstraint.property}`;
      }
    }

    if (uniquenessConstraint) {
      if (uniquenessConstraint.field === "name" && takenNames.has(data.name)) {
        return `Already selected a card named "${data.name}"`;
      }
      if (uniquenessConstraint.field === "color" && data.color.some((col) => takenColors.has(col))) {
        return "Already selected a card of this color";
      }
    }

    if (namedDistribution && takenDistNames.has(data.name)) {
      return `Only one "${data.name}" allowed`;
    }

    if (dualTargets) {
      const candidate = [...selectedIds, card.instanceId];
      if (!canAssignDualTargets(candidate, dualTargets.slots)) {
        return "No valid slot assignment with this card";
      }
    }

    return null;
  }

  function toggleCard(instanceId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else if (next.size < countMax) {
        next.add(instanceId);
      }
      return next;
    });
  }

  function handleConfirm() {
    if (selectedIds.size < countMin) return;
    onAction({ type: "SELECT_TARGET", selectedInstanceIds: [...selectedIds] });
  }

  let aggregateOk = true;
  if (aggregateConstraint) {
    const { operator, value } = aggregateConstraint;
    if (operator === "<=") aggregateOk = aggregateSum <= value;
    else if (operator === ">=") aggregateOk = aggregateSum >= value;
    else aggregateOk = aggregateSum === value;
  }
  const dualTargetsOk = dualTargets
    ? canAssignDualTargets([...selectedIds], dualTargets.slots)
    : true;
  const canConfirm = selectedIds.size >= countMin && aggregateOk && dualTargetsOk;

  const countLabel =
    countMin === countMax
      ? `Select ${countMin}`
      : countMin === 0
        ? `Select up to ${countMax}`
        : `Select ${countMin}–${countMax}`;

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
                  selected={selectedIds.has(card.instanceId)}
                  invalid={!validSet.has(card.instanceId)}
                  disabledReason={getDisabledReason(card)}
                  onToggle={() => toggleCard(card.instanceId)}
                />
              ))}
            </div>
          </div>
        </TooltipProvider>

        <DialogFooter className="flex-row items-center justify-between px-4 py-3 border-t border-gb-border pt-3">
          <span className="text-xs text-gb-text-dim">
            {countLabel}
            {selectedIds.size > 0 && (
              <span className="text-gb-text-subtle ml-1">
                — {selectedIds.size} selected
              </span>
            )}
            {aggregateConstraint && (
              <span
                className={cn(
                  "ml-2 font-medium",
                  aggregateOk ? "text-gb-text-bright" : "text-gb-accent-red",
                )}
              >
                · Total {aggregateConstraint.property}: {aggregateSum} {aggregateConstraint.operator} {aggregateConstraint.value}
              </span>
            )}
          </span>
          <GameButton
            variant={canConfirm ? "amber" : "secondary"}
            size="sm"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {ctaLabel}
          </GameButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
