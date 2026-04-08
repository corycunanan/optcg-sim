"use client";

import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { Button } from "@/components/ui/button";

interface DeckBuilderCardModalProps {
  cardId: string;
  onClose: () => void;
  isLeader: boolean;
  quantityInDeck: number;
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
  selectedArtUrl,
  onAdd,
  onRemove,
  onSetArtVariant,
}: DeckBuilderCardModalProps) {
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
                <span className="w-8 text-center text-lg font-bold tabular-nums text-content-primary">
                  {quantityInDeck}
                </span>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  onClick={onAdd}
                  disabled={quantityInDeck >= 4}
                  aria-label="Add one"
                >
                  +
                </Button>
              </div>
              <span className="text-xs text-content-tertiary">
                {isLeader ? "Leader" : `${quantityInDeck}/4 in deck`}
              </span>
            </>
          ) : (
            <Button onClick={onAdd}>
              {isLeader || card?.type === "Leader" ? "Set as Leader" : "+ Add to Deck"}
            </Button>
          )}
        </div>
      )}
    />
  );
}
