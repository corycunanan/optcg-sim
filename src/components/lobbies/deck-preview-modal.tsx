"use client";

import { useState, useEffect } from "react";
import { Badge, Dialog, DialogContent, DialogTitle } from "@/components/ui";
import { VisuallyHidden } from "radix-ui";
import { apiGet } from "@/lib/api-client";
import {
  DeckDetailResponseSchema,
  type DeckDetailResponse,
} from "@/lib/validators/cards";
import { DeckCardGrid, deckCardTotal, groupDeckCards } from "./deck-card-grid";

type DeckData = DeckDetailResponse["data"];

interface DeckPreviewModalProps {
  deckId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ── Main modal ──────────────────────────────────────────────────────── */

export function DeckPreviewModal({
  deckId,
  open,
  onOpenChange,
}: DeckPreviewModalProps) {
  const [deck, setDeck] = useState<DeckData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !deckId) {
      queueMicrotask(() => setDeck(null));
      return;
    }

    let cancelled = false;
    queueMicrotask(() => setLoading(true));

    apiGet(`/api/decks/${deckId}`, DeckDetailResponseSchema)
      .then((json) => {
        if (!cancelled) setDeck(json.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, deckId]);

  const groups = deck ? groupDeckCards(deck) : [];
  const totalCards = deckCardTotal(groups);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        size="2xl"
        showCloseButton
        className="flex max-h-[85vh] flex-col overflow-hidden p-0"
      >
        <VisuallyHidden.Root>
          <DialogTitle>
            {deck ? `${deck.name} — Deck Preview` : "Deck Preview"}
          </DialogTitle>
        </VisuallyHidden.Root>

        {loading && (
          <div className="flex items-center justify-center p-12">
            <div className="text-content-secondary flex items-center gap-2 text-sm">
              <div className="bg-content-tertiary h-2 w-2 animate-pulse rounded-full" />
              Loading deck...
            </div>
          </div>
        )}

        {!loading && deck && (
          <div className="flex overflow-hidden">
            {/* Left sidebar — deck info + cost curve */}
            <div className="border-border flex w-48 flex-shrink-0 flex-col gap-6 border-r px-6 py-6">
              <div>
                <h3 className="text-content-primary text-base font-semibold">
                  {deck.name}
                </h3>
                <p className="text-content-tertiary mt-1 text-sm">
                  {totalCards} cards
                </p>
              </div>

              {/* Cost curve */}
              <div>
                <div className="flex flex-col gap-1">
                  {Array.from({ length: 11 }, (_, cost) => {
                    const count = groups.reduce(
                      (sum, g) =>
                        sum +
                        (g.card.type !== "Leader" && g.card.cost === cost
                          ? g.count
                          : 0),
                      0
                    );
                    return (
                      <div key={cost} className="flex items-center text-sm">
                        <Badge
                          variant="secondary"
                          className="w-1/2 justify-center px-0 py-1 text-sm"
                        >
                          {cost}
                        </Badge>
                        <span className="text-content-tertiary w-1/2 text-center">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Card grid area */}
            <div className="overflow-y-auto px-6 py-6">
              <DeckCardGrid groups={groups} />
            </div>
          </div>
        )}

        {!loading && !deck && deckId && (
          <div className="flex items-center justify-center p-12">
            <p className="text-content-secondary text-sm">
              Failed to load deck.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
