"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { DeckCardEntry, DeckLeaderEntry } from "@/lib/deck-builder/state";
import { Input } from "@/components/ui/input";
import { DeckBuilderCardModal } from "./deck-builder-card-modal";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import {
  collectDeckRestrictionRules,
  getDeckCardCopyLimit,
  isCardAllowedByDeckRestrictionRules,
} from "@/lib/deck-builder/validation";

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
  effectSchema?: unknown | null;
}

interface DeckBuilderSearchProps {
  onAddCard: (card: DeckCardEntry["card"]) => void;
  onRemoveCard: (cardId: string) => void;
  onSetArtVariant: (cardId: string, artUrl: string | null) => void;
  deckCards: Map<string, DeckCardEntry>;
  leader: DeckLeaderEntry | null;
}

const COLORS = ["Red", "Blue", "Green", "Purple", "Black", "Yellow"];
const TYPES = ["Leader", "Character", "Event", "Stage"];

// Card color backgrounds (dynamic — CSS variables only, no hardcoded hex)
const COLOR_BG: Record<string, string> = {
  Red: "var(--card-red)",
  Blue: "var(--card-blue)",
  Green: "var(--card-green)",
  Purple: "var(--card-purple)",
  Black: "var(--card-black)",
  Yellow: "var(--card-yellow)",
};

export function DeckBuilderSearch({
  onAddCard,
  onRemoveCard,
  onSetArtVariant,
  deckCards,
  leader,
}: DeckBuilderSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [activeColors, setActiveColors] = useState<string[]>([]);
  const [activeType, setActiveType] = useState<string>("Leader");
  const [costMin, setCostMin] = useState("");
  const [costMax, setCostMax] = useState("");
  const [inspectCard, setInspectCard] = useState<CardSearchResult | null>(null);
  const [pendingArtVariants, setPendingArtVariants] = useState<
    Map<string, string | null>
  >(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchCards = useCallback(
    async (
      searchQuery: string,
      searchPage: number,
      colors: string[],
      type: string,
      cMin: string,
      cMax: string
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
        const json = await apiGet<{
          data: CardSearchResult[];
          pagination?: { total: number };
        }>(`/api/cards?${params.toString()}`);
        setResults(json.data || []);
        setTotal(json.pagination?.total || 0);
      } catch {
        setResults([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchCards(query, 1, activeColors, activeType, costMin, costMax);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, activeColors, activeType, costMin, costMax, fetchCards]);

  useEffect(() => {
    if (page > 1) {
      fetchCards(query, page, activeColors, activeType, costMin, costMax);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a leader is selected/changed, auto-filter to their compatible colors
  const leaderColors = useMemo(() => leader?.color ?? [], [leader]);
  // Rules depend only on the leader — don't re-parse its schema per card per render
  const leaderRestrictionRules = useMemo(
    () => (leader ? collectDeckRestrictionRules(leader) : []),
    [leader]
  );
  const leaderColorsKey = useMemo(() => leaderColors.join(","), [leaderColors]);
  const prevLeaderColorsKeyRef = useRef("");
  useEffect(() => {
    if (
      leaderColorsKey !== "" &&
      leaderColorsKey !== prevLeaderColorsKeyRef.current
    ) {
      prevLeaderColorsKeyRef.current = leaderColorsKey;
      setActiveColors(leaderColors);
      setActiveType(""); // switch from Leader type filter to all types
    }
  }, [leaderColorsKey, leaderColors]);

  const toggleColor = (c: string) => {
    setActiveColors((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  const totalPages = Math.ceil(total / 40);

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Search input */}
        <div className="px-3 pt-3">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards..."
          />
        </div>

        {/* Filters */}
        <div className="space-y-2 px-3 py-2">
          {/* Color filters */}
          <div className="flex flex-wrap gap-1">
            {COLORS.map((c) => {
              const active = activeColors.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleColor(c)}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium transition-all",
                    active
                      ? c === "Yellow"
                        ? "text-content-primary"
                        : "text-content-inverse"
                      : "border-border bg-surface-2 text-content-tertiary hover:border-border-strong border"
                  )}
                  style={active ? { background: COLOR_BG[c] } : undefined}
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
              className="border-border bg-surface-1 text-content-secondary focus:border-border-focus rounded border px-2 py-1 text-xs focus:outline-none"
            >
              <option value="">All Types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={10}
                placeholder="Min"
                value={costMin}
                onChange={(e) => setCostMin(e.target.value)}
                className="h-7 w-14 px-2 text-xs"
              />
              <span className="text-content-tertiary text-xs">-</span>
              <Input
                type="number"
                min={0}
                max={10}
                placeholder="Max"
                value={costMax}
                onChange={(e) => setCostMax(e.target.value)}
                className="h-7 w-14 px-2 text-xs"
              />
              <span className="text-content-tertiary text-xs">Cost</span>
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="text-content-tertiary px-3 pb-1 text-xs">
          {isLoading ? "Searching…" : `${total.toLocaleString()} cards`}
        </div>

        {/* Results grid */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="grid grid-cols-3 gap-2">
            {results.map((card) => {
              const inDeck = deckCards.get(card.id);
              const qtyInDeck = inDeck?.quantity || 0;
              const isLeaderColor =
                leaderColors.length === 0 ||
                card.color.some((c) => leaderColors.includes(c)) ||
                card.type === "Leader";
              const isLeaderRestrictionAllowed =
                card.type === "Leader" ||
                isCardAllowedByDeckRestrictionRules(
                  leaderRestrictionRules,
                  card
                );

              return (
                <button
                  key={card.id}
                  aria-label={`Inspect ${card.name}`}
                  onClick={() => setInspectCard(card)}
                  className={cn(
                    "group bg-surface-1 relative overflow-hidden rounded border-0 text-left transition-all duration-150 hover:shadow-sm active:scale-[0.97]",
                    qtyInDeck > 0 ? "border-navy-900" : "border-border",
                    (!isLeaderColor || !isLeaderRestrictionAllowed) &&
                      "opacity-40"
                  )}
                >
                  <div className="aspect-card relative w-full overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                    {qtyInDeck > 0 && (
                      <div className="bg-navy-900 text-content-inverse absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold">
                        {qtyInDeck}
                      </div>
                    )}
                  </div>
                  {/* Mini info */}
                  <div className="px-1.5 py-1">
                    <p className="text-content-primary truncate text-xs leading-tight font-medium">
                      {card.name}
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="text-content-tertiary text-xs">
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
                aria-label="Previous page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="border-border text-content-secondary hover:bg-surface-2 flex h-9 w-9 items-center justify-center rounded border text-sm transition-colors disabled:opacity-30"
              >
                ←
              </button>
              <span className="text-content-tertiary px-2 text-xs tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                aria-label="Next page"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="border-border text-content-secondary hover:bg-surface-2 flex h-9 w-9 items-center justify-center rounded border text-sm transition-colors disabled:opacity-30"
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>

      {inspectCard && (
        <DeckBuilderCardModal
          cardId={inspectCard.id}
          isLeader={inspectCard.type === "Leader"}
          quantityInDeck={
            inspectCard.type === "Leader"
              ? 0
              : deckCards.get(inspectCard.id)?.quantity || 0
          }
          copyLimit={getDeckCardCopyLimit(inspectCard)}
          selectedArtUrl={
            deckCards.get(inspectCard.id)?.selectedArtUrl ??
            pendingArtVariants.get(inspectCard.id) ??
            null
          }
          onAdd={() => {
            onAddCard(inspectCard);
            const pendingArt = pendingArtVariants.get(inspectCard.id);
            if (pendingArt) onSetArtVariant(inspectCard.id, pendingArt);
          }}
          onRemove={() => onRemoveCard(inspectCard.id)}
          onSetArtVariant={(artUrl) => {
            setPendingArtVariants((prev) =>
              new Map(prev).set(inspectCard.id, artUrl)
            );
            if (deckCards.has(inspectCard.id))
              onSetArtVariant(inspectCard.id, artUrl);
          }}
          onClose={() => setInspectCard(null)}
        />
      )}
    </>
  );
}
