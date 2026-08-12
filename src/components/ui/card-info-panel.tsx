"use client";

import { cn } from "@/lib/utils";

/**
 * Presentational card-info body shared by every app-side card tooltip.
 *
 * Deliberately neutral: a plain props bag, no game hooks, no fetching, no
 * knowledge of where the data came from. Call sites map their own shape
 * (`CardResponse`, the deck-builder group, the lobby deck card) onto these
 * props, which keeps one anatomy for the deck builder, the lobby deck grid,
 * and anything that adopts it later.
 *
 * Surface: the panel owns its own Tier-5 information surface per
 * `docs/design/MATERIAL-LANGUAGE.md` — near-opaque flat dark, square corners,
 * exactly one neutral 1px perimeter lit top-left → bottom-right, no blur, no
 * glow. Consumers render it *inside* a portal wrapper whose own panel styling
 * has been neutralised, so the popup reads as a single Tier-5 surface rather
 * than two nested ones.
 */
export interface CardInfoPanelProps {
  /** Printed card name. Rendered semibold + uppercase. */
  name: string;
  /** Card category — "Leader", "Character", "Event", "Stage", "DON!!". */
  cardType: string;
  /** Canonical printed card id, e.g. `OP01-025`. */
  cardId: string;
  cost?: number | null;
  power?: number | null;
  counter?: number | null;
  life?: number | null;
  /** TCG colours, already resolved to display strings. */
  colors?: string[] | null;
  traits?: string[] | null;
  /** Attack attribute(s) — "Slash", "Strike", … */
  attribute?: string[] | null;
  effectText?: string | null;
  triggerText?: string | null;
  className?: string;
}

/**
 * A single stat: wide-tracked uppercase label above a white numeric value.
 *
 * Tier-5 convention (MATERIAL-LANGUAGE amendment #3): every numeric value is
 * white. The stat's identity is carried by its label, never by a per-stat hue
 * — coloured numerals spend chroma that belongs to card art.
 */
function CardInfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-content-secondary text-xs font-semibold tracking-widest uppercase">
        {label}
      </span>
      <span className="text-content-primary text-sm font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

/** Blank-line-delimited paragraphs; single newlines stay inside a paragraph. */
function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0);
}

function joinList(values: string[] | null | undefined): string | null {
  if (!values) return null;
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(" / ") : null;
}

export function CardInfoPanel({
  name,
  cardType,
  cardId,
  cost,
  power,
  counter,
  life,
  colors,
  traits,
  attribute,
  effectText,
  triggerText,
  className,
}: CardInfoPanelProps) {
  const isLeader = cardType === "Leader";
  const isFieldCard = isLeader || cardType === "Character";

  const stats: { label: string; value: string }[] = [];
  if (isLeader) {
    stats.push({ label: "Life", value: String(life ?? cost ?? 0) });
  } else if (cost != null) {
    stats.push({ label: "Cost", value: String(cost) });
  }
  if (isFieldCard) {
    stats.push({ label: "Power", value: (power ?? 0).toLocaleString() });
  }
  if (!isLeader && isFieldCard) {
    stats.push({
      label: "Counter",
      value: counter != null ? `+${counter}` : "—",
    });
  }
  if (!isFieldCard && life != null) {
    stats.push({ label: "Life", value: String(life) });
  }

  // One descriptor row: colours, then traits, then attribute. Separated by
  // spacing rather than rules — the Tier-5 surface carries exactly one border.
  const descriptors = [joinList(colors), joinList(traits), joinList(attribute)]
    .filter((part): part is string => part != null)
    .join(" · ");

  const effectParagraphs = effectText ? splitParagraphs(effectText) : [];
  const trigger = triggerText?.trim() ? triggerText.trim() : null;

  return (
    <div
      data-tier5-surface
      className={cn(
        "bg-surface-info edge-info flex flex-col gap-3 border p-3",
        "rounded-md shadow-none",
        className
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="text-content-primary text-sm font-semibold tracking-widest uppercase">
          {name}
        </div>
        <div className="text-content-secondary text-xs">
          {cardType} &middot; {cardId}
        </div>
        {descriptors && (
          <div className="text-content-secondary text-xs">{descriptors}</div>
        )}
      </div>

      {stats.length > 0 && (
        <div className="flex flex-wrap gap-6">
          {stats.map((stat) => (
            <CardInfoStat
              key={stat.label}
              label={stat.label}
              value={stat.value}
            />
          ))}
        </div>
      )}

      {effectParagraphs.length > 0 && (
        <div className="text-content-secondary flex flex-col gap-2 text-xs leading-relaxed">
          {effectParagraphs.map((paragraph, index) => (
            <p key={index} className="whitespace-pre-wrap">
              {paragraph}
            </p>
          ))}
        </div>
      )}

      {trigger && (
        <div className="flex flex-col gap-1">
          <span className="text-content-secondary text-xs font-semibold tracking-widest uppercase">
            Trigger
          </span>
          <p className="text-content-secondary text-xs leading-relaxed whitespace-pre-wrap">
            {trigger}
          </p>
        </div>
      )}
    </div>
  );
}
