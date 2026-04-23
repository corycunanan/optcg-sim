"use client";

import React from "react";
import type { CardData, CardInstance } from "@shared/game-types";
import {
  useActiveEffects,
  getPowerModDirection,
  getCostModDirection,
  computeEffectivePower,
  computeEffectiveCost,
} from "@/contexts/active-effects-context";
import { TooltipStat } from "../game-ui";

/**
 * Single source of truth for the hover/focus tooltip body shown for any card.
 *
 * Both tooltip entry points (the `<Card>` primitive's built-in Radix
 * `<TooltipRoot>` and the standalone `<CardTooltip>` wrapper used elsewhere)
 * render through this component so they cannot drift.
 */
export const CardTooltipContent = React.memo(function CardTooltipContent({
  data,
  cardId,
  card,
}: {
  data: CardData | null;
  cardId: string | undefined;
  card?: CardInstance | null;
}) {
  const activeEffects = useActiveEffects();

  if (!data) return <span className="text-gb-text-muted text-xs">Unknown card</span>;
  const isFieldCard = data.type === "Leader" || data.type === "Character";
  const donCount = card?.attachedDon.length ?? 0;
  const basePower = data.power ?? 0;
  const instanceId = card?.instanceId ?? "";

  const effectivePower = instanceId
    ? computeEffectivePower(activeEffects, instanceId, basePower, donCount)
    : basePower + donCount * 1000;

  const baseCost = data.cost ?? 0;
  const effectiveCost = instanceId
    ? computeEffectiveCost(activeEffects, instanceId, baseCost)
    : baseCost;

  const powerMod = instanceId ? getPowerModDirection(activeEffects, instanceId, basePower) : null;
  const costMod = instanceId ? getCostModDirection(activeEffects, instanceId) : null;

  return (
    <>
      <div className="font-bold text-gb-text-bright text-sm">
        {data.name}
      </div>
      <div className="text-xs text-gb-text-subtle mb-3">
        {data.type} &middot; {cardId}
      </div>

      {isFieldCard ? (
        <div className="flex gap-5 flex-wrap mb-3 text-xs">
          {data.type === "Leader" ? (
            <TooltipStat
              label="Life"
              value={data.life ?? data.cost ?? 0}
            />
          ) : (
            <TooltipStat
              label="Cost"
              value={effectiveCost}
              modified={costMod}
            />
          )}
          <TooltipStat
            label="Power"
            value={effectivePower.toLocaleString()}
            modified={powerMod}
          />
          {data.type !== "Leader" && (
            <TooltipStat
              label="Counter"
              value={data.counter != null ? `+${data.counter}` : "—"}
            />
          )}
        </div>
      ) : (
        <div className="flex gap-3 flex-wrap mb-3 text-xs">
          {data.cost != null && (
            <TooltipStat
              label="Cost"
              value={data.cost}
            />
          )}
          {data.life != null && (
            <TooltipStat
              label="Life"
              value={data.life}
            />
          )}
        </div>
      )}

      {data.effectText && (
        <div className="text-xs text-gb-text leading-relaxed border-t border-gb-border-strong pt-3 flex flex-col gap-2">
          {data.effectText.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i} className="whitespace-pre-wrap">{paragraph}</p>
          ))}
        </div>
      )}
    </>
  );
});
