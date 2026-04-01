"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CardImageGallery } from "./card-image-gallery";

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

const COLOR_TO_VARIANT: Record<string, "card-red" | "card-blue" | "card-green" | "card-purple" | "card-black" | "card-yellow"> = {
  Red: "card-red",
  Blue: "card-blue",
  Green: "card-green",
  Purple: "card-purple",
  Black: "card-black",
  Yellow: "card-yellow",
};

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

export function CardDetailModal({ cardId, onClose, cardIds, isFirstPage, isLastPage, onNavigate, onPrevPage, onNextPage, deckActions }: CardDetailModalProps) {
  const [card, setCard] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(true);

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        size="xl"
        showCloseButton={false}
        className="flex h-[90vh] flex-col overflow-hidden p-0"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          {loading || !card ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                {card.name}
              </DialogTitle>
              <p className="mt-0.5 text-xs text-content-tertiary">
                {card.id} · {card.type} · {card.rarity}
              </p>
            </div>
          )}
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </DialogClose>
        </div>

        {/* Body — two independently scrollable columns */}
        <div className="flex flex-1 min-h-0">
          {/* Left: image gallery */}
          <div className="w-2/5 shrink-0 overflow-y-auto p-6 scrollbar-hide [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {loading || !card ? (
              <Skeleton className="aspect-[600/838] w-full rounded-lg" />
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
              <div className="flex flex-col gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* 1. Colors */}
                <Row className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    {card.color.map((c) => (
                      <Badge
                        key={c}
                        variant={COLOR_TO_VARIANT[c] || "secondary"}
                        className="rounded-full px-3 py-1"
                      >
                        {c}
                      </Badge>
                    ))}
                    {card.banStatus !== "LEGAL" && (
                      <Badge variant="error" className="px-3 py-1 font-bold">
                        {card.banStatus}
                      </Badge>
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
                          {card.traits.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                        </div>
                      ) : (
                        <span className="text-sm text-content-tertiary">—</span>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-content-tertiary">Attributes</div>
                      {card.attribute.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {card.attribute.map((a) => <Badge key={a} variant="secondary">{a}</Badge>)}
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
                    <div className="flex flex-col gap-2">
                      {card.cardSets.map((cs) => (
                        <div key={cs.id} className="flex items-center gap-2 text-sm">
                          <span className="font-mono font-medium text-content-primary">{cs.setLabel}</span>
                          <span className="text-content-tertiary">—</span>
                          <span className="text-content-secondary">{cs.setName}</span>
                          {cs.isOrigin && (
                            <Badge variant="warning" className="rounded-full">
                              Origin
                            </Badge>
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
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      onClick={deckActions.onRemove}
                      aria-label="Remove one"
                    >
                      −
                    </Button>
                    <span className="w-8 text-center text-lg font-bold tabular-nums text-content-primary">
                      {deckActions.quantityInDeck}
                    </span>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      onClick={deckActions.onAdd}
                      disabled={deckActions.quantityInDeck >= 4}
                      aria-label="Add one"
                    >
                      +
                    </Button>
                  </div>
                  <span className="text-xs text-content-tertiary">
                    {deckActions.isLeader ? "Leader" : `${deckActions.quantityInDeck}/4 in deck`}
                  </span>
                </>
              ) : (
                <Button onClick={deckActions.onAdd}>
                  {deckActions.isLeader || card?.type === "Leader" ? "Set as Leader" : "+ Add to Deck"}
                </Button>
              )}
            </div>
          ) : (
            /* Admin footer — prev/next + edit */
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
