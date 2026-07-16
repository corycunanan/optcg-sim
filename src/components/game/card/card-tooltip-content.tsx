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
import { useEffectAvailability } from "@/contexts/effect-availability-context";
import {
  BLOCKED_REASON_COPY,
  parseEffectBlocks,
  segmentEffectText,
} from "@/lib/game/effect-clauses";
import { cn } from "@/lib/utils";
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
  notice,
}: {
  data: CardData | null;
  cardId: string | undefined;
  card?: CardInstance | null;
  notice?: string;
}) {
  const activeEffects = useActiveEffects();
  const { getEffectStatus } = useEffectAvailability();

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
  const effectBlocks = parseEffectBlocks(data.effectSchema);
  const effectClauses = segmentEffectText(data.effectText, effectBlocks);

  return (
    <>
      {notice && (
        <div className="mb-3 rounded border border-gb-signal-disabled/50 bg-gb-signal-disabled/10 px-2 py-1 text-xs font-bold text-gb-signal-disabled">
          {notice}
        </div>
      )}
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
              value={effectiveCost}
              modified={costMod}
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
          {effectBlocks.length === 0
            ? data.effectText.split(/\n{2,}/).map((paragraph, i) => (
                <p key={i} className="whitespace-pre-wrap">{paragraph}</p>
              ))
            : effectClauses.map((clause, i) => {
                const availability =
                  instanceId && clause.blockId
                    ? getEffectStatus(instanceId, clause.blockId)
                    : null;
                const blockedReason = availability?.reason
                  ? BLOCKED_REASON_COPY[availability.reason]
                  : undefined;
                const suffix =
                  availability?.status === "used"
                    ? "used this turn"
                    : availability?.status === "blocked"
                      ? blockedReason
                      : undefined;

                return (
                  <p
                    key={`${clause.text}-${i}`}
                    className={cn(
                      "whitespace-pre-wrap",
                      availability?.status === "usable" &&
                        "border-gold-500 text-gb-text-bright border-l-2 pl-2",
                      availability?.status === "active" &&
                        "text-gb-accent-green",
                      (availability?.status === "used" ||
                        availability?.status === "blocked") &&
                        "text-gb-text-muted"
                    )}
                  >
                    {clause.text}
                    {suffix && (
                      <span className="bg-gb-surface-raised text-gb-text-muted ml-2 inline-flex rounded px-2 py-1 text-xs font-medium">
                        {suffix}
                      </span>
                    )}
                  </p>
                );
              })}
        </div>
      )}
    </>
  );
});
