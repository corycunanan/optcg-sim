"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CardImageGallery } from "./card-image-gallery";

const COLOR_ACCENT: Record<string, string> = {
  Red: "var(--card-red)",
  Blue: "var(--card-blue)",
  Green: "var(--card-green)",
  Purple: "var(--card-purple)",
  Black: "var(--card-black)",
  Yellow: "var(--card-yellow)",
};

interface ArtVariant {
  id: string;
  variantId: string;
  label: string;
  rarity: string;
  imageUrl: string;
  set: string;
}

interface CardSet {
  id: string;
  setLabel: string;
  setName: string;
  isOrigin: boolean;
}

interface CardDetail {
  id: string;
  name: string;
  color: string[];
  type: string;
  rarity: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  blockNumber: number;
  originSet: string;
  attribute: string[];
  traits: string[];
  effectText: string;
  triggerText: string | null;
  banStatus: string;
  imageUrl: string;
  artVariants: ArtVariant[];
  cardSets: CardSet[];
}

interface DeckActions {
  quantityInDeck: number;
  selectedArtUrl: string | null;
  isLeader?: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onSetArtVariant: (url: string | null) => void;
}

interface CardDetailModalProps {
  cardId: string;
  onClose: () => void;
  // Admin navigation — omit for deck-builder mode
  cardIds?: string[];
  isFirstPage?: boolean;
  isLastPage?: boolean;
  onNavigate?: (cardId: string) => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  // Deck-builder mode
  deckActions?: DeckActions;
}

function Row({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("py-4", className)}>
      {label && (
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-content-tertiary">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-content-tertiary">{label}</span>
      <span className="text-lg font-bold tabular-nums text-content-primary">{value}</span>
    </div>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span className="rounded bg-surface-2 px-3 py-1 text-xs font-medium text-content-secondary">
      {text}
    </span>
  );
}

export function CardDetailModal({ cardId, onClose, cardIds, isFirstPage, isLastPage, onNavigate, onPrevPage, onNextPage, deckActions }: CardDetailModalProps) {
  const [card, setCard] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Lock body scroll
  useEffect(() => {
    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, []);

  // ESC to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Fetch card data
  useEffect(() => {
    setLoading(true);
    setCard(null);
    fetch(`/api/cards/${cardId}`)
      .then((r) => r.json())
      .then((data) => {
        setCard(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [cardId]);

  const currentIndex = cardIds ? cardIds.indexOf(cardId) : -1;
  const hasPrev = cardIds ? (currentIndex > 0 || !isFirstPage) : false;
  const hasNext = cardIds ? (currentIndex < cardIds.length - 1 || !isLastPage) : false;

  const goToPrev = useCallback(() => {
    if (!cardIds) return;
    if (currentIndex > 0) {
      onNavigate?.(cardIds[currentIndex - 1]);
    } else if (!isFirstPage) {
      onPrevPage?.();
    }
  }, [currentIndex, isFirstPage, cardIds, onNavigate, onPrevPage]);

  const goToNext = useCallback(() => {
    if (!cardIds) return;
    if (currentIndex < cardIds.length - 1) {
      onNavigate?.(cardIds[currentIndex + 1]);
    } else if (!isLastPage) {
      onNextPage?.();
    }
  }, [currentIndex, isLastPage, cardIds, onNavigate, onNextPage]);

  // Arrow key navigation (admin mode only)
  useEffect(() => {
    if (!cardIds) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goToPrev();
      if (e.key === "ArrowRight") goToNext();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [cardIds, goToPrev, goToNext]);


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-overlay"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          {loading || !card ? (
            <div className="h-6 w-48 animate-pulse rounded bg-surface-3" />
          ) : (
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight text-content-primary">
                {card.name}
              </h2>
              <p className="mt-0.5 text-xs text-content-tertiary">
                {card.id} · {card.type} · {card.rarity}
              </p>
            </div>
          )}
          <button
            onClick={onClose}
            className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-content-tertiary transition-colors hover:bg-surface-2 hover:text-content-primary"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body — two independently scrollable columns */}
        <div className="flex flex-1 min-h-0">
          {/* Left: image gallery */}
          <div className="w-2/5 shrink-0 overflow-y-auto border-r border-border p-6 scrollbar-hide [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {loading || !card ? (
              <div className="aspect-[600/838] w-full animate-pulse rounded-lg bg-surface-3" />
            ) : (
              <CardImageGallery
                cardName={card.name}
                baseImageUrl={card.imageUrl}
                artVariants={card.artVariants}
                controlledImage={deckActions ? (deckActions.selectedArtUrl ?? card.imageUrl) : undefined}
                onImageSelect={deckActions ? (url, isBase) => deckActions.onSetArtVariant(isBase ? null : url) : undefined}
              />
            )}
          </div>

          {/* Right: card details */}
          <div className="w-3/5 overflow-y-auto p-6">
            {loading || !card ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-3" />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* 1. Colors */}
                <Row className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    {card.color.map((c) => (
                      <span
                        key={c}
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                        style={{
                          background: COLOR_ACCENT[c] || "var(--surface-3)",
                          color: c === "Yellow" ? "var(--text-primary)" : "var(--text-inverse)",
                        }}
                      >
                        {c}
                      </span>
                    ))}
                    {card.banStatus !== "LEGAL" && (
                      <span className="rounded bg-error px-3 py-1 text-xs font-bold text-content-inverse">
                        {card.banStatus}
                      </span>
                    )}
                  </div>
                </Row>

                {/* 2. Cost, Power, Counter */}
                <Row>
                  <div className={cn("grid gap-4", card.life !== null ? "grid-cols-4" : "grid-cols-3")}>
                    <Stat label="Cost" value={card.cost !== null ? String(card.cost) : "0"} />
                    <Stat label="Power" value={card.power !== null ? card.power.toLocaleString() : "0"} />
                    <Stat label="Counter" value={card.counter !== null ? card.counter.toLocaleString() : "N/A"} />
                    {card.life !== null && <Stat label="Life" value={String(card.life)} />}
                  </div>
                </Row>

                {/* 3. Traits + Attributes */}
                <Row>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-content-tertiary">Traits</div>
                      {card.traits.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {card.traits.map((t) => <Tag key={t} text={t} />)}
                        </div>
                      ) : (
                        <span className="text-sm text-content-tertiary">—</span>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-content-tertiary">Attributes</div>
                      {card.attribute.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {card.attribute.map((a) => <Tag key={a} text={a} />)}
                        </div>
                      ) : (
                        <span className="text-sm text-content-tertiary">—</span>
                      )}
                    </div>
                  </div>
                </Row>

                {/* 5. Effect */}
                <Row label="Effect">
                  {card.effectText ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-content-secondary">
                      {card.effectText}
                    </p>
                  ) : (
                    <span className="text-sm text-content-tertiary">—</span>
                  )}
                </Row>

                {/* 6. Trigger Effect */}
                <Row label="Trigger Effect">
                  {card.triggerText ? (
                    <p className="text-sm leading-relaxed text-content-secondary">{card.triggerText}</p>
                  ) : (
                    <span className="text-sm text-content-tertiary">—</span>
                  )}
                </Row>

                {/* 7. Set, Block */}
                <Row>
                  <div className="grid grid-cols-2 gap-4">
                    <Stat label="Set" value={card.originSet} />
                    <Stat label="Block" value={String(card.blockNumber)} />
                  </div>
                </Row>

                {/* 8. Appears In */}
                <Row label="Appears In">
                  {card.cardSets.length > 0 ? (
                    <div className="space-y-2">
                      {card.cardSets.map((cs) => (
                        <div key={cs.id} className="flex items-center gap-2 text-sm">
                          <span className="font-mono font-medium text-content-primary">{cs.setLabel}</span>
                          <span className="text-content-tertiary">—</span>
                          <span className="text-content-secondary">{cs.setName}</span>
                          {cs.isOrigin && (
                            <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-500">
                              Origin
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-content-tertiary">—</span>
                  )}
                </Row>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border bg-surface-1 px-6 py-3">
          {deckActions ? (
            /* Deck builder footer — quantity controls */
            <div className="flex items-center gap-3">
              {deckActions.quantityInDeck > 0 ? (
                <>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={deckActions.onRemove}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-lg font-bold text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
                      aria-label="Remove one"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-lg font-bold tabular-nums text-content-primary">
                      {deckActions.quantityInDeck}
                    </span>
                    <button
                      onClick={deckActions.onAdd}
                      disabled={deckActions.quantityInDeck >= 4}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-md border text-lg font-bold transition-colors",
                        deckActions.quantityInDeck >= 4
                          ? "cursor-not-allowed border-border/50 text-content-disabled"
                          : "border-border text-content-secondary hover:bg-surface-2 hover:text-content-primary",
                      )}
                      aria-label="Add one"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-xs text-content-tertiary">
                    {deckActions.isLeader ? "Leader" : `${deckActions.quantityInDeck}/4 in deck`}
                  </span>
                </>
              ) : (
                <button
                  onClick={deckActions.onAdd}
                  className="rounded-md bg-navy-900 px-4 py-1.5 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800"
                >
                  {deckActions.isLeader || card?.type === "Leader" ? "Set as Leader" : "+ Add to Deck"}
                </button>
              )}
            </div>
          ) : (
            /* Admin footer — prev/next + edit */
            <>
              <div className="flex gap-2">
                <button
                  onClick={goToPrev}
                  disabled={!hasPrev}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    hasPrev
                      ? "border-border text-content-secondary hover:bg-surface-2 hover:text-content-primary"
                      : "border-border/50 text-content-disabled cursor-not-allowed",
                  )}
                >
                  <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                    <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Previous
                </button>
                <button
                  onClick={goToNext}
                  disabled={!hasNext}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    hasNext
                      ? "border-border text-content-secondary hover:bg-surface-2 hover:text-content-primary"
                      : "border-border/50 text-content-disabled cursor-not-allowed",
                  )}
                >
                  Next
                  <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              {card && (
                <Link
                  href={`/admin/cards/${card.id}/edit`}
                  className="rounded-md bg-navy-900 px-4 py-1.5 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800"
                >
                  Edit Card
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
