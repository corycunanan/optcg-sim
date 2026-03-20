"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import { CardGrid } from "./card-grid";
import { CardFilters } from "./card-filters";
import { Pagination } from "./pagination";
import { CardDetailModal } from "./card-detail-modal";

interface CardBrowserProps {
  initialCards: CardWithRelations[];
  total: number;
  page: number;
  totalPages: number;
  sets: { setLabel: string; setName: string; packId: string }[];
  currentFilters: {
    q: string;
    color: string;
    type: string;
    set: string;
    block: string;
    originOnly: string;
  };
}

export interface CardWithRelations {
  id: string;
  originSet: string;
  name: string;
  color: string[];
  type: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  attribute: string[];
  traits: string[];
  rarity: string;
  effectText: string;
  triggerText: string | null;
  imageUrl: string;
  blockNumber: number;
  banStatus: string;
  isReprint: boolean;
  _count: { artVariants: number };
  cardSets: { setLabel: string }[];
}

export function CardBrowser({
  initialCards,
  total,
  page,
  totalPages,
  sets,
  currentFilters,
}: CardBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentFilters.q);
  const [modalCardId, setModalCardId] = useState<string | null>(null);
  const pendingEdgeRef = useRef<"first" | "last" | null>(null);

  const cardIds = initialCards.map((c) => c.id);
  const cardIdsKey = cardIds.join(",");
  const prevCardIdsKeyRef = useRef(cardIdsKey);

  // When a page load is triggered by cross-page navigation, auto-navigate to edge card
  useEffect(() => {
    if (pendingEdgeRef.current && cardIdsKey !== prevCardIdsKeyRef.current) {
      prevCardIdsKeyRef.current = cardIdsKey;
      const edge = pendingEdgeRef.current;
      pendingEdgeRef.current = null;
      if (edge === "first" && cardIds.length > 0) {
        setModalCardId(cardIds[0]);
      } else if (edge === "last" && cardIds.length > 0) {
        setModalCardId(cardIds[cardIds.length - 1]);
      }
    }
  }, [cardIdsKey, cardIds]);

  const updateFilters = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }

      // Reset to page 1 when filters change
      if (!("page" in updates)) {
        params.delete("page");
      }

      router.push(`/admin/cards?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      updateFilters({ q: search });
    },
    [search, updateFilters],
  );

  const hasFilters =
    currentFilters.q ||
    currentFilters.color ||
    currentFilters.type ||
    currentFilters.set ||
    currentFilters.block ||
    currentFilters.originOnly;

  return (
    <div>
      {/* Page header */}
      <div className="-mx-6 -mt-8 mb-8 bg-surface-1 px-6 pb-6 pt-8">
        {/* Title + count */}
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="font-display text-3xl font-bold tracking-tight text-content-primary">
            Card Database
          </h1>
          <span className="text-sm tabular-nums text-content-tertiary">
            Showing {initialCards.length} of {total.toLocaleString()} cards
            {currentFilters.q && (
              <span>
                {" "}matching &ldquo;
                <strong className="text-content-secondary">{currentFilters.q}</strong>
                &rdquo;
              </span>
            )}
            {currentFilters.originOnly === "true" && (
              <span className="ml-3 rounded-full bg-gold-100 px-2 py-1 text-xs font-medium text-gold-500">
                Origin sets only
              </span>
            )}
          </span>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cards by name..."
              className="flex-1 rounded border border-border bg-surface-2 px-4 py-2 text-sm text-content-primary transition-colors focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-navy-900 px-6 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800"
            >
              Search
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  router.push("/admin/cards");
                }}
                className="rounded border border-border px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-2"
              >
                Clear
              </button>
            )}
          </div>
        </form>

        {/* Filters */}
        <CardFilters
          sets={sets}
          currentFilters={currentFilters}
          onFilterChange={updateFilters}
        />
      </div>

      <CardGrid cards={initialCards} onCardClick={setModalCardId} />

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={(newPage) => updateFilters({ page: String(newPage) })}
        />
      )}

      {/* Card detail modal */}
      {modalCardId && (
        <CardDetailModal
          cardId={modalCardId}
          cardIds={cardIds}
          isFirstPage={page === 1}
          isLastPage={page === totalPages}
          onNavigate={setModalCardId}
          onPrevPage={() => {
            pendingEdgeRef.current = "last";
            updateFilters({ page: String(page - 1) });
          }}
          onNextPage={() => {
            pendingEdgeRef.current = "first";
            updateFilters({ page: String(page + 1) });
          }}
          onClose={() => setModalCardId(null)}
        />
      )}
    </div>
  );
}
