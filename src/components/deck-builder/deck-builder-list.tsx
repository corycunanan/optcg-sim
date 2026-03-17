"use client";

import { useState } from "react";
import type { DeckCardEntry } from "@/lib/deck-builder-state";
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

  // Sort by type (Character > Event > Stage), then cost, then name
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

  // Group by type
  const groups = new Map<string, DeckCardEntry[]>();
  for (const entry of sorted) {
    const key = entry.card.type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }

  if (cards.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <p className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
          No cards in deck yet
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
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
              <div
                className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-tertiary)" }}
              >
                <span>{type}s</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                  style={{
                    background: "var(--surface-3)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {groupTotal}
                </span>
              </div>

              <div className="space-y-1">
                {entries.map((entry) => {
                  const displayUrl = entry.selectedArtUrl || entry.card.imageUrl;
                  return (
                    <div
                      key={entry.cardId}
                      className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[0.03]"
                      style={{ borderLeft: "3px solid transparent" }}
                      onMouseEnter={(e) => {
                        const color = entry.card.color[0];
                        e.currentTarget.style.borderLeftColor =
                          COLOR_DOT[color] || "var(--border)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderLeftColor = "transparent";
                      }}
                    >
                      {/* Thumbnail — clickable to inspect */}
                      <button
                        onClick={() => setInspectEntry(entry)}
                        className="h-16 w-[46px] shrink-0 overflow-hidden rounded-lg transition-transform hover:scale-105"
                        style={{ border: "1px solid var(--border-subtle)" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={displayUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>

                      {/* Card info — clickable to inspect */}
                      <button
                        onClick={() => setInspectEntry(entry)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p
                          className="truncate text-sm font-semibold leading-tight"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {entry.card.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {entry.card.cost !== null && (
                            <span
                              className="text-[11px] font-bold tabular-nums"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {entry.card.cost}⬡
                            </span>
                          )}
                          {entry.card.power !== null && (
                            <span
                              className="text-[11px] tabular-nums"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {entry.card.power.toLocaleString()} PWR
                            </span>
                          )}
                          <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                            {entry.cardId}
                          </span>
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
                            <span
                              className="ml-1 text-[9px] font-medium"
                              style={{ color: "var(--teal-muted)" }}
                            >
                              Alt Art
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => onDecrement(entry.cardId)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold transition-colors hover:bg-white/10"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          −
                        </button>
                        <span
                          className="w-6 text-center text-base font-bold tabular-nums"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {entry.quantity}
                        </span>
                        <button
                          onClick={() => onIncrement(entry.cardId)}
                          disabled={entry.quantity >= 4}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold transition-colors hover:bg-white/10 disabled:opacity-30"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          +
                        </button>
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={() => onRemove(entry.cardId)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-xs opacity-0 transition-all group-hover:opacity-100 hover:bg-white/10"
                        style={{ color: "var(--error)" }}
                        title="Remove"
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

      {/* Inspect modal for deck cards */}
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
