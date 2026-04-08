"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { CardGrid } from "./card-grid";
import { Pagination } from "./pagination";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
} from "@/components/ui/page-header";

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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Page header — fixed to top */}
      <PageHeader className="z-20 shrink-0">
        <PageHeaderContent>
          <PageHeaderTitle>Card Database</PageHeaderTitle>
          <PageHeaderDescription>
            Showing {initialCards.length} of {total.toLocaleString()} cards
            {currentFilters.q && (
              <span>
                {" "}matching &ldquo;
                <strong className="text-content-inverse">{currentFilters.q}</strong>
                &rdquo;
              </span>
            )}
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button>
            <Filter data-icon="inline-start" />
            Filter
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {/* Scrollable content area */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Search bar */}
        <div className="px-6 py-6">
          <form onSubmit={handleSearch}>
            <div className="flex gap-2">
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cards by name..."
                className="flex-1"
              />
              <Button type="submit">
                Search
              </Button>
            </div>
          </form>
        </div>

        <div className={cn("px-6", totalPages <= 1 && "pb-6")}>
          <CardGrid cards={initialCards} onCardClick={setModalCardId} />
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 pb-6">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={(newPage) => updateFilters({ page: String(newPage) })}
            />
          </div>
        )}
      </div>

      {/* Card detail modal */}
      {modalCardId && (
        <AdminCardDetailModal
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
        />
      )}
    </div>
  );
}

/* ── Admin wrapper — adds prev/next navigation + edit link ─────────── */

function AdminCardDetailModal({
  cardId,
  cardIds,
  page,
  totalPages,
  onNavigate,
  onPrevPage,
  onNextPage,
  onClose,
}: {
  cardId: string;
  cardIds: string[];
  page: number;
  totalPages: number;
  onNavigate: (cardId: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onClose: () => void;
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
              variant="secondary"
              size="sm"
              onClick={goToPrev}
              disabled={!hasPrev}
            >
              <ChevronLeft data-icon="inline-start" />
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={goToNext}
              disabled={!hasNext}
            >
              Next
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
          {card && (
            <Button asChild>
              <Link href={`/admin/cards/${card.id}/edit`}>
                Edit Card
              </Link>
            </Button>
          )}
        </>
      )}
    />
  );
}
