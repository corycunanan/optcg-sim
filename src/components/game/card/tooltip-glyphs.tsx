"use client";

import React from "react";
import type { CardInstance, EffectAvailability } from "@shared/game-types";
import type { RuntimeEffect } from "@/contexts/active-effects-context";
import { cn } from "@/lib/utils";

/**
 * Inline SVG vocabulary for the Tier-5 card tooltip (Figma Frame 81).
 *
 * Every glyph draws with `currentColor` so state colour is inherited from the
 * wrapper, and every path uses the shape language's 45°/90° angle grammar.
 * Nothing here reads game state directly — `buildTooltipStatuses` derives the
 * row from state the tooltip already receives through its props and contexts.
 */

const GLYPH_PROPS = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "square",
  strokeLinejoin: "miter",
  "aria-hidden": true,
  focusable: false,
} as const;

/**
 * Stacked chevron pair — the sanctioned directional mark. Points up for an
 * increase, mirrored down for a decrease; the arms are exact 45° cuts.
 */
export function ChevronPair({
  direction,
  className,
}: {
  direction: "up" | "down";
  className?: string;
}) {
  return (
    <svg
      {...GLYPH_PROPS}
      viewBox="0 0 12 12"
      className={cn("size-3 shrink-0", className)}
      data-chevron-pair={direction}
    >
      {direction === "up" ? (
        <>
          <path d="M2 6 L6 2 L10 6" />
          <path d="M2 10 L6 6 L10 10" />
        </>
      ) : (
        <>
          <path d="M2 2 L6 6 L10 2" />
          <path d="M2 6 L6 10 L10 6" />
        </>
      )}
    </svg>
  );
}

/** Bolt — an effect this card can be activated for right now. */
function ReadyGlyph() {
  return (
    <svg {...GLYPH_PROPS} className="size-4 shrink-0">
      <path
        d="M9 1.5 L3.5 8.5 H7 L6.5 14.5 L12.5 7.5 H9 Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** Filled core inside a diamond socket — a continuous effect is applying. */
function ActiveGlyph() {
  return (
    <svg {...GLYPH_PROPS} className="size-4 shrink-0">
      <path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" />
      <path d="M8 5 L11 8 L8 11 L5 8 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Hourglass — a once-per-turn effect already spent this turn. */
function SpentGlyph() {
  return (
    <svg {...GLYPH_PROPS} className="size-4 shrink-0">
      <path d="M3.5 2 H12.5 L8 8 L12.5 14 H3.5 L8 8 Z" />
    </svg>
  );
}

/** Padlock — the effect exists but its cost, phase, or condition is unmet. */
function LockedGlyph() {
  return (
    <svg {...GLYPH_PROPS} className="size-4 shrink-0">
      <path d="M3 7.5 H13 V14 H3 Z" />
      <path d="M5.5 7.5 V5 A2.5 2.5 0 0 1 10.5 5 V7.5" />
    </svg>
  );
}

/** Card turned sideways — this card is rested. */
function RestedGlyph() {
  return (
    <svg {...GLYPH_PROPS} className="size-4 shrink-0">
      <path d="M1.5 4.5 H14.5 V11.5 H1.5 Z" />
      <path d="M4.5 4.5 V11.5" />
    </svg>
  );
}

/** Slashed ring — this card's own effects are negated. */
function NegatedGlyph() {
  return (
    <svg {...GLYPH_PROPS} className="size-4 shrink-0">
      <path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" />
      <path d="M3.5 12.5 L12.5 3.5" />
    </svg>
  );
}

/** Slashed tag — a printed keyword has been removed from this card. */
function KeywordRemovedGlyph() {
  return (
    <svg {...GLYPH_PROPS} className="size-4 shrink-0">
      <path d="M1.5 3.5 H10 L14.5 8 L10 12.5 H1.5 Z" />
      <path d="M3.5 11 L12 4.5" />
    </svg>
  );
}

export type TooltipStatusId =
  | "effect-ready"
  | "effect-active"
  | "effect-spent"
  | "effect-locked"
  | "rested"
  | "effects-negated"
  | "keyword-removed";

interface TooltipStatusDefinition {
  Glyph: () => React.JSX.Element;
  label: string;
  toneClass: string;
}

const STATUS_DEFINITIONS: Record<TooltipStatusId, TooltipStatusDefinition> = {
  "effect-ready": {
    Glyph: ReadyGlyph,
    label: "Effect ready",
    toneClass: "text-gb-signal-battle",
  },
  "effect-active": {
    Glyph: ActiveGlyph,
    label: "Effect active",
    toneClass: "text-gb-accent-green",
  },
  "effect-spent": {
    Glyph: SpentGlyph,
    label: "Effect used this turn",
    toneClass: "text-gb-text-muted",
  },
  "effect-locked": {
    Glyph: LockedGlyph,
    label: "Effect unavailable",
    toneClass: "text-gb-text-muted",
  },
  rested: {
    Glyph: RestedGlyph,
    label: "Rested",
    toneClass: "text-gb-text-subtle",
  },
  "effects-negated": {
    Glyph: NegatedGlyph,
    label: "Effects negated",
    toneClass: "text-gb-accent-red",
  },
  "keyword-removed": {
    Glyph: KeywordRemovedGlyph,
    label: "Keyword removed",
    toneClass: "text-gb-accent-red",
  },
};

/** Row order: what the player can do first, then what is being done to them. */
const STATUS_ORDER: TooltipStatusId[] = [
  "effect-ready",
  "effect-active",
  "effect-spent",
  "effect-locked",
  "rested",
  "effects-negated",
  "keyword-removed",
];

function effectAppliesTo(effect: RuntimeEffect, instanceId: string): boolean {
  return effect.appliesTo?.includes(instanceId) ?? false;
}

function hasModifier(
  effects: RuntimeEffect[],
  instanceId: string,
  types: readonly string[]
): boolean {
  return effects.some(
    (effect) =>
      effectAppliesTo(effect, instanceId) &&
      (effect.modifiers ?? []).some((modifier) => types.includes(modifier.type))
  );
}

/**
 * Derives the glyph row from state the tooltip already holds — nothing here
 * opens a new data path into the engine. Power and cost modifiers are
 * deliberately absent: the stat chevrons already carry them.
 */
export function buildTooltipStatuses({
  card,
  instanceId,
  availability,
  activeEffects,
}: {
  card?: CardInstance | null;
  instanceId: string;
  availability: EffectAvailability[];
  activeEffects: RuntimeEffect[];
}): TooltipStatusId[] {
  const statuses = new Set<TooltipStatusId>();

  for (const entry of availability) {
    if (entry.status === "usable") statuses.add("effect-ready");
    if (entry.status === "active") statuses.add("effect-active");
    if (entry.status === "used") statuses.add("effect-spent");
    if (entry.status === "blocked") {
      statuses.add(
        entry.reason === "ONCE_PER_TURN" ? "effect-spent" : "effect-locked"
      );
    }
  }

  if (card?.state === "RESTED") statuses.add("rested");

  if (instanceId) {
    if (
      hasModifier(activeEffects, instanceId, [
        "NEGATE_EFFECTS_FLAG",
        "NEGATE_EFFECTS",
      ])
    ) {
      statuses.add("effects-negated");
    }
    if (hasModifier(activeEffects, instanceId, ["REMOVE_KEYWORD"])) {
      statuses.add("keyword-removed");
    }
  }

  return STATUS_ORDER.filter((id) => statuses.has(id));
}

/**
 * Bottom glyph row. Icons carry the meaning visually; each one keeps a
 * screen-reader label so the tooltip stays readable without them.
 */
export function TooltipStatusRow({
  statuses,
}: {
  statuses: TooltipStatusId[];
}) {
  if (statuses.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {statuses.map((id) => {
        const { Glyph, label, toneClass } = STATUS_DEFINITIONS[id];
        return (
          <span
            key={id}
            data-tooltip-status={id}
            className={cn("inline-flex items-center", toneClass)}
          >
            <Glyph />
            <span className="sr-only">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
