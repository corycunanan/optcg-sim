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
    <TooltipRoot delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {/*
        Tier-5 information surface (docs/design/MATERIAL-LANGUAGE.md): flat
        near-opaque dark, square corners, no glow, and one neutral 1px
        perimeter lit top-left → bottom-right. The board keeps its own token
        context, so the surface and edge resolve through `gb-*` primitives.
        The 1px border width comes from the shared tooltip primitive; these
        overrides land through tailwind-merge rather than editing it.
      */}
      <TooltipContent
        side="right"
        sideOffset={8}
        data-tier5-surface
        className="bg-gb-surface-info gb-edge-info text-gb-text min-w-[220px] max-w-[320px] rounded-none p-3 shadow-none"
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
