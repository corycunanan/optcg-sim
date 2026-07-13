"use client";

import React, { useCallback } from "react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui";
import type { ActivateMainState } from "@/lib/game/activate-main";

interface CardActionMenuContentProps {
  card: CardInstance;
  cardDb: CardDb;
  activation: ActivateMainState | null;
  canActivateNow: boolean;
  onAction: (action: GameAction) => void;
  onClose: () => void;
}

/**
 * Content for the right-click context menu on field cards.
 * Rendered inside a DropdownMenu in PlayerFieldCard.
 */
export function CardActionMenuContent({
  card,
  cardDb,
  activation,
  canActivateNow,
  onAction,
  onClose,
}: CardActionMenuContentProps) {
  const data = cardDb[card.cardId];
  const hasMainEffect = !!activation;
  const activationDisabled =
    !activation || !canActivateNow || activation.usedThisTurn;

  const handleActivate = useCallback(() => {
    if (!activation || activationDisabled) return;
    onAction({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: card.instanceId,
      effectId: activation.effectId,
    });
    onClose();
  }, [activation, activationDisabled, card.instanceId, onAction, onClose]);

  const actionLabel = !activation
    ? "No [Main] effect"
    : activation.usedThisTurn
      ? "Used this turn"
      : !canActivateNow
        ? "Available during your Main phase"
        : "Activate [Main] effect";

  return (
    <DropdownMenuContent
      className="min-w-[200px] bg-gb-surface border-gb-border-strong"
      sideOffset={4}
    >
      <DropdownMenuLabel className="text-gb-text-bright">
        <span className="block text-xs font-bold truncate">
          {data?.name ?? "Unknown Card"}
        </span>
        <span className="block text-xs font-normal text-gb-text-dim">
          {data?.type}
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator className="bg-gb-border" />
      <DropdownMenuItem
        onClick={handleActivate}
        disabled={activationDisabled}
        className="text-sm text-gb-text data-[disabled]:text-gb-text-dim focus:bg-gb-surface-raised"
      >
        <span className="text-xs shrink-0">
          {hasMainEffect ? "\u26A1" : "\u2014"}
        </span>
        <span>{actionLabel}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
