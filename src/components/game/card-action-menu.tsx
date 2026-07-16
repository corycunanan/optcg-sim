"use client";

import React, { useCallback } from "react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui";
import { useEffectAvailability } from "@/contexts/effect-availability-context";
import type { ActivateMainState } from "@/lib/game/activate-main";
import {
  BLOCKED_REASON_COPY,
  parseEffectBlocks,
} from "@/lib/game/effect-clauses";

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
  onAction,
  onClose,
}: CardActionMenuContentProps) {
  const data = cardDb[card.cardId];
  const { getEffectStatus } = useEffectAvailability();
  const activateMainBlocks = parseEffectBlocks(data?.effectSchema).filter(
    (block) =>
      block.category === "activate" &&
      (block.triggerKeyword === "ACTIVATE_MAIN" ||
        block.triggerKeywords?.includes("ACTIVATE_MAIN"))
  );

  const handleActivate = useCallback(
    (effectId: string) => {
      onAction({
        type: "ACTIVATE_EFFECT",
        cardInstanceId: card.instanceId,
        effectId,
      });
      onClose();
    },
    [card.instanceId, onAction, onClose]
  );

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
      {activateMainBlocks.length === 0 ? (
        <DropdownMenuItem
          disabled
          className="text-sm text-gb-text data-[disabled]:text-gb-text-dim focus:bg-gb-surface-raised"
        >
          <span className="text-xs shrink-0">{"\u2014"}</span>
          <span>No [Main] effect</span>
        </DropdownMenuItem>
      ) : (
        activateMainBlocks.map((block) => {
          const availability = getEffectStatus(card.instanceId, block.id);
          const disabled =
            availability !== null && availability.status !== "usable";
          const disabledReason =
            availability?.status === "used"
              ? BLOCKED_REASON_COPY.ONCE_PER_TURN
              : availability?.status === "blocked" && availability.reason
                ? BLOCKED_REASON_COPY[availability.reason]
                : undefined;

          return (
            <DropdownMenuItem
              key={block.id}
              onClick={() => handleActivate(block.id)}
              disabled={disabled}
              className="text-sm text-gb-text data-[disabled]:text-gb-text-dim focus:bg-gb-surface-raised"
            >
              <span className="text-xs shrink-0">{"\u26A1"}</span>
              <span>Activate [Main] effect</span>
              {disabledReason && (
                <span className="ml-auto text-xs">{disabledReason}</span>
              )}
            </DropdownMenuItem>
          );
        })
      )}
    </DropdownMenuContent>
  );
}
