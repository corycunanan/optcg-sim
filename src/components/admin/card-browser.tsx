"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
import { CardGrid } from "./card-grid";
import { CardFilters } from "./card-filters";
import { Pagination } from "./pagination";

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
  artVariants: { id: string }[];
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
      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cards by name..."
            className="flex-1 rounded-lg px-4 py-2.5 text-sm transition-colors focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <button
            type="submit"
            className="rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors"
            style={{
              background: "var(--accent)",
              color: "var(--surface-0)",
            }}
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
              className="rounded-lg px-4 py-2.5 text-sm transition-colors"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
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

      {/* Results count */}
      <div
        className="mt-4 mb-4 text-sm"
        style={{ color: "var(--text-tertiary)" }}
      >
        Showing {initialCards.length} of {total.toLocaleString()} cards
        {currentFilters.q && (
          <span>
            {" "}
            matching &ldquo;
            <strong style={{ color: "var(--text-secondary)" }}>
              {currentFilters.q}
            </strong>
            &rdquo;
          </span>
        )}
        {currentFilters.originOnly === "true" && (
          <span
            className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: "var(--sage-muted)",
              color: "var(--sage)",
            }}
          >
            Origin sets only
          </span>
        )}
      </div>

      <CardGrid cards={initialCards} />

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={(newPage) =>
            updateFilters({ page: String(newPage) })
          }
        />
      )}
    </div>
  );
}
