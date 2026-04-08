"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DeckCardEntry } from "@/lib/deck-builder/state";
import type { DeckLeaderEntry } from "@/lib/deck-builder/state";
import { CardDetailModal } from "@/components/admin/card-detail-modal";
import {
  CardFanStack,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";

interface DeckBuilderListProps {
  cards: DeckCardEntry[];
  leader: DeckLeaderEntry | null;
  leaderArtUrl: string | null;
  onIncrement: (cardId: string) => void;
  onDecrement: (cardId: string) => void;
  onSetArtVariant: (cardId: string, artUrl: string | null) => void;
  onAddCard: (card: DeckCardEntry["card"]) => void;
  onRemoveLeader: () => void;
  onSetLeaderArt: (artUrl: string | null) => void;
  totalCards: number;
}

interface CardGroup {
  cardId: string;
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
  count: number;
  isLeader: boolean;
}

function buildGroups(
  leader: DeckLeaderEntry | null,
  leaderArtUrl: string | null,
  cards: DeckCardEntry[],
): CardGroup[] {
  const groups: CardGroup[] = [];

  if (leader) {
    groups.push({
      cardId: leader.id,
      name: leader.name,
      imageUrl: leaderArtUrl || leader.imageUrl,
      type: "Leader",
      cost: null,
      power: leader.power,
      counter: null,
      life: leader.life,
      effectText: leader.effectText || "",
      triggerText: null,
      traits: leader.traits,
      count: 1,
      isLeader: true,
    });
  }

  const sorted = [...cards].sort((a, b) => {
    const costA = a.card.cost ?? -1;
    const costB = b.card.cost ?? -1;
    if (costA !== costB) return costA - costB;
    return a.card.name.localeCompare(b.card.name);
  });

  for (const entry of sorted) {
    groups.push({
      cardId: entry.cardId,
      name: entry.card.name,
      imageUrl: entry.selectedArtUrl || entry.card.imageUrl,
      type: entry.card.type,
      cost: entry.card.cost,
      power: entry.card.power,
      counter: entry.card.counter ?? null,
      life: entry.card.life ?? null,
      effectText: entry.card.effectText || "",
      triggerText: entry.card.triggerText ?? null,
      traits: entry.card.traits,
      count: entry.quantity,
      isLeader: false,
    });
  }

  return groups;
}

/* ── Stat pill ──────────────────────────────────────────────────────── */

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

/* ── Card tooltip ───────────────────────────────────────────────────── */

function CardTooltipBody({ group }: { group: CardGroup }) {
  const isFieldCard = group.type === "Leader" || group.type === "Character";

  return (
    <>
      <div className="font-bold text-sm text-content-primary">{group.name}</div>
      <div className="text-xs text-content-tertiary mb-3">
        {group.type} &middot; {group.cardId}
      </div>

      {isFieldCard ? (
        <div className="flex gap-5 flex-wrap mb-3 text-xs">
          {group.type === "Leader" ? (
            <StatPill
              label="Life"
              value={group.life ?? group.cost ?? 0}
              className="text-error"
            />
          ) : (
            <StatPill
              label="Cost"
              value={group.cost ?? 0}
              className="text-gold-600"
            />
          )}
          <StatPill
            label="Power"
            value={(group.power ?? 0).toLocaleString()}
            className="text-green-600"
          />
          {group.type !== "Leader" && (
            <StatPill
              label="Counter"
              value={group.counter != null ? `+${group.counter}` : "—"}
              className="text-purple-600"
            />
          )}
        </div>
      ) : (
        <div className="flex gap-3 flex-wrap mb-3 text-xs">
          {group.cost != null && (
            <StatPill
              label="Cost"
              value={group.cost}
              className="text-gold-600"
            />
          )}
          {group.life != null && (
            <StatPill
              label="Life"
              value={group.life}
              className="text-error"
            />
          )}
        </div>
      )}

      {group.effectText && (
        <div className="text-xs text-content-secondary leading-relaxed border-t border-border pt-3 flex flex-col gap-2">
          {group.effectText.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {paragraph}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

export function DeckBuilderList({
  cards,
  leader,
  leaderArtUrl,
  onIncrement,
  onDecrement,
  onSetArtVariant,
  onAddCard,
  onRemoveLeader,
  onSetLeaderArt,
  totalCards,
}: DeckBuilderListProps) {
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);
  const [inspectIsLeader, setInspectIsLeader] = useState(false);

  const inspectEntry = inspectCardId && !inspectIsLeader
    ? cards.find((e) => e.cardId === inspectCardId) ?? null
    : null;

  const groups = buildGroups(leader, leaderArtUrl, cards);

  if (!leader && cards.length === 0) {
    return (
      <div className="rounded border border-border bg-surface-1 p-8 text-center">
        <p className="text-sm font-medium text-content-tertiary">No cards in deck yet</p>
        <p className="mt-1 text-xs text-content-tertiary">
          Click cards from the search panel to add them
        </p>
      </div>
    );
  }

  return (
    <>
      <TooltipProvider disableHoverableContent>
      <div className="flex flex-wrap justify-start gap-4">
        {groups.map((group) => (
          <TooltipRoot key={group.cardId} delayDuration={200}>
            <TooltipTrigger asChild>
              <div className="group/stack flex w-min flex-col items-center">
                {/* Card stack */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div onClick={() => {
                  setInspectCardId(group.cardId);
                  setInspectIsLeader(group.isLeader);
                }}>
                <CardFanStack
                  cardId={group.cardId}
                  count={group.count}
                  className="relative cursor-pointer"
                  renderCard={(i) => (
                    <div className="w-card-thumb overflow-hidden rounded border border-border shadow-sm aspect-card group-hover/stack:-translate-y-2 transition-transform duration-150">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={group.imageUrl}
                        alt={group.name}
                        className={cn(
                          "h-full w-full object-cover",
                          group.count > 1 && i > 0 && "brightness-90",
                        )}
                        loading="lazy"
                      />
                    </div>
                  )}
                />
                </div>

                {/* Quantity controls — below the stack */}
                {!group.isLeader && (
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      aria-label="Remove one"
                      onClick={() => onDecrement(group.cardId)}
                      className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-content-tertiary transition-colors hover:bg-surface-2 hover:text-content-primary"
                    >
                      −
                    </button>
                    <span className="min-w-4 text-center text-xs font-bold tabular-nums text-content-primary">
                      {group.count}
                    </span>
                    <button
                      aria-label="Add one"
                      onClick={() => onIncrement(group.cardId)}
                      disabled={group.count >= 4 || totalCards >= 50}
                      className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-content-tertiary transition-colors hover:bg-surface-2 hover:text-content-primary disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="w-72 bg-surface-base border-border text-content-primary p-3">
              <CardTooltipBody group={group} />
            </TooltipContent>
          </TooltipRoot>
        ))}
      </div>
      </TooltipProvider>

      {/* Inspect modal for deck cards */}
      {inspectEntry && !inspectIsLeader && (
        <CardDetailModal
          cardId={inspectEntry.cardId}
          onClose={() => {
            setInspectCardId(null);
            setInspectIsLeader(false);
          }}
          deckActions={{
            quantityInDeck: inspectEntry.quantity,
            selectedArtUrl: inspectEntry.selectedArtUrl,
            onAdd: () => onAddCard(inspectEntry.card),
            onRemove: () => onDecrement(inspectEntry.cardId),
            onSetArtVariant: (artUrl) => onSetArtVariant(inspectEntry.cardId, artUrl),
          }}
        />
      )}

      {/* Inspect modal for leader */}
      {inspectIsLeader && leader && (
        <CardDetailModal
          cardId={leader.id}
          onClose={() => {
            setInspectCardId(null);
            setInspectIsLeader(false);
          }}
          deckActions={{
            quantityInDeck: 0,
            selectedArtUrl: leaderArtUrl,
            isLeader: true,
            onAdd: () => {},
            onRemove: () => {},
            onSetArtVariant: (artUrl) => onSetLeaderArt(artUrl),
          }}
        />
      )}
    </>
  );
}
