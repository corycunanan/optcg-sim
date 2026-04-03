"use client";

import React from "react";
import type { CardData, CardInstance } from "@shared/game-types";
import { TooltipRoot, TooltipTrigger, TooltipContent } from "@/components/ui";
import { CardTooltipContent } from "./board-card";

/**
 * Wrapper component that renders a shadcn Tooltip around a card element.
 * Used by modal card components (ArrangeTopCards, SelectTarget, etc.)
 * where the trigger element needs a ref and event handlers.
 */
export function CardTooltip({
  data,
  cardId,
  card,
  children,
}: {
  data: CardData | null;
  cardId: string | undefined;
  card?: CardInstance | null;
  children: React.ReactNode;
}) {
  if (!data) return <>{children}</>;

  return (
    <TooltipRoot delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={8}
        className="bg-gb-surface border-gb-border-strong rounded-md p-3 min-w-[220px] max-w-[320px] shadow-lg text-gb-text"
      >
        <CardTooltipContent data={data} cardId={cardId} card={card} />
      </TooltipContent>
    </TooltipRoot>
  );
}
