"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { DeckCardEntry } from "@/lib/deck-builder/state";
import type { DeckLeaderEntry } from "@/lib/deck-builder/state";
import { getDeckCardCopyLimit } from "@/lib/deck-builder/validation";
import { DeckBuilderCardModal } from "./deck-builder-card-modal";
import {
  CardFanStack,
  CardInfoPanel,
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
  colors: string[];
  traits: string[];
  attribute: string[];
  count: number;
  copyLimit: number;
  isLeader: boolean;
}

function buildGroups(
  leader: DeckLeaderEntry | null,
  leaderArtUrl: string | null,
  cards: DeckCardEntry[]
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
      colors: leader.color,
      traits: leader.traits,
      attribute: leader.attribute,
      count: 1,
      copyLimit: 1,
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
      colors: entry.card.color,
      traits: entry.card.traits,
      attribute: entry.card.attribute,
      count: entry.quantity,
      copyLimit: getDeckCardCopyLimit(entry.card),
      isLeader: false,
    });
  }

  return groups;
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

  const inspectEntry =
    inspectCardId && !inspectIsLeader
      ? (cards.find((e) => e.cardId === inspectCardId) ?? null)
      : null;

  // buildGroups walks every card and parses effect schemas for copy limits —
  // don't redo it when only unrelated state (e.g. the inspect modal) changes
  const groups = useMemo(
    () => buildGroups(leader, leaderArtUrl, cards),
    [leader, leaderArtUrl, cards]
  );

  if (!leader && cards.length === 0) {
    return (
      <div className="border-border bg-card rounded border p-8 text-center">
        <p className="text-content-tertiary text-sm">
          No cards in deck yet
        </p>
        <p className="text-content-tertiary mt-1 text-xs">
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
                  {}
                  <div
                    onClick={() => {
                      setInspectCardId(group.cardId);
                      setInspectIsLeader(group.isLeader);
                    }}
                  >
                    <CardFanStack
                      cardId={group.cardId}
                      count={group.count}
                      className="relative cursor-pointer"
                      renderCard={(i) => (
                        <div className="w-card-thumb border-border aspect-card overflow-hidden rounded border shadow-sm transition-transform duration-150 group-hover/stack:-translate-y-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={group.imageUrl}
                            alt={group.name}
                            className={cn(
                              "h-full w-full object-cover",
                              group.count > 1 && i > 0 && "brightness-90"
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
                        className="text-content-tertiary hover:bg-secondary hover:text-content-primary flex h-5 w-5 items-center justify-center rounded text-xs font-bold transition-colors"
                      >
                        −
                      </button>
                      <span className="text-content-primary min-w-4 text-center text-xs font-bold tabular-nums">
                        {group.count}
                      </span>
                      <button
                        aria-label="Add one"
                        onClick={() => onIncrement(group.cardId)}
                        disabled={
                          group.count >= group.copyLimit || totalCards >= 50
                        }
                        className="text-content-tertiary hover:bg-secondary hover:text-content-primary flex h-5 w-5 items-center justify-center rounded text-xs font-bold transition-colors disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              {/*
                Tier-5: the CardInfoPanel owns the surface, so the Radix
                wrapper is stripped back to a bare positioner. Without this
                the popup would nest a rounded, bordered, padded panel around
                the square Tier-5 body and read as two stacked surfaces.
              */}
              <TooltipContent
                side="top"
                className="w-72 max-w-none rounded-none border-0 bg-transparent p-0 shadow-none"
              >
                <CardInfoPanel
                  name={group.name}
                  cardType={group.type}
                  cardId={group.cardId}
                  cost={group.cost}
                  power={group.power}
                  counter={group.counter}
                  life={group.life}
                  colors={group.colors}
                  traits={group.traits}
                  attribute={group.attribute}
                  effectText={group.effectText}
                  triggerText={group.triggerText}
                />
              </TooltipContent>
            </TooltipRoot>
          ))}
        </div>
      </TooltipProvider>

      {/* Inspect modal for deck cards */}
      {inspectEntry && !inspectIsLeader && (
        <DeckBuilderCardModal
          cardId={inspectEntry.cardId}
          onClose={() => {
            setInspectCardId(null);
            setInspectIsLeader(false);
          }}
          isLeader={false}
          quantityInDeck={inspectEntry.quantity}
          selectedArtUrl={inspectEntry.selectedArtUrl}
          onAdd={onAddCard}
          onRemove={() => onDecrement(inspectEntry.cardId)}
          onSetArtVariant={(artUrl) =>
            onSetArtVariant(inspectEntry.cardId, artUrl)
          }
        />
      )}

      {/* Inspect modal for leader */}
      {inspectIsLeader && leader && (
        <DeckBuilderCardModal
          cardId={leader.id}
          onClose={() => {
            setInspectCardId(null);
            setInspectIsLeader(false);
          }}
          isLeader={true}
          quantityInDeck={0}
          selectedArtUrl={leaderArtUrl}
          onAdd={() => {}}
          onRemove={() => {}}
          onRemoveLeader={() => {
            onRemoveLeader();
            setInspectCardId(null);
            setInspectIsLeader(false);
          }}
          onSetArtVariant={(artUrl) => onSetLeaderArt(artUrl)}
        />
      )}
    </>
  );
}
