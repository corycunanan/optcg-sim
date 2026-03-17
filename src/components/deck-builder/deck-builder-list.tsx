"use client";

import type { DeckCardEntry } from "@/lib/deck-builder-state";

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
}

export function DeckBuilderList({
  cards,
  onIncrement,
  onDecrement,
  onRemove,
}: DeckBuilderListProps) {
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
        <p
          className="text-sm font-medium"
          style={{ color: "var(--text-tertiary)" }}
        >
          No cards in deck yet
        </p>
        <p
          className="mt-1 text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          Click cards from the search panel to add them
        </p>
      </div>
    );
  }

  return (
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

            <div className="space-y-0.5">
              {entries.map((entry) => (
                <div
                  key={entry.cardId}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
                  style={{ borderLeft: "3px solid transparent" }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget;
                    const color = entry.card.color[0];
                    el.style.borderLeftColor = COLOR_DOT[color] || "var(--border)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderLeftColor = "transparent";
                  }}
                >
                  {/* Thumbnail */}
                  <div className="h-10 w-7 shrink-0 overflow-hidden rounded">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.card.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  {/* Card info */}
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium leading-tight"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {entry.card.name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {entry.card.cost !== null && (
                        <span
                          className="text-[10px] font-bold tabular-nums"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {entry.card.cost}⬡
                        </span>
                      )}
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {entry.cardId}
                      </span>
                      {/* Color dots */}
                      <div className="flex gap-0.5">
                        {entry.card.color.map((c) => (
                          <span
                            key={c}
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: COLOR_DOT[c] }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => onDecrement(entry.cardId)}
                      className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition-colors hover:bg-white/10"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      −
                    </button>
                    <span
                      className="w-5 text-center text-sm font-bold tabular-nums"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {entry.quantity}
                    </span>
                    <button
                      onClick={() => onIncrement(entry.cardId)}
                      disabled={entry.quantity >= 4}
                      className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition-colors hover:bg-white/10 disabled:opacity-30"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      +
                    </button>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => onRemove(entry.cardId)}
                    className="flex h-6 w-6 items-center justify-center rounded text-xs opacity-0 transition-all group-hover:opacity-100 hover:bg-white/10"
                    style={{ color: "var(--error)" }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
