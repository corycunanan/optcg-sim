"use client";

import React from "react";
import type { CardData, CardInstance } from "@shared/game-types";
import {
  useActiveEffects,
  getPowerModDirection,
  computeEffectivePower,
} from "@/contexts/active-effects-context";
import { useEffectAvailability } from "@/contexts/effect-availability-context";
import {
  BLOCKED_REASON_COPY,
  parseEffectBlocks,
  segmentEffectText,
} from "@/lib/game/effect-clauses";
import { Badge } from "@/components/ui/badge";
import { EffectSegments } from "@/components/cards/effect-text";
import { parseEffectLine } from "@/lib/cards/effect-notation";
import { COLOR_SWATCH_CLASSES, type CardColorName } from "@/lib/cards/colors-ui";
import { cn } from "@/lib/utils";
import {
  buildTooltipStatuses,
  ChevronPair,
  TooltipStatusRow,
} from "./tooltip-glyphs";

/**
 * Single source of truth for the hover/focus tooltip body shown for any card.
 *
 * Both tooltip entry points (the `<Card>` primitive's built-in Radix
 * `<TooltipRoot>` and the standalone `<CardTooltip>` wrapper used elsewhere)
 * render through this component so they cannot drift.
 *
 * Layout (approved on the "In-game card tooltip" design canvas, 2026-11-23):
 *
 * - Above the surface, square black badges: card type and ID on the left, the
 *   card's colors combined into one badge on the right.
 * - The Tier-5 information surface (docs/design/MATERIAL-LANGUAGE.md): name,
 *   attribute and trait badges, a full-width rule, the stats in equal
 *   centered columns, another rule, then the effect text. A [Trigger] effect
 *   sits in a nested, slightly lighter box at the end.
 * - Below the surface, a square black DON!! badge when DON is attached.
 *
 * Effect text renders through the card database's own chips (`EffectSegments`)
 * so notation, traits and costs look the same in both places. The tooltip
 * keeps its per-clause structure on top of that: each source line is one
 * clause, greyed or annotated from effect availability.
 */

/** Equal-width stat columns; written out so Tailwind sees every class. */
const STAT_GRID_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

/** Square black badge set above and below the surface. */
const FRAME_BADGE_CLASS =
  "bg-gb-board-dark text-gb-text-bright rounded-none border-border py-1";

/** Attribute and trait badges share the inline {Trait} chip's material. */
const TRAIT_BADGE_CLASS =
  "border-effect-trait-edge bg-effect-trait text-effect-trait-fg py-1";

/**
 * One labelled figure, centered over its column. Values are always white per
 * the Tier-5 amendment; the chevron pair leads the number and carries the
 * modifier, coloured for whether the change helps this card (a cheaper cost
 * and a stronger power are both green).
 */
function TooltipStat({
  label,
  value,
  modified,
  favourable,
}: {
  label: string;
  value: string | number;
  modified?: "up" | "down" | null;
  favourable?: "up" | "down";
}) {
  const beneficial = modified != null && modified === favourable;

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-gb-text-subtle text-sm font-semibold tracking-widest uppercase">
        {label}
      </span>
      <span className="text-gb-text-bright flex items-center justify-center gap-1 text-lg font-semibold tabular-nums">
        {modified && (
          <ChevronPair
            direction={modified}
            className={
              beneficial ? "text-gb-accent-green" : "text-gb-accent-red"
            }
          />
        )}
        <span>{String(value)}</span>
      </span>
    </div>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-3 shrink-0 rounded border",
        COLOR_SWATCH_CLASSES[color as CardColorName] ??
          "border-border-strong bg-surface-3"
      )}
    />
  );
}

function TooltipRule() {
  return <hr aria-hidden="true" className="border-border -mx-3 border-t" />;
}

export const CardTooltipContent = React.memo(function CardTooltipContent({
  data,
  cardId,
  card,
  attachedDonCount,
  notice,
}: {
  data: CardData | null;
  cardId: string | undefined;
  card?: CardInstance | null;
  attachedDonCount?: number;
  notice?: string;
}) {
  const activeEffects = useActiveEffects();
  const { getCardAvailability, getEffectStatus } = useEffectAvailability();

  if (!data) return <span className="text-gb-text-muted text-sm">Unknown card</span>;
  const isFieldCard = data.type === "Leader" || data.type === "Character";
  const donCount = attachedDonCount ?? card?.attachedDon.length ?? 0;
  const basePower = data.power ?? 0;
  const instanceId = card?.instanceId ?? "";

  const canonicalEffectivePower = card?.effectivePower;
  const canonicalPowerDelta = card?.powerDelta;
  const hasCanonicalPower = canonicalEffectivePower !== undefined;
  const effectivePower = hasCanonicalPower
    ? canonicalEffectivePower
    : instanceId
      ? computeEffectivePower(activeEffects, instanceId, basePower, donCount)
      : basePower + donCount * 1000;

  const baseCost = data.cost ?? 0;
  const effectiveCost = card?.effectiveCost ?? baseCost;

  const powerMod = hasCanonicalPower
    ? canonicalPowerDelta === undefined || canonicalPowerDelta === 0
      ? null
      : canonicalPowerDelta > 0
        ? "up"
        : "down"
    : instanceId
      ? getPowerModDirection(activeEffects, instanceId, basePower)
      : null;
  const costMod = effectiveCost === baseCost
    ? null
    : effectiveCost > baseCost
      ? "up"
      : "down";
  const effectBlocks = parseEffectBlocks(data.effectSchema);
  const effectClauses = segmentEffectText(data.effectText, effectBlocks);
  const cardAvailability = instanceId
    ? getCardAvailability(instanceId)
    : [];
  const statuses = buildTooltipStatuses({
    card,
    instanceId,
    availability: cardAvailability,
    activeEffects,
  });

  const stats: React.ReactNode[] = [];
  if (isFieldCard) {
    if (data.type === "Leader") {
      stats.push(
        <TooltipStat key="life" label="Life" value={data.life ?? data.cost ?? 0} />
      );
    } else {
      stats.push(
        <TooltipStat
          key="cost"
          label="Cost"
          value={effectiveCost}
          modified={costMod}
          favourable="down"
        />
      );
    }
    stats.push(
      <TooltipStat
        key="power"
        label="Power"
        value={effectivePower.toLocaleString()}
        modified={powerMod}
        favourable="up"
      />
    );
    if (data.type !== "Leader") {
      const counter = card?.effectiveCounter ?? data.counter;
      stats.push(
        <TooltipStat
          key="counter"
          label="Counter"
          value={counter != null && counter > 0 ? counter.toLocaleString() : "—"}
        />
      );
    }
  } else {
    if (data.cost != null) {
      stats.push(
        <TooltipStat
          key="cost"
          label="Cost"
          value={effectiveCost}
          modified={costMod}
          favourable="down"
        />
      );
    }
    if (data.life != null) {
      stats.push(<TooltipStat key="life" label="Life" value={data.life} />);
    }
  }

  const headerBadges = [...data.attribute, ...data.types];
  const colorLabel = data.color.join("/");

  return (
    <div data-card-tooltip className="flex w-full flex-col items-start gap-1 font-sans">
      {notice && (
        <div className="bg-gb-surface-raised text-gb-accent-amber w-full px-2 py-1 text-sm font-semibold">
          {notice}
        </div>
      )}

      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Badge variant="outline" className={FRAME_BADGE_CLASS}>
            {data.type}
          </Badge>
          {cardId && (
            <Badge variant="outline" className={cn(FRAME_BADGE_CLASS, "font-mono")}>
              {cardId}
            </Badge>
          )}
        </div>
        {data.color.length > 0 && (
          <Badge
            variant="outline"
            className={cn(FRAME_BADGE_CLASS, "gap-2")}
            aria-label={`${colorLabel} card color`}
          >
            <span className="flex items-center gap-1">
              {data.color.map((color) => (
                <ColorSwatch key={color} color={color} />
              ))}
            </span>
            <span aria-hidden="true">{colorLabel}</span>
          </Badge>
        )}
      </div>

      <div
        data-tier5-surface
        className="bg-gb-surface-info gb-edge-info text-gb-text flex w-full flex-col gap-4 border p-3"
      >
        <div className="flex flex-col gap-2">
          <div className="text-gb-text-bright text-lg font-semibold">
            {data.name}
          </div>
          {headerBadges.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {headerBadges.map((label, index) => (
                <Badge
                  key={`${label}-${index}`}
                  variant="outline"
                  className={TRAIT_BADGE_CLASS}
                >
                  {label}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {stats.length > 0 && (
          <>
            <TooltipRule />
            <div
              className={cn(
                "grid gap-4",
                STAT_GRID_COLUMNS[stats.length] ?? "grid-cols-3"
              )}
            >
              {stats}
            </div>
          </>
        )}

        {(data.effectText || data.triggerText) && <TooltipRule />}

        {(data.effectText || data.triggerText) && (
          <div className="text-gb-text flex flex-col gap-3 text-sm leading-relaxed">
            {(() => {
              let clauseIndex = 0;

              // Structure is unconditional: every clause renders through the
              // card database's chips. Availability only decides greying and
              // the trailing reason badge, so a card rendered without
              // availability data (a hand card, a deck preview, an unmatched
              // schema) still reads like the database rather than falling
              // back to raw bracket tokens.
              return data.effectText.split(/\n{2,}/).map((paragraph, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {paragraph.split(/(\r?\n)/).map((line, lineIndex) => {
                    if (/^\r?\n$/.test(line) || line.trim().length === 0) {
                      return line;
                    }

                    const clause = effectClauses[clauseIndex++];
                    const availability = clause?.blockId
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
                      <span
                        key={lineIndex}
                        data-effect-block={clause?.blockId ?? undefined}
                        className={cn(
                          availability?.status === "usable" &&
                            "text-gb-text-bright",
                          availability?.status === "active" &&
                            "text-gb-accent-green",
                          (availability?.status === "used" ||
                            availability?.status === "blocked") &&
                            "text-gb-text-muted"
                        )}
                      >
                        <EffectSegments segments={parseEffectLine(line)} />
                        {suffix && (
                          <>
                            {" "}
                            <Badge
                              variant="outline"
                              className="text-gb-text-subtle align-middle"
                            >
                              {suffix}
                            </Badge>
                          </>
                        )}
                      </span>
                    );
                  })}
                </p>
              ));
            })()}
            {data.triggerText && (
              <div
                data-trigger-effect
                className={cn(
                  "bg-gb-surface-nested -mx-1 p-2",
                  statuses.length === 0 && "-mb-1"
                )}
              >
                <EffectSegments segments={parseEffectLine(data.triggerText)} />
              </div>
            )}
          </div>
        )}

        <TooltipStatusRow statuses={statuses} />
      </div>

      {donCount > 0 && (
        <Badge
          variant="outline"
          className={cn(FRAME_BADGE_CLASS, "text-sm font-semibold tabular-nums")}
        >
          DON!! ×{donCount}
        </Badge>
      )}
    </div>
  );
});
