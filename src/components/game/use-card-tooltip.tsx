"use client";

import React from "react";
import type { CardData, CardInstance } from "@shared/game-types";
import { TooltipRoot, TooltipTrigger, TooltipContent } from "@/components/ui";
import { CardTooltipContent } from "./card/card-tooltip-content";

/**
 * Wrapper component that renders a shadcn Tooltip around a card element.
 * Used by modal card components (ArrangeTopCards, SelectTarget, etc.)
 * where the trigger element needs a ref and event handlers.
 */
/**
 * Hover dwell before a card tooltip opens. Long enough that sweeping the
 * pointer across a hand doesn't flash every card's tooltip, short enough to
 * still feel immediate. Once one is open, Radix's skip-delay lets the next
 * card's tooltip open at once.
 */
export const CARD_TOOLTIP_DELAY_MS = 150;

export function CardTooltip({
  data,
  cardId,
  card,
  attachedDonCount,
  notice,
  children,
}: {
  data: CardData | null;
  cardId: string | undefined;
  card?: CardInstance | null;
  attachedDonCount?: number;
  notice?: string;
  children: React.ReactNode;
}) {
  if (!data) return <>{children}</>;

  return (
    <TooltipRoot delayDuration={CARD_TOOLTIP_DELAY_MS}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {/*
        The content box is only a transparent frame: CardTooltipContent paints
        the Tier-5 information surface itself (docs/design/MATERIAL-LANGUAGE.md)
        so the type/ID/color badges above it and the DON!! badge below it can
        sit outside the surface. The primitive's padding, border, fill and edge
        are reset here through tailwind-merge rather than by editing it.
        z-[250] lifts it over the full-screen pregame overlays (z-[200], e.g.
        the mulligan dialog), which would otherwise cover the primitive's z-50.
      */}
      <TooltipContent
        side="right"
        sideOffset={8}
        className="z-[250] w-[352px] max-w-none rounded-none border-0 bg-transparent p-0 shadow-none"
      >
        <CardTooltipContent
          data={data}
          cardId={cardId}
          card={card}
          attachedDonCount={attachedDonCount}
          notice={notice}
        />
      </TooltipContent>
    </TooltipRoot>
  );
}
