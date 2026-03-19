"use client";

import { useState } from "react";
import type { DeckCardEntry } from "@/lib/deck-builder/state";
import { CardInspectModal } from "./card-inspect-modal";

const COLOR_DOT: Record<string, string> = {
  Red: "var(--card-red)",
  Blue: "var(--card-blue)",
  Green: "var(--card-green)",
  Purple: "var(--card-purple)",
  Black: "var(--card-black)",
  Yellow: "var(--card-yellow)",
};

interface DeckBuilderListProps {
  cards: DeckCardEntry[];
  onIncrement: (cardId: string) => void;
  onDecrement: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onSetQuantity: (cardId: string, quantity: number) => void;
  onSetArtVariant: (cardId: string, artUrl: string | null) => void;
  onAddCard: (card: DeckCardEntry["card"]) => void;
}

export function DeckBuilderList({
  cards,
  onIncrement,
  onDecrement,
  onRemove,
  onSetArtVariant,
  onAddCard,
}: DeckBuilderListProps) {
  const [inspectEntry, setInspectEntry] = useState<DeckCardEntry | null>(null);

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

              <div className="space-y-1">
                {entries.map((entry) => {
                  const displayUrl = entry.selectedArtUrl || entry.card.imageUrl;
                  const rowColor = COLOR_DOT[entry.card.color[0]] || "var(--border)";
                  return (
                    <div
                      key={entry.cardId}
                      className="group flex items-center gap-3 rounded px-3 py-2 transition-colors hover:bg-surface-2"
                    >
                      {/* Thumbnail */}
                      <button
                        aria-label={`Inspect ${entry.card.name}`}
                        onClick={() => setInspectEntry(entry)}
                        className="h-16 w-[46px] shrink-0 overflow-hidden rounded transition-transform hover:scale-105"
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
                      <button aria-label={`Inspect ${entry.card.name}`} onClick={() => setInspectEntry(entry)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold leading-tight text-content-primary">
                          {entry.card.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          {entry.card.cost !== null && (
                            <span className="text-xs font-bold tabular-nums text-content-tertiary">
                              {entry.card.cost}⬡
                            </span>
                          )}
                          {entry.card.power !== null && (
                            <span className="text-xs tabular-nums text-content-tertiary">
                              {entry.card.power.toLocaleString()} PWR
                            </span>
                          )}
                          <span className="text-xs text-content-tertiary">{entry.cardId}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1">
                          {entry.card.color.map((c) => (
                            <span
                              key={c}
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ background: COLOR_DOT[c] }}
                            />
                          ))}
                          {entry.selectedArtUrl && (
                            <span className="ml-1 text-xs font-medium text-navy-500">Alt Art</span>
                          )}
                        </div>
                      </button>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-1">
                        <button
                          aria-label="Remove one"
                          onClick={() => onDecrement(entry.cardId)}
                          className="flex h-9 w-9 items-center justify-center rounded text-sm font-bold text-content-secondary transition-colors hover:bg-surface-3 active:scale-95"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-base font-bold tabular-nums text-content-primary">
                          {entry.quantity}
                        </span>
                        <button
                          aria-label="Add one"
                          onClick={() => onIncrement(entry.cardId)}
                          disabled={entry.quantity >= 4}
                          className="flex h-9 w-9 items-center justify-center rounded text-sm font-bold text-content-secondary transition-colors hover:bg-surface-3 active:scale-95 disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>

                      {/* Remove button */}
                      <button
                        aria-label={`Remove ${entry.card.name}`}
                        onClick={() => onRemove(entry.cardId)}
                        className="flex h-9 w-9 items-center justify-center rounded text-xs text-error opacity-0 transition-all hover:bg-error-soft active:scale-95 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {inspectEntry && (
        <CardInspectModal
          cardId={inspectEntry.cardId}
          preloadedCard={inspectEntry.card}
          quantityInDeck={inspectEntry.quantity}
          selectedArtUrl={inspectEntry.selectedArtUrl}
          onAddCard={() => onAddCard(inspectEntry.card)}
          onRemoveCard={() => onDecrement(inspectEntry.cardId)}
          onSetArtVariant={(artUrl) => onSetArtVariant(inspectEntry.cardId, artUrl)}
          onClose={() => setInspectEntry(null)}
        />
      )}
    </>
  );
}
