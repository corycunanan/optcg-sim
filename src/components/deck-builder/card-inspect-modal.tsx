"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api-client";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DEFAULT_COPY_LIMIT,
  getDeckCardCopyLimit,
} from "@/lib/deck-builder/validation";

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

interface CardInspectData {
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
  artVariants?: ArtVariant[];
  cardSets?: CardSet[];
}

interface CardInspectModalProps {
  cardId: string;
  preloadedCard?: CardInspectData;
  quantityInDeck: number;
  selectedArtUrl: string | null;
  isLeader?: boolean;
  onAddCard: () => void;
  onRemoveCard: () => void;
  onSetArtVariant: (artUrl: string | null) => void;
  onClose: () => void;
}

const COLOR_TO_VARIANT: Record<
  string,
  | "card-red"
  | "card-blue"
  | "card-green"
  | "card-purple"
  | "card-black"
  | "card-yellow"
> = {
  Red: "card-red",
  Blue: "card-blue",
  Green: "card-green",
  Purple: "card-purple",
  Black: "card-black",
  Yellow: "card-yellow",
};

export function CardInspectModal({
  cardId,
  preloadedCard,
  quantityInDeck,
  selectedArtUrl,
  isLeader,
  onAddCard,
  onRemoveCard,
  onSetArtVariant,
  onClose,
}: CardInspectModalProps) {
  const [card, setCard] = useState<CardInspectData | null>(
    preloadedCard ?? null
  );
  const [displayImage, setDisplayImage] = useState(
    selectedArtUrl || preloadedCard?.imageUrl || ""
  );
  const [isLoading, setIsLoading] = useState(!preloadedCard?.artVariants);
  const copyLimit = card ? getDeckCardCopyLimit(card) : DEFAULT_COPY_LIMIT;

  useEffect(() => {
    if (preloadedCard?.artVariants) {
      setCard(preloadedCard);
      setIsLoading(false);
      return;
    }

    async function fetchCard() {
      try {
        const { data } = await apiGet<{ data: CardInspectData }>(
          `/api/cards/${cardId}`
        );
        setCard(data);
        if (!displayImage) setDisplayImage(selectedArtUrl || data.imageUrl);
      } catch {
        // noop
      } finally {
        setIsLoading(false);
      }
    }

    fetchCard();
  }, [cardId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (card && !displayImage) setDisplayImage(selectedArtUrl || card.imageUrl);
  }, [card, selectedArtUrl, displayImage]);

  const allArtworks = card
    ? [
        { id: "__origin", label: "Original", imageUrl: card.imageUrl },
        ...(card.artVariants || []).map((v) => ({
          id: v.id,
          label: v.label,
          imageUrl: v.imageUrl,
        })),
      ]
    : [];

  const handleArtSelect = (artUrl: string) => {
    setDisplayImage(artUrl);
    onSetArtVariant(artUrl === card?.imageUrl ? null : artUrl);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-hidden p-0">
        {/* Close button */}
        <DialogClose
          aria-label="Close"
          className="text-content-tertiary hover:bg-surface-2 hover:text-content-primary absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded transition-colors active:scale-95"
        >
          ✕
        </DialogClose>

        {isLoading || !card ? (
          <div className="text-content-tertiary flex w-full items-center justify-center py-20">
            Loading…
          </div>
        ) : (
          <div className="flex max-h-[90vh]">
            {/* Left: Card image + art variants */}
            <div className="border-border flex w-[280px] shrink-0 flex-col overflow-y-auto border-r p-4">
              {/* Main image */}
              <div className="overflow-hidden rounded">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayImage}
                  alt={card.name}
                  className="w-full"
                  key={displayImage}
                />
              </div>

              {/* Art variant selector */}
              {allArtworks.length > 1 && (
                <div className="mt-4">
                  <h4 className="text-content-tertiary mb-2 text-xs font-semibold tracking-widest uppercase">
                    Artworks ({allArtworks.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {allArtworks.map((art) => {
                      const isSelected = displayImage === art.imageUrl;
                      return (
                        <button
                          key={art.id}
                          aria-label={`Select ${art.label} artwork`}
                          aria-pressed={isSelected}
                          onClick={() => handleArtSelect(art.imageUrl)}
                          className={cn(
                            "group overflow-hidden rounded border transition-all",
                            isSelected
                              ? "border-navy-900"
                              : "border-border hover:border-border-strong"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={art.imageUrl}
                            alt={art.label}
                            className={cn(
                              "w-full transition-opacity",
                              isSelected
                                ? "opacity-100"
                                : "opacity-60 group-hover:opacity-100"
                            )}
                            loading="lazy"
                          />
                          <div
                            className={cn(
                              "p-1 text-center text-xs font-medium",
                              isSelected
                                ? "bg-navy-100 text-navy-900"
                                : "bg-surface-2 text-content-tertiary"
                            )}
                          >
                            {art.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Card details */}
            <div className="flex flex-1 flex-col overflow-y-auto p-5">
              {/* Header */}
              <div className="mb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-content-primary text-2xl leading-tight font-bold tracking-tight">
                      {card.name}
                    </h2>
                    <p className="text-content-tertiary mt-1 text-sm">
                      {card.id} · {card.type} · {card.rarity}
                    </p>
                  </div>
                  {card.banStatus !== "LEGAL" && (
                    <Badge variant="error" className="shrink-0 font-bold">
                      {card.banStatus}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Color / Attributes / Traits — three columns */}
              <div className="mb-4 grid grid-cols-3 gap-4">
                <div>
                  <SectionLabel text="Color" />
                  <div className="flex flex-wrap gap-1">
                    {card.color.map((c) => (
                      <Badge
                        key={c}
                        variant={COLOR_TO_VARIANT[c] || "secondary"}
                        className="rounded-full px-3 py-1"
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionLabel text="Attributes" />
                  {card.attribute.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {card.attribute.map((a) => (
                        <Tag key={a} text={a} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-content-tertiary text-xs">—</span>
                  )}
                </div>
                <div>
                  <SectionLabel text="Traits" />
                  {card.traits.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {card.traits.map((t) => (
                        <Tag key={t} text={t} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-content-tertiary text-xs">—</span>
                  )}
                </div>
              </div>

              {/* Stats — six columns */}
              <div className="mb-4 grid grid-cols-6 gap-2">
                {card.cost !== null && (
                  <StatPill label="Cost" value={String(card.cost)} />
                )}
                {card.power !== null && (
                  <StatPill label="Power" value={card.power.toLocaleString()} />
                )}
                {card.counter !== null && (
                  <StatPill
                    label="Counter"
                    value={card.counter.toLocaleString()}
                  />
                )}
                {card.life !== null && (
                  <StatPill label="Life" value={String(card.life)} />
                )}
                <StatPill label="Block" value={String(card.blockNumber)} />
                <StatPill label="Set" value={card.originSet} />
              </div>

              {/* Effect text */}
              {card.effectText && (
                <div className="mb-3">
                  <SectionLabel text="Effect" />
                  <p className="text-content-secondary text-sm leading-relaxed whitespace-pre-wrap">
                    {card.effectText}
                  </p>
                </div>
              )}

              {/* Trigger text */}
              {card.triggerText && (
                <div className="mb-3">
                  <SectionLabel text="Trigger" />
                  <p className="text-content-secondary text-sm">
                    {card.triggerText}
                  </p>
                </div>
              )}

              {/* Set membership */}
              {card.cardSets && card.cardSets.length > 0 && (
                <div className="mb-4">
                  <SectionLabel text="Appears In" />
                  <div className="space-y-1">
                    {card.cardSets.map((cs) => (
                      <div
                        key={cs.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="text-navy-900 font-mono font-medium">
                          {cs.setLabel}
                        </span>
                        <span className="text-content-tertiary">—</span>
                        <span className="text-content-secondary">
                          {cs.setName}
                        </span>
                        {cs.isOrigin && (
                          <Badge variant="warning" className="rounded-full">
                            Origin
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1" />

              {/* Add/remove actions — pinned to bottom */}
              <div className="border-border flex items-center gap-3 border-t pt-4">
                {quantityInDeck > 0 ? (
                  <>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label="Remove one"
                        onClick={onRemoveCard}
                        className="h-9 w-9 p-0 active:scale-95"
                      >
                        −
                      </Button>
                      <span className="text-content-primary w-8 text-center text-lg font-bold tabular-nums">
                        {quantityInDeck}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label="Add one"
                        onClick={onAddCard}
                        disabled={!isLeader && quantityInDeck >= copyLimit}
                        className="h-9 w-9 p-0 active:scale-95"
                      >
                        +
                      </Button>
                    </div>
                    <span className="text-content-tertiary text-xs">
                      {isLeader
                        ? "Set as leader"
                        : `${quantityInDeck}/${copyLimit} in deck`}
                    </span>
                  </>
                ) : (
                  <Button onClick={onAddCard}>
                    {isLeader || card.type === "Leader"
                      ? "Set as Leader"
                      : "+ Add to Deck"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-surface-2 rounded border px-3 py-2 text-center">
      <div className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
        {label}
      </div>
      <div className="text-content-primary text-sm font-bold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <h4 className="text-content-tertiary mb-1.5 text-xs font-semibold tracking-widest uppercase">
      {text}
    </h4>
  );
}

function Tag({ text }: { text: string }) {
  return <Badge variant="secondary">{text}</Badge>;
}
