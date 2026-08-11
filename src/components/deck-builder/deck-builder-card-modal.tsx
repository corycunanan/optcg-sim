"use client";

import {
  CardDetailModal,
  type CardDetail,
} from "@/components/cards/card-detail-modal";
import { Button } from "@/components/ui/button";
import { getDeckCardCopyLimit } from "@/lib/deck-builder/validation";

interface DeckBuilderCardModalProps {
  cardId: string;
  onClose: () => void;
  isLeader: boolean;
  quantityInDeck: number;
  selectedArtUrl: string | null;
  onAdd: (card: CardDetail) => void;
  onRemove: () => void;
  /** When set, the card is the deck's current leader and the footer offers removal instead of "Set as Leader". */
  onRemoveLeader?: () => void;
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
  onRemoveLeader,
  onSetArtVariant,
}: DeckBuilderCardModalProps) {
  return (
    <CardDetailModal
      cardId={cardId}
      onClose={onClose}
      controlledImage={selectedArtUrl ?? undefined}
      onImageSelect={(url, isBase) => onSetArtVariant(isBase ? null : url)}
      footer={(card) => {
        const copyLimit = getDeckCardCopyLimit(card ?? {});
        const copyLabel = isLeader
          ? "Leader"
          : `${quantityInDeck}/${copyLimit} in deck`;
        const handleAdd = () => {
          if (card) onAdd(card);
        };

        return (
          <div className="flex items-center gap-3">
            {isLeader && onRemoveLeader ? (
              <>
                <Button variant="destructive" onClick={onRemoveLeader}>
                  Remove Leader
                </Button>
                <span className="text-content-tertiary text-xs">{copyLabel}</span>
              </>
            ) : quantityInDeck > 0 ? (
              <>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onRemove}
                    aria-label="Remove one"
                  >
                    −
                  </Button>
                  <span className="text-content-primary w-8 text-center text-lg font-semibold tabular-nums">
                    {quantityInDeck}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleAdd}
                    disabled={
                      !card || (!isLeader && quantityInDeck >= copyLimit)
                    }
                    aria-label="Add one"
                  >
                    +
                  </Button>
                </div>
                <span className="text-content-tertiary text-xs">{copyLabel}</span>
              </>
            ) : (
              <Button onClick={handleAdd} disabled={!card}>
                {isLeader || card?.type === "Leader"
                  ? "Set as Leader"
                  : "+ Add to Deck"}
              </Button>
            )}
          </div>
        );
      }}
    />
  );
}
