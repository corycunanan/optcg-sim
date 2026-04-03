"use client";

import React, { useCallback } from "react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui";

interface CardActionMenuContentProps {
  card: CardInstance;
  cardDb: CardDb;
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
  onAction,
  onClose,
}: CardActionMenuContentProps) {
  const data = cardDb[card.cardId];
  const schema = data?.effectSchema as {
    effects?: Array<{
      id: string;
      category: string;
      trigger?: { keyword?: string };
    }>;
  } | null;

  const activateBlock = schema?.effects?.find(
    (e) =>
      e.category === "activate" &&
      e.trigger?.keyword === "ACTIVATE_MAIN",
  );

  const hasMainEffect = !!activateBlock;

  const handleActivate = useCallback(() => {
    if (!hasMainEffect || !activateBlock) return;
    onAction({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: card.instanceId,
      effectId: activateBlock.id,
    });
    onClose();
  }, [hasMainEffect, activateBlock, card.instanceId, onAction, onClose]);

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
        disabled={!hasMainEffect}
        className="text-sm text-gb-text data-[disabled]:text-gb-text-dim focus:bg-gb-surface-raised"
      >
        <span className="text-xs shrink-0">
          {hasMainEffect ? "\u26A1" : "\u2014"}
        </span>
        <span>
          {hasMainEffect ? "Activate [Main] effect" : "No [Main] effect"}
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
