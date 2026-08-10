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
 * Presentation follows the Tier-5 information surface (Figma Frame 81, see
 * docs/design/MATERIAL-LANGUAGE.md): Geist Sans throughout, white numerals and
 * keywords, status colour reserved for status, and no internal rules — the
 * host surface's single perimeter border is the only border, so sections are
 * separated by spacing alone.
 */

/** Leading `[…]` tokens on a clause line, e.g. `[On Play]`, `[Once Per Turn]`. */
const LEADING_CLAUSE_TOKENS = /^(?:\[[^\]]+\]\s*\/?\s*)+/;

interface ClauseBadge {
  label: string;
  /** Literal separator printed after this badge, e.g. the `/` in `[Main]/[Counter]`. */
  separator: string | null;
}

interface ClauseParts {
  badges: ClauseBadge[];
  text: string;
}

/**
 * Splits a clause's leading bracket tokens off as condition badges. Content is
 * only re-homed, never rewritten: the badges hold the bracket labels, any
 * separator between two tokens is preserved (`[Main]/[Counter]` keeps its "or"
 * relationship), and the remainder keeps its original spacing.
 */
function splitClauseBadges(line: string): ClauseParts {
  const match = line.match(LEADING_CLAUSE_TOKENS);
  if (!match) return { badges: [], text: line };

  const badges = Array.from(
    match[0].matchAll(/\[([^\]]+)\]([^[]*)/g),
    (token): ClauseBadge => {
      const trailing = token[2].trim();
      return { label: token[1].trim(), separator: trailing || null };
    }
  );

  return { badges, text: line.slice(match[0].length) };
}

function TooltipBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-gb-surface-raised inline-flex px-2 py-1 text-xs font-semibold tracking-widest uppercase">
      {children}
    </span>
  );
}

/**
 * One labelled figure. Values are always white per the Tier-5 amendment; the
 * chevron pair carries the modifier, coloured for whether the change helps
 * this card (a cheaper cost and a stronger power are both green).
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
    <div className="flex flex-col gap-1">
      <span className="text-gb-text-subtle text-xs font-semibold tracking-widest uppercase">
        {label}
      </span>
      <span className="text-gb-text-bright flex items-center gap-1 text-sm font-semibold tabular-nums">
        <span>{String(value)}</span>
        {modified && (
          <ChevronPair
            direction={modified}
            className={
              beneficial ? "text-gb-accent-green" : "text-gb-accent-red"
            }
          />
        )}
      </span>
    </div>
  );
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

  if (!data) return <span className="text-gb-text-muted text-xs">Unknown card</span>;
  const isFieldCard = data.type === "Leader" || data.type === "Character";
  const donCount = attachedDonCount ?? card?.attachedDon.length ?? 0;
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
  const cardAvailability = instanceId
    ? getCardAvailability(instanceId)
    : [];
  const statuses = buildTooltipStatuses({
    card,
    instanceId,
    availability: cardAvailability,
    activeEffects,
  });

  return (
    <div className="flex flex-col gap-4 font-sans">
      {notice && (
        <div className="bg-gb-surface-raised text-gb-accent-amber px-2 py-1 text-xs font-semibold">
          {notice}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="text-gb-text-bright text-base font-semibold">
          {data.name}
        </div>
        <div className="text-gb-text-subtle text-xs font-semibold tracking-widest uppercase">
          {data.type} &middot; {cardId}
        </div>
      </div>

      {isFieldCard ? (
        <div className="flex flex-wrap gap-5">
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
              favourable="down"
            />
          )}
          <TooltipStat
            label="Power"
            value={effectivePower.toLocaleString()}
            modified={powerMod}
            favourable="up"
          />
          {donCount > 0 && (
            <TooltipStat label="Attached DON" value={donCount} />
          )}
          {data.type !== "Leader" && (
            <TooltipStat
              label="Counter"
              value={data.counter != null ? `+${data.counter}` : "—"}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-5">
          {data.cost != null && (
            <TooltipStat
              label="Cost"
              value={effectiveCost}
              modified={costMod}
              favourable="down"
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
        <div className="text-gb-text flex flex-col gap-3 text-xs leading-relaxed">
          {(() => {
            let clauseIndex = 0;

            // Structure is unconditional: every clause gets its condition
            // badges. Availability only decides greying and the trailing
            // reason badge, so a card rendered without availability data (a
            // hand card, a deck preview, an unmatched schema) still reads as
            // Tier 5 rather than falling back to raw bracket tokens.
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
                  const { badges, text } = splitClauseBadges(line);

                  return (
                    <span
                      key={lineIndex}
                      data-effect-block={clause?.blockId ?? undefined}
                      className={cn(
                        "inline-flex flex-wrap items-center gap-2",
                        availability?.status === "usable" &&
                          "text-gb-text-bright",
                        availability?.status === "active" &&
                          "text-gb-accent-green",
                        (availability?.status === "used" ||
                          availability?.status === "blocked") &&
                          "text-gb-text-muted"
                      )}
                    >
                      {badges.map((badge, badgeIndex) => (
                        <React.Fragment key={badgeIndex}>
                          <TooltipBadge>{badge.label}</TooltipBadge>
                          {badge.separator && <span>{badge.separator}</span>}
                        </React.Fragment>
                      ))}
                      {text && <span className="whitespace-pre-wrap">{text}</span>}
                      {suffix && <TooltipBadge>{suffix}</TooltipBadge>}
                    </span>
                  );
                })}
              </p>
            ));
          })()}
        </div>
      )}

      <TooltipStatusRow statuses={statuses} />
    </div>
  );
});
