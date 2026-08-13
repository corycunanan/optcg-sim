"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
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
import { ColorChip } from "./color-chip";
import { EffectText } from "./effect-text";
import { apiGet } from "@/lib/api-client";
import {
  CardDetailResponseSchema,
  type CardArtVariant,
  type CardDetail as CardDetailContract,
  type CardSetMembership,
} from "@/lib/validators/cards";

export type ArtVariant = CardArtVariant;
export type CardSet = CardSetMembership;
export type CardDetail = CardDetailContract;

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

/**
 * Every item in the header badge row normalizes to the canonical ColorChip's
 * box (`px-3 py-1 text-xs` ≈ 26px). Badges default to `py-0.5`, so they are
 * lifted here rather than shrinking the chip and its swatch.
 */
const HEADER_BADGE_CLASS = "py-1";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-content-tertiary">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-content-primary">{value}</span>
    </div>
  );
}

interface CardDetailModalProps {
  cardId: string;
  onClose: () => void;
  footer?: (card: CardDetail | null) => React.ReactNode;
  controlledImage?: string;
  onImageSelect?: (imageUrl: string, isBase: boolean) => void;
}

export function CardDetailModal({ cardId, onClose, footer, controlledImage, onImageSelect }: CardDetailModalProps) {
  const [cardState, setCardState] = useState<{
    cardId: string;
    card: CardDetail | null;
    loading: boolean;
  }>({ cardId, card: null, loading: true });
  const isStale = cardState.cardId !== cardId;
  const card = isStale ? null : cardState.card;
  const loading = isStale || cardState.loading;

  useEffect(() => {
    let cancelled = false;
    apiGet(`/api/cards/${cardId}`, CardDetailResponseSchema)
      .then(({ data }) => {
        if (!cancelled) {
          setCardState({ cardId, card: data, loading: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCardState({ cardId, card: null, loading: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const footerContent = footer?.(card);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        size="xl"
        showCloseButton={false}
        className="flex h-[90vh] flex-col overflow-hidden p-0"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
          {loading || !card ? (
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-6 w-64" />
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <DialogTitle>{card.name}</DialogTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn(HEADER_BADGE_CLASS, "font-mono")}>
                  {card.id}
                </Badge>
                <Badge variant="outline" className={HEADER_BADGE_CLASS}>
                  {card.type}
                </Badge>
                {card.color.map((c) => (
                  <ColorChip key={c} color={c} accessibleLabel={`${c} card color`} />
                ))}
                <Badge variant="outline" className={HEADER_BADGE_CLASS}>
                  {card.rarity}
                </Badge>
                {card.banStatus !== "LEGAL" && (
                  <Badge variant="error" className={cn(HEADER_BADGE_CLASS, "font-semibold")}>
                    {card.banStatus}
                  </Badge>
                )}
              </div>
            </div>
          )}
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </DialogClose>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left: image gallery */}
          <div className="w-2/5 shrink-0 overflow-y-auto p-6 scrollbar-hide [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {loading || !card ? (
              <Skeleton className="aspect-card w-full rounded-lg" />
            ) : (
              <CardImageGallery
                cardName={card.name}
                baseImageUrl={card.imageUrl}
                baseRarity={card.rarity}
                artVariants={card.artVariants}
                controlledImage={controlledImage}
                onImageSelect={onImageSelect}
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
                {/* Cost, Power, Counter */}
                <Row className="pt-0">
                  <div className={cn("grid gap-4", card.life !== null ? "grid-cols-4" : "grid-cols-3")}>
                    <Stat label="Cost" value={card.cost !== null ? String(card.cost) : "0"} />
                    <Stat label="Power" value={card.power !== null ? card.power.toLocaleString() : "0"} />
                    <Stat label="Counter" value={card.counter !== null ? card.counter.toLocaleString() : "N/A"} />
                    {card.life !== null && <Stat label="Life" value={String(card.life)} />}
                  </div>
                </Row>

                {/* Traits + Attributes */}
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

                {/* Effect */}
                <Row label="Effect">
                  {card.effectText ? (
                    <EffectText text={card.effectText} />
                  ) : (
                    <span className="text-sm text-content-tertiary">—</span>
                  )}
                </Row>

                {/* Trigger Effect */}
                <Row label="Trigger Effect">
                  {card.triggerText ? (
                    <EffectText text={card.triggerText} />
                  ) : (
                    <span className="text-sm text-content-tertiary">—</span>
                  )}
                </Row>

                {/* Set, Block */}
                <Row>
                  <div className="grid grid-cols-2 gap-4">
                    <Stat label="Set" value={card.originSet} />
                    <Stat label="Block" value={String(card.blockNumber)} />
                  </div>
                </Row>

                {/* Appears In */}
                <Row label="Appears In">
                  {card.cardSets.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {card.cardSets.map((cs) => (
                        <div key={cs.id} className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-xs font-semibold text-content-primary">{cs.setLabel}</span>
                          <span className="text-content-tertiary">—</span>
                          <span className="text-content-secondary">{cs.setName}</span>
                          {cs.isOrigin && (
                            <Badge variant="warning" className="rounded">
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

        {/* Footer — provided by consumer */}
        {footerContent && (
          <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-6 py-3">
            {footerContent}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
