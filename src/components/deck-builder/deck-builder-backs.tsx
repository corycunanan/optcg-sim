"use client";

import { cn } from "@/lib/utils";
import type { DeckCardEntry, DeckLeaderEntry } from "@/lib/deck-builder/state";
import { CardFanStack } from "@/components/ui";

interface DeckBuilderBacksProps {
  cards: DeckCardEntry[];
  leader: DeckLeaderEntry | null;
  sleeveUrl: string | null;
}

function buildBackGroups(
  leader: DeckLeaderEntry | null,
  cards: DeckCardEntry[],
): { cardId: string; count: number }[] {
  const groups: { cardId: string; count: number }[] = [];

  if (leader) {
    groups.push({ cardId: leader.id, count: 1 });
  }

  const sorted = [...cards].sort((a, b) => {
    const costA = a.card.cost ?? -1;
    const costB = b.card.cost ?? -1;
    if (costA !== costB) return costA - costB;
    return a.card.name.localeCompare(b.card.name);
  });

  for (const entry of sorted) {
    groups.push({ cardId: entry.cardId, count: entry.quantity });
  }

  return groups;
}

export function DeckBuilderBacks({ cards, leader, sleeveUrl }: DeckBuilderBacksProps) {
  const groups = buildBackGroups(leader, cards);

  if (!leader && cards.length === 0) {
    return (
      <div className="rounded border border-border bg-surface-1 p-8 text-center">
        <p className="text-sm font-medium text-content-tertiary">No cards in deck yet</p>
        <p className="mt-1 text-xs text-content-tertiary">
          Add cards to see their backs
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-start gap-4">
      {groups.map((group) => (
        <div key={group.cardId} className="group/stack flex w-min flex-col items-center">
          <CardFanStack
            cardId={group.cardId}
            count={group.count}
            className="relative"
            renderCard={(i) => (
              <div className="w-card-thumb overflow-hidden rounded border border-border shadow-sm aspect-card group-hover/stack:-translate-y-2 transition-transform duration-150">
                {sleeveUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sleeveUrl}
                    alt="Card back"
                    className={cn(
                      "h-full w-full object-cover",
                      group.count > 1 && i > 0 && "brightness-90",
                    )}
                  />
                ) : (
                  <div
                    className={cn(
                      "h-full w-full bg-navy-900",
                      group.count > 1 && i > 0 && "brightness-90",
                    )}
                  />
                )}
              </div>
            )}
          />
        </div>
      ))}
    </div>
  );
}
