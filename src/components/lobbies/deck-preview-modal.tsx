"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Badge,
  CardFanStack,
  Dialog,
  DialogContent,
  DialogTitle,
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui";
import { VisuallyHidden } from "radix-ui";

interface CardInfo {
  id: string;
  name: string;
  imageUrl: string;
  type: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  effectText: string;
  triggerText: string | null;
  traits: string[];
  rarity: string;
}

interface DeckCard {
  id: string;
  quantity: number;
  selectedArtUrl: string | null;
  card: CardInfo;
}

interface DeckData {
  id: string;
  name: string;
  leaderId: string;
  leaderArtUrl: string | null;
  leader: CardInfo | null;
  cards: DeckCard[];
}

interface DeckPreviewModalProps {
  deckId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CardGroup {
  card: CardInfo;
  imageUrl: string;
  count: number;
}

/** Group cards by cardId, preserving order. Leader is its own group. */
function groupCards(deck: DeckData): CardGroup[] {
  const groups: CardGroup[] = [];

  if (deck.leader) {
    groups.push({
      card: deck.leader,
      imageUrl: deck.leaderArtUrl ?? deck.leader.imageUrl,
      count: 1,
    });
  }

  for (const dc of deck.cards) {
    groups.push({
      card: dc.card,
      imageUrl: dc.selectedArtUrl ?? dc.card.imageUrl,
      count: dc.quantity,
    });
  }

  return groups;
}

/* ── Stat pill for the hover tooltip ─────────────────────────────────── */

function StatPill({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className="text-center px-2">
      <div className={cn("font-bold text-sm", className)}>{String(value)}</div>
      <div className="text-xs text-content-tertiary uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

/* ── Card tooltip content (mirrors game board tooltip) ───────────────── */

function CardTooltip({ card }: { card: CardInfo }) {
  const isFieldCard = card.type === "Leader" || card.type === "Character";

  return (
    <>
      <div className="font-bold text-sm text-content-primary">{card.name}</div>
      <div className="text-xs text-content-tertiary mb-3">
        {card.type} &middot; {card.id}
      </div>

      {isFieldCard ? (
        <div className="flex gap-5 flex-wrap mb-3 text-xs">
          {card.type === "Leader" ? (
            <StatPill
              label="Life"
              value={card.life ?? card.cost ?? 0}
              className="text-error"
            />
          ) : (
            <StatPill
              label="Cost"
              value={card.cost ?? 0}
              className="text-gold-600"
            />
          )}
          <StatPill
            label="Power"
            value={(card.power ?? 0).toLocaleString()}
            className="text-green-600"
          />
          {card.type !== "Leader" && (
            <StatPill
              label="Counter"
              value={card.counter != null ? `+${card.counter}` : "—"}
              className="text-purple-600"
            />
          )}
        </div>
      ) : (
        <div className="flex gap-3 flex-wrap mb-3 text-xs">
          {card.cost != null && (
            <StatPill
              label="Cost"
              value={card.cost}
              className="text-gold-600"
            />
          )}
          {card.life != null && (
            <StatPill
              label="Life"
              value={card.life}
              className="text-error"
            />
          )}
        </div>
      )}

      {card.effectText && (
        <div className="text-xs text-content-secondary leading-relaxed border-t border-border pt-3 flex flex-col gap-2">
          {card.effectText.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {paragraph}
            </p>
          ))}
        </div>
      )}
    </>
  );
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
      setDeck(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/decks/${deckId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json) setDeck(json.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, deckId]);

  const groups = deck ? groupCards(deck) : [];
  const totalCards = groups.reduce((sum, g) => sum + g.count, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        showCloseButton
        className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-6xl"
      >
        <VisuallyHidden.Root>
          <DialogTitle>
            {deck ? `${deck.name} — Deck Preview` : "Deck Preview"}
          </DialogTitle>
        </VisuallyHidden.Root>

        {loading && (
          <div className="flex items-center justify-center p-12">
            <div className="flex items-center gap-2 text-sm text-content-secondary">
              <div className="h-2 w-2 animate-pulse rounded-full bg-content-tertiary" />
              Loading deck...
            </div>
          </div>
        )}

        {!loading && deck && (
          <div className="flex overflow-hidden">
            {/* Left sidebar — deck info + cost curve */}
            <div className="flex w-48 flex-shrink-0 flex-col gap-6 border-r border-border px-6 py-6">
              <div>
                <h3 className="text-base font-semibold text-content-primary">
                  {deck.name}
                </h3>
                <p className="mt-1 text-sm text-content-tertiary">
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
                      0,
                    );
                    return (
                      <div
                        key={cost}
                        className="flex items-center text-sm"
                      >
                        <Badge variant="secondary" className="w-1/2 justify-center px-0 py-1 text-sm">
                          {cost}
                        </Badge>
                        <span className="w-1/2 text-center text-content-tertiary">
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
              <div className="flex flex-wrap justify-start gap-4">
                {groups.map((group) => (
                  <HoverCard key={group.card.id} openDelay={200} closeDelay={0}>
                    <HoverCardTrigger asChild>
                      <CardFanStack
                        cardId={group.card.id}
                        count={group.count}
                        className="cursor-pointer"
                        renderCard={(i) => (
                          <div className="w-card-thumb overflow-hidden rounded border border-border shadow-sm aspect-card hover:-translate-y-2 hover:z-10 transition-transform duration-150">
                            <img
                              src={group.imageUrl}
                              alt={group.card.name}
                              className={cn(
                                "h-full w-full object-cover",
                                group.count > 1 && i > 0 && "brightness-90",
                              )}
                              loading="lazy"
                            />
                          </div>
                        )}
                      />
                    </HoverCardTrigger>
                    <HoverCardContent side="top" className="w-72">
                      <CardTooltip card={group.card} />
                    </HoverCardContent>
                  </HoverCard>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && !deck && deckId && (
          <div className="flex items-center justify-center p-12">
            <p className="text-sm text-content-secondary">
              Failed to load deck.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
