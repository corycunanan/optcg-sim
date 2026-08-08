"use client";

import { cn } from "@/lib/utils";
import {
  CardFanStack,
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui";
import type { DeckDetailResponse } from "@/lib/validators/cards";

type DeckData = DeckDetailResponse["data"];
export type DeckCardInfo = NonNullable<DeckData["leader"]>;

export interface DeckCardGroup {
  card: DeckCardInfo;
  imageUrl: string;
  count: number;
}

/** Group cards by cardId, preserving order. Leader is its own group. */
export function groupDeckCards(deck: DeckData): DeckCardGroup[] {
  const groups: DeckCardGroup[] = [];

  if (deck.leader) {
    groups.push({
      card: deck.leader,
      imageUrl: deck.leaderArtUrl ?? deck.leader.imageUrl,
      count: 1,
    });
  }

  for (const dc of deck.cards) {
    groups.push({
      card: dc.card,
      imageUrl: dc.selectedArtUrl ?? dc.card.imageUrl,
      count: dc.quantity,
    });
  }

  return groups;
}

export function deckCardTotal(groups: DeckCardGroup[]): number {
  return groups.reduce((sum, group) => sum + group.count, 0);
}

/** The single accessible name for a fanned stack: name plus copy count. */
function stackLabel(group: DeckCardGroup): string {
  return `${group.card.name}, ${group.count} ${
    group.count === 1 ? "copy" : "copies"
  }`;
}

/* ── Stat pill for the hover tooltip ─────────────────────────────────── */

/**
 * Tier-5 convention: every numeric value is white. The stat's identity is
 * carried by its label, not by a per-stat hue — the previous cost/power/
 * counter colouring competed with card art for chroma and leaned on
 * off-system palette classes.
 */
function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="px-2 text-center">
      <div className="text-content-primary text-sm font-bold">
        {String(value)}
      </div>
      <div className="text-content-tertiary text-xs tracking-wide uppercase">
        {label}
      </div>
    </div>
  );
}

/* ── Card tooltip content (mirrors game board tooltip) ───────────────── */

function CardTooltip({ card }: { card: DeckCardInfo }) {
  const isFieldCard = card.type === "Leader" || card.type === "Character";

  return (
    <>
      <div className="text-content-primary text-sm font-bold">{card.name}</div>
      <div className="text-content-tertiary mb-3 text-xs">
        {card.type} &middot; {card.id}
      </div>

      {isFieldCard ? (
        <div className="mb-3 flex flex-wrap gap-5 text-xs">
          {card.type === "Leader" ? (
            <StatPill label="Life" value={card.life ?? card.cost ?? 0} />
          ) : (
            <StatPill label="Cost" value={card.cost ?? 0} />
          )}
          <StatPill label="Power" value={(card.power ?? 0).toLocaleString()} />
          {card.type !== "Leader" && (
            <StatPill
              label="Counter"
              value={card.counter != null ? `+${card.counter}` : "—"}
            />
          )}
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          {card.cost != null && <StatPill label="Cost" value={card.cost} />}
          {card.life != null && <StatPill label="Life" value={card.life} />}
        </div>
      )}

      {card.effectText && (
        <div className="text-content-secondary border-border flex flex-col gap-2 border-t pt-3 text-xs leading-relaxed">
          {card.effectText.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {paragraph}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * The deck art grid shared by the deck preview and the change-deck modal:
 * one fanned stack per distinct card, hover for the full card tooltip.
 *
 * `showCounts` adds an explicit `×N` caption beneath each stack. The preview
 * modal leaves it off — there the fan itself is the count. The change-deck
 * modal turns it on because that surface is a decision ("is this the list I
 * want?"), where reading a number beats counting overlapped art.
 */
export function DeckCardGrid({
  groups,
  showCounts = false,
  className,
}: {
  groups: DeckCardGroup[];
  showCounts?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap justify-start gap-4", className)}>
      {groups.map((group) => (
        <div key={group.card.id} className="flex flex-col gap-1">
          <HoverCard openDelay={200} closeDelay={0}>
            <HoverCardTrigger asChild>
              {/*
                A real button so the stack is tabbable and Radix's focus path
                opens the tooltip — the fan is the only way to reach a card's
                cost/power/effect text. It carries the single accessible name
                for the whole stack; the art inside is decorative and the ×N
                caption is hidden, so a four-copy card announces once.
              */}
              <button
                type="button"
                aria-label={stackLabel(group)}
                className="focus-visible:ring-border-focus flex cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <CardFanStack
                  cardId={group.card.id}
                  count={group.count}
                  renderCard={(i) => (
                    <div className="w-card-thumb border-border aspect-card overflow-hidden rounded border shadow-sm transition-transform duration-150 hover:z-10 hover:-translate-y-2">
                      <img
                        src={group.imageUrl}
                        alt=""
                        className={cn(
                          "h-full w-full object-cover",
                          group.count > 1 && i > 0 && "brightness-90"
                        )}
                        loading="lazy"
                      />
                    </div>
                  )}
                />
              </button>
            </HoverCardTrigger>
            {/*
              Tier-5 information surface: square corners, flat opaque dark,
              neutral hairline lit top-left → bottom-right, no glow. The
              overrides land through tailwind-merge against the shared
              HoverCard primitive rather than editing it.
            */}
            <HoverCardContent
              side="top"
              className="bg-surface-info edge-info w-72 rounded-none shadow-none"
              data-tier5-surface
            >
              <CardTooltip card={group.card} />
            </HoverCardContent>
          </HoverCard>
          {showCounts && (
            <span
              className="text-content-tertiary text-xs font-semibold tabular-nums"
              aria-hidden="true"
            >
              ×{group.count}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
