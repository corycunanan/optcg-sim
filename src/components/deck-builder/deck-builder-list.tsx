"use client";

import { useState } from "react";
import type { DeckCardEntry } from "@/lib/deck-builder/state";
import { CardDetailModal } from "@/components/admin/card-detail-modal";

interface DeckBuilderListProps {
  cards: DeckCardEntry[];
  onIncrement: (cardId: string) => void;
  onDecrement: (cardId: string) => void;
  onSetArtVariant: (cardId: string, artUrl: string | null) => void;
  onAddCard: (card: DeckCardEntry["card"]) => void;
}

export function DeckBuilderList({
  cards,
  onIncrement,
  onDecrement,
  onSetArtVariant,
  onAddCard,
}: DeckBuilderListProps) {
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);
  const inspectEntry = inspectCardId ? cards.find((e) => e.cardId === inspectCardId) ?? null : null;

  const typeOrder: Record<string, number> = {
    Character: 0,
    Event: 1,
    Stage: 2,
    Leader: 3,
  };

  const sorted = [...cards].sort((a, b) => {
    const typeA = typeOrder[a.card.type] ?? 4;
    const typeB = typeOrder[b.card.type] ?? 4;
    if (typeA !== typeB) return typeA - typeB;
    const costA = a.card.cost ?? -1;
    const costB = b.card.cost ?? -1;
    if (costA !== costB) return costA - costB;
    return a.card.name.localeCompare(b.card.name);
  });

  const groups = new Map<string, DeckCardEntry[]>();
  for (const entry of sorted) {
    const key = entry.card.type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }

  if (cards.length === 0) {
    return (
      <div className="rounded border border-border bg-surface-1 p-8 text-center">
        <p className="text-sm font-medium text-content-tertiary">No cards in deck yet</p>
        <p className="mt-1 text-xs text-content-tertiary">
          Click cards from the search panel to add them
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {Array.from(groups.entries()).map(([type, entries]) => {
          const groupTotal = entries.reduce((sum, e) => sum + e.quantity, 0);
          return (
            <div key={type}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-content-tertiary">
                <span>{type}s</span>
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-bold tabular-nums text-content-secondary">
                  {groupTotal}
                </span>
              </div>

              <div className="divide-y divide-border">
                {entries.map((entry) => {
                  const displayUrl = entry.selectedArtUrl || entry.card.imageUrl;
                  return (
                    <div
                      key={entry.cardId}
                      className="flex items-center gap-3 py-1"
                    >
                      {/* Thumbnail */}
                      <button
                        aria-label={`Inspect ${entry.card.name}`}
                        onClick={() => setInspectCardId(entry.cardId)}
                        className="h-12 w-[34px] shrink-0 overflow-hidden rounded transition-transform hover:scale-105"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={displayUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>

                      {/* Card info */}
                      <button aria-label={`Inspect ${entry.card.name}`} onClick={() => setInspectCardId(entry.cardId)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium leading-tight text-content-primary">
                          {entry.card.name}
                        </p>
                        {entry.card.power !== null && (
                          <p className="text-xs tabular-nums text-content-tertiary">
                            {entry.card.power.toLocaleString()} PWR
                          </p>
                        )}
                      </button>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-1">
                        <button
                          aria-label="Remove one"
                          onClick={() => onDecrement(entry.cardId)}
                          className="flex h-6 w-6 items-center justify-center rounded text-sm font-bold text-content-tertiary transition-colors hover:bg-surface-2 hover:text-content-primary active:scale-95"
                        >
                          −
                        </button>
                        <span className="w-4 text-center text-sm font-bold tabular-nums text-content-primary">
                          {entry.quantity}
                        </span>
                        <button
                          aria-label="Add one"
                          onClick={() => onIncrement(entry.cardId)}
                          disabled={entry.quantity >= 4}
                          className="flex h-6 w-6 items-center justify-center rounded text-sm font-bold text-content-tertiary transition-colors hover:bg-surface-2 hover:text-content-primary active:scale-95 disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {inspectEntry && (
        <CardDetailModal
          cardId={inspectEntry.cardId}
          onClose={() => setInspectCardId(null)}
          deckActions={{
            quantityInDeck: inspectEntry.quantity,
            selectedArtUrl: inspectEntry.selectedArtUrl,
            onAdd: () => onAddCard(inspectEntry.card),
            onRemove: () => onDecrement(inspectEntry.cardId),
            onSetArtVariant: (artUrl) => onSetArtVariant(inspectEntry.cardId, artUrl),
          }}
        />
      )}
    </>
  );
}
