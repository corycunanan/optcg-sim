"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { DeckCardEntry } from "@/lib/deck-builder-state";

interface CardSearchResult {
  id: string;
  name: string;
  color: string[];
  type: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  imageUrl: string;
  banStatus: string;
  blockNumber: number;
  traits: string[];
  attribute: string[];
  effectText: string;
  triggerText: string | null;
  rarity: string;
  originSet: string;
}

interface DeckBuilderSearchProps {
  onAddCard: (card: DeckCardEntry["card"]) => void;
  deckCards: Map<string, DeckCardEntry>;
  leaderColors: string[];
}

const COLORS = ["Red", "Blue", "Green", "Purple", "Black", "Yellow"];
const TYPES = ["Leader", "Character", "Event", "Stage"];

const COLOR_STYLE: Record<string, { bg: string; text: string }> = {
  Red: { bg: "var(--card-red)", text: "#fff" },
  Blue: { bg: "var(--card-blue)", text: "#fff" },
  Green: { bg: "var(--card-green)", text: "#fff" },
  Purple: { bg: "var(--card-purple)", text: "#fff" },
  Black: { bg: "var(--card-black)", text: "#ddd" },
  Yellow: { bg: "var(--card-yellow)", text: "#222" },
};

export function DeckBuilderSearch({
  onAddCard,
  deckCards,
  leaderColors,
}: DeckBuilderSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [activeColors, setActiveColors] = useState<string[]>([]);
  const [activeType, setActiveType] = useState<string>("");
  const [costMin, setCostMin] = useState("");
  const [costMax, setCostMax] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchCards = useCallback(
    async (
      searchQuery: string,
      searchPage: number,
      colors: string[],
      type: string,
      cMin: string,
      cMax: string,
    ) => {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (colors.length) params.set("color", colors.join(","));
      if (type) params.set("type", type);
      if (cMin) params.set("costMin", cMin);
      if (cMax) params.set("costMax", cMax);
      params.set("page", String(searchPage));
      params.set("limit", "40");
      params.set("sort", "cost");
      params.set("order", "asc");

      try {
        const res = await fetch(`/api/cards?${params.toString()}`);
        const data = await res.json();
        setResults(data.data || []);
        setTotal(data.total || 0);
      } catch {
        setResults([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchCards(query, 1, activeColors, activeType, costMin, costMax);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, activeColors, activeType, costMin, costMax, fetchCards]);

  // Page change
  useEffect(() => {
    if (page > 1) {
      fetchCards(query, page, activeColors, activeType, costMin, costMax);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleColor = (c: string) => {
    setActiveColors((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const totalPages = Math.ceil(total / 40);

  return (
    <div className="flex h-full flex-col">
      {/* Search input */}
      <div className="p-3 pb-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards…"
          className="w-full rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* Filters */}
      <div className="space-y-2 px-3 pt-2 pb-2">
        {/* Color filters */}
        <div className="flex flex-wrap gap-1">
          {COLORS.map((c) => {
            const active = activeColors.includes(c);
            const cs = COLOR_STYLE[c];
            return (
              <button
                key={c}
                onClick={() => toggleColor(c)}
                className="rounded px-2 py-0.5 text-[11px] font-medium transition-all"
                style={
                  active
                    ? { background: cs.bg, color: cs.text }
                    : {
                        background: "var(--surface-2)",
                        color: "var(--text-tertiary)",
                        border: "1px solid var(--border)",
                      }
                }
              >
                {c}
              </button>
            );
          })}
        </div>

        {/* Type + Cost filters */}
        <div className="flex items-center gap-2">
          <select
            value={activeType}
            onChange={(e) => setActiveType(e.target.value)}
            className="rounded px-2 py-1 text-xs focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            <option value="">All Types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="10"
              placeholder="Min"
              value={costMin}
              onChange={(e) => setCostMin(e.target.value)}
              className="w-14 rounded px-2 py-1 text-xs focus:outline-none"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            />
            <span
              className="text-[10px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              –
            </span>
            <input
              type="number"
              min="0"
              max="10"
              placeholder="Max"
              value={costMax}
              onChange={(e) => setCostMax(e.target.value)}
              className="w-14 rounded px-2 py-1 text-xs focus:outline-none"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            />
            <span
              className="text-[10px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              Cost
            </span>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div
        className="px-3 pb-1 text-[11px]"
        style={{ color: "var(--text-tertiary)" }}
      >
        {isLoading ? "Searching…" : `${total.toLocaleString()} cards`}
      </div>

      {/* Results grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 pb-3"
      >
        <div className="grid grid-cols-3 gap-1.5">
          {results.map((card) => {
            const inDeck = deckCards.get(card.id);
            const qtyInDeck = inDeck?.quantity || 0;
            const isLeaderColor =
              leaderColors.length === 0 ||
              card.color.some((c) => leaderColors.includes(c)) ||
              card.type === "Leader";

            return (
              <button
                key={card.id}
                onClick={() => onAddCard(card)}
                className="group relative overflow-hidden rounded-lg text-left transition-all duration-150 hover:-translate-y-0.5"
                style={{
                  background: "var(--surface-1)",
                  border: `1px solid ${qtyInDeck > 0 ? "var(--accent)" : "var(--border-subtle)"}`,
                  opacity: isLeaderColor ? 1 : 0.5,
                }}
              >
                <div className="relative aspect-[600/838] w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.05]"
                    loading="lazy"
                  />
                  {/* Quantity badge */}
                  {qtyInDeck > 0 && (
                    <div
                      className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{
                        background: "var(--accent)",
                        color: "var(--surface-0)",
                      }}
                    >
                      {qtyInDeck}
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div
                    className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ background: "oklch(0% 0 0 / 0.5)" }}
                  >
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        background: "var(--accent)",
                        color: "var(--surface-0)",
                      }}
                    >
                      {card.type === "Leader" ? "Set Leader" : "+ Add"}
                    </span>
                  </div>
                </div>
                {/* Mini info */}
                <div className="px-1.5 py-1">
                  <p
                    className="truncate text-[10px] font-medium leading-tight"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {card.name}
                  </p>
                  <div className="flex items-center gap-1">
                    {card.cost !== null && (
                      <span
                        className="text-[9px] font-bold tabular-nums"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {card.cost}⬡
                      </span>
                    )}
                    <span
                      className="text-[9px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {card.id}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded px-2 py-1 text-xs transition-colors disabled:opacity-30"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              ←
            </button>
            <span
              className="px-2 text-xs tabular-nums"
              style={{ color: "var(--text-tertiary)" }}
            >
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded px-2 py-1 text-xs transition-colors disabled:opacity-30"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
