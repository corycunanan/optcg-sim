"use client";

import { cn } from "@/lib/utils";
import {
  CardFanStack,
  CardInfoPanel,
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
                className="focus-visible:ring-border-focus flex cursor-pointer rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <CardFanStack
                  cardId={group.card.id}
                  count={group.count}
                  renderCard={(i) => (
                    <div className="w-card-thumb border-border aspect-card rounded-card overflow-hidden border shadow-sm transition-[translate,box-shadow] duration-150 hover:z-10 hover:-translate-y-2 hover:shadow-md">
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
              Tier-5 information surface. `CardInfoPanel` owns the surface —
              flat opaque dark, square corners, one neutral hairline lit
              top-left → bottom-right — so the HoverCard primitive is reduced
              to a bare positioner through tailwind-merge rather than nesting
              a second visible panel around it.
            */}
            <HoverCardContent
              side="top"
              className="w-72 rounded-none border-0 bg-transparent p-0 shadow-none"
            >
              <CardInfoPanel
                name={group.card.name}
                cardType={group.card.type}
                cardId={group.card.id}
                cost={group.card.cost}
                power={group.card.power}
                counter={group.card.counter}
                life={group.card.life}
                colors={group.card.color}
                traits={group.card.traits}
                attribute={group.card.attribute}
                effectText={group.card.effectText}
                triggerText={group.card.triggerText}
              />
            </HoverCardContent>
          </HoverCard>
          {showCounts && (
            <span
              className="text-content-tertiary text-sm font-semibold tabular-nums"
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
