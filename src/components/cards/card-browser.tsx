"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CardDetailModal,
  type CardDetail,
} from "@/components/cards/card-detail-modal";
import { isSubstringSearchQueryTooShort } from "@/lib/search-query";
import { Badge } from "@/components/ui/badge";
import {
  ALL_CARD_SETS_FILTER,
  countCardFilterDraft,
  parseCardFilterDraft,
  serializeCardFilterDraft,
  type CardBrowserFilters,
  type CardFilterDraft,
} from "@/lib/cards/browser-params";
import { CardGrid } from "./card-grid";
import {
  CardFiltersDialog,
  CARD_FILTERS_DIALOG_ID,
} from "./card-filters-dialog";
import { Pagination } from "./pagination";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
} from "@/components/ui/page-header";

export interface CardBrowserProps {
  initialCards: CardWithRelations[];
  total: number;
  page: number;
  totalPages: number;
  sets: { setLabel: string; setName: string; packId: string }[];
  currentFilters: CardBrowserFilters;
  routePath: string;
  /**
   * Route of the matching set browser. When supplied the header carries a
   * wayfinding link to it — the only inbound route to the set browser now that
   * the navbar's Cards dropdown is gone (OPT-680); `SetBrowser` itself only
   * links outward, into filtered card views.
   */
  setsPath?: string;
  renderDetailActions?: (card: CardDetail | null) => React.ReactNode;
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
  routePath,
  setsPath,
  renderDetailActions,
}: CardBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentFilters.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
        queueMicrotask(() => setModalCardId(cardIds[0]));
      } else if (edge === "last" && cardIds.length > 0) {
        queueMicrotask(() => setModalCardId(cardIds[cardIds.length - 1]));
      }
    }
  }, [cardIdsKey, cardIds]);

  const updateFilters = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());

      if (!("set" in updates) && !params.has("set") && currentFilters.set) {
        params.set("set", currentFilters.set);
      }

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

      router.push(`${routePath}?${params.toString()}`);
    },
    [currentFilters.set, routePath, router, searchParams]
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubstringSearchQueryTooShort(search)) return;
      updateFilters({ q: search });
    },
    [search, updateFilters]
  );

  const searchTooShort = isSubstringSearchQueryTooShort(search);

  const activeFilterCount = countCardFilterDraft(
    parseCardFilterDraft(currentFilters)
  );

  // Draft-then-commit: the dialog hands back one draft and this is the only
  // navigation the whole filter surface performs.
  const handleApplyFilters = useCallback(
    (draft: CardFilterDraft) => {
      setFiltersOpen(false);
      const updates = serializeCardFilterDraft(draft);
      const applied = serializeCardFilterDraft(
        parseCardFilterDraft(currentFilters)
      );
      const unchanged = Object.keys(updates).every(
        (key) => updates[key] === applied[key]
      );
      if (unchanged) return;
      updateFilters(updates);
    },
    [currentFilters, updateFilters]
  );

  const clearAllFilters = useCallback(() => {
    setSearch("");
    updateFilters({
      q: "",
      set: ALL_CARD_SETS_FILTER,
      color: "",
      type: "",
      block: "",
      originOnly: "",
    });
  }, [updateFilters]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Page header — fixed to top */}
      <PageHeader className="shrink-0">
        <PageHeaderContent>
          <PageHeaderTitle>Card Database</PageHeaderTitle>
          <PageHeaderDescription>
            Showing {initialCards.length} of {total.toLocaleString()} cards
            {currentFilters.q && (
              <span>
                {" "}
                matching &ldquo;
                <strong className="text-content-primary">
                  {currentFilters.q}
                </strong>
                &rdquo;
              </span>
            )}
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          {setsPath && (
            <Button asChild variant="default">
              <Link href={setsPath}>
                Browse sets
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
          )}
          <Button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            aria-controls={CARD_FILTERS_DIALOG_ID}
            aria-label={
              activeFilterCount > 0
                ? `Filter — ${activeFilterCount} applied`
                : undefined
            }
          >
            <Filter data-icon="inline-start" />
            Filter
            {activeFilterCount > 0 && (
              <Badge aria-hidden>{activeFilterCount}</Badge>
            )}
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {/* Scrollable content area */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Search bar */}
        <div className="mx-auto w-full max-w-7xl px-6 py-8">
          <form onSubmit={handleSearch}>
            <div className="flex gap-2">
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cards by name..."
                className="flex-1"
                aria-describedby="card-search-help"
              />
              <Button type="submit" disabled={searchTooShort}>
                Search
              </Button>
            </div>
            <p
              id="card-search-help"
              className="text-content-tertiary mt-2 text-sm"
            >
              {searchTooShort
                ? "Enter at least 3 characters to search by name."
                : "Search by at least 3 characters, or leave blank to browse."}
            </p>
          </form>
        </div>

        <div
          className={cn(
            "mx-auto w-full max-w-7xl px-6",
            totalPages <= 1 && "pb-8"
          )}
        >
          {initialCards.length === 0 ? (
            <NoCardsFound
              hasFilters={activeFilterCount > 0 || Boolean(currentFilters.q)}
              onEditFilters={() => setFiltersOpen(true)}
              onClearAll={clearAllFilters}
            />
          ) : (
            <CardGrid cards={initialCards} onCardClick={setModalCardId} />
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mx-auto w-full max-w-7xl px-6 pb-8">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={(newPage) =>
                updateFilters({ page: String(newPage) })
              }
            />
          </div>
        )}
      </div>

      {/* Every filter lives here — nothing filter-related renders inline. */}
      <CardFiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        sets={sets}
        filters={currentFilters}
        onApply={handleApplyFilters}
      />

      {/* Card detail modal */}
      {modalCardId && (
        <BrowserCardDetailModal
          cardId={modalCardId}
          cardIds={cardIds}
          page={page}
          totalPages={totalPages}
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
          renderActions={renderDetailActions}
        />
      )}
    </div>
  );
}

/**
 * Zero-result affordance. With filters behind a dialog the visitor cannot see
 * what excluded everything, so the empty state carries the way back in.
 */
function NoCardsFound({
  hasFilters,
  onEditFilters,
  onClearAll,
}: {
  hasFilters: boolean;
  onEditFilters: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="border-border bg-surface-1 flex flex-col items-center gap-4 rounded-lg border px-6 py-16 text-center">
      <p className="text-content-primary text-base font-semibold">
        No cards match these filters
      </p>
      <p className="text-content-secondary max-w-prose text-sm">
        {hasFilters
          ? "Widen the set selection or drop a color, type, or block to bring cards back."
          : "The database returned nothing for this page."}
      </p>
      {hasFilters && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={onEditFilters}>
            <Filter data-icon="inline-start" />
            Edit filters
          </Button>
          <Button type="button" variant="ghost" onClick={onClearAll}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

function BrowserCardDetailModal({
  cardId,
  cardIds,
  page,
  totalPages,
  onNavigate,
  onPrevPage,
  onNextPage,
  onClose,
  renderActions,
}: {
  cardId: string;
  cardIds: string[];
  page: number;
  totalPages: number;
  onNavigate: (cardId: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onClose: () => void;
  renderActions?: (card: CardDetail | null) => React.ReactNode;
}) {
  const currentIndex = cardIds.indexOf(cardId);
  const isFirstPage = page === 1;
  const isLastPage = page === totalPages;
  const hasPrev = currentIndex > 0 || !isFirstPage;
  const hasNext = currentIndex < cardIds.length - 1 || !isLastPage;

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(cardIds[currentIndex - 1]);
    } else if (!isFirstPage) {
      onPrevPage();
    }
  }, [currentIndex, isFirstPage, cardIds, onNavigate, onPrevPage]);

  const goToNext = useCallback(() => {
    if (currentIndex < cardIds.length - 1) {
      onNavigate(cardIds[currentIndex + 1]);
    } else if (!isLastPage) {
      onNextPage();
    }
  }, [currentIndex, isLastPage, cardIds, onNavigate, onNextPage]);

  // Arrow key navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goToPrev();
      if (e.key === "ArrowRight") goToNext();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [goToPrev, goToNext]);

  return (
    <CardDetailModal
      cardId={cardId}
      onClose={onClose}
      footer={(card) => (
        <>
          <div className="flex gap-2">
            <Button
              size="sm"
              elevation="flat"
              onClick={goToPrev}
              disabled={!hasPrev}
            >
              <ChevronLeft data-icon="inline-start" />
              Previous
            </Button>
            <Button
              size="sm"
              elevation="flat"
              onClick={goToNext}
              disabled={!hasNext}
            >
              Next
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
          {renderActions?.(card)}
        </>
      )}
    />
  );
}
