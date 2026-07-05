"use client";

import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { Button } from "@/components/ui/button";

interface DeckBuilderCardModalProps {
  cardId: string;
  onClose: () => void;
  isLeader: boolean;
  quantityInDeck: number;
  copyLimit: number;
  selectedArtUrl: string | null;
  onAdd: () => void;
  onRemove: () => void;
  onSetArtVariant: (artUrl: string | null) => void;
}

export function DeckBuilderCardModal({
  cardId,
  onClose,
  isLeader,
  quantityInDeck,
  copyLimit,
  selectedArtUrl,
  onAdd,
  onRemove,
  onSetArtVariant,
}: DeckBuilderCardModalProps) {
  const copyLabel = isLeader
    ? "Leader"
    : `${quantityInDeck}/${copyLimit} in deck`;

  return (
    <CardDetailModal
      cardId={cardId}
      onClose={onClose}
      controlledImage={selectedArtUrl ?? undefined}
      onImageSelect={(url, isBase) => onSetArtVariant(isBase ? null : url)}
      footer={(card) => (
        <div className="flex items-center gap-3">
          {quantityInDeck > 0 ? (
            <>
              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="icon-sm"
                  onClick={onRemove}
                  aria-label="Remove one"
                >
                  −
                </Button>
                <span className="text-content-primary w-8 text-center text-lg font-bold tabular-nums">
                  {quantityInDeck}
                </span>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  onClick={onAdd}
                  disabled={!isLeader && quantityInDeck >= copyLimit}
                  aria-label="Add one"
                >
                  +
                </Button>
              </div>
              <span className="text-content-tertiary text-xs">{copyLabel}</span>
            </>
          ) : (
            <Button onClick={onAdd}>
              {isLeader || card?.type === "Leader"
                ? "Set as Leader"
                : "+ Add to Deck"}
            </Button>
          )}
        </div>
      )}
    />
  );
}
