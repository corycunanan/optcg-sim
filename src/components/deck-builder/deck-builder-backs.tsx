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
      <div className="rounded-md border border-border bg-card p-8 text-center">
        <p className="text-sm text-content-tertiary">No cards in deck yet</p>
        <p className="mt-1 text-sm text-content-tertiary">
          Add cards to see their backs
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-start gap-4">
      {groups.map((group) => (
        // A read-only sleeve preview: nothing here is clickable, focusable, or
        // tooltipped. So it keeps the card register's resting `shadow-sm` and
        // takes no hover step — a lift on an object you cannot pick up is a
        // promise the surface does not keep (ELEVATION-LANGUAGE §When you add a
        // surface). The DON grid next door is the same object and reads the
        // same way.
        <div key={group.cardId} className="flex w-min flex-col items-center">
          <CardFanStack
            cardId={group.cardId}
            count={group.count}
            className="relative"
            renderCard={(i) => (
              <div className="w-card-thumb rounded-card overflow-hidden border border-border shadow-sm aspect-card">
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
