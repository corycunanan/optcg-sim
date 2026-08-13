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
  const activateMainItems = parseEffectBlocks(data?.effectSchema).flatMap(
    (block) => {
      const isDirectActivateMain = block.triggerKeyword === "ACTIVATE_MAIN";
      const isCompoundActivateMain =
        !isDirectActivateMain &&
        block.triggerKeywords?.includes("ACTIVATE_MAIN");
      if (
        block.category !== "activate" ||
        (!isDirectActivateMain && !isCompoundActivateMain)
      ) {
        return [];
      }

      const availability = getEffectStatus(card.instanceId, block.id);
      if (isCompoundActivateMain && availability?.status !== "usable") {
        return [];
      }

      return [{ block, availability }];
    }
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
      className="bg-gb-surface border-gb-border-strong min-w-[200px]"
      sideOffset={4}
    >
      <DropdownMenuLabel className="text-gb-text-bright">
        <span className="block truncate text-base font-semibold">
          {data?.name ?? "Unknown Card"}
        </span>
        <span className="text-gb-text-dim block font-normal">
          {data?.type}
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator className="bg-gb-border" />
      {activateMainItems.length === 0 ? (
        <DropdownMenuItem
          disabled
          className="text-gb-text data-[disabled]:text-gb-text-dim focus:bg-gb-surface-raised text-sm"
        >
          <span className="shrink-0">{"\u2014"}</span>
          <span>No [Main] effect</span>
        </DropdownMenuItem>
      ) : (
        activateMainItems.map(({ block, availability }) => {
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
              className="text-gb-text data-[disabled]:text-gb-text-dim focus:bg-gb-surface-raised text-sm"
            >
              <span className="shrink-0">{"\u26A1"}</span>
              <span>Activate [Main] effect</span>
              {disabledReason && (
                <span className="ml-auto">{disabledReason}</span>
              )}
            </DropdownMenuItem>
          );
        })
      )}
    </DropdownMenuContent>
  );
}
