"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DeckCardEntry } from "@/lib/deck-builder/state";
import type { DeckLeaderEntry } from "@/lib/deck-builder/state";
import { getDeckCardCopyLimit } from "@/lib/deck-builder/validation";
import { DeckBuilderCardModal } from "./deck-builder-card-modal";
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
      traits: leader.traits,
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
      traits: entry.card.traits,
      count: entry.quantity,
      copyLimit: getDeckCardCopyLimit(entry.card),
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
    <div className="px-2 text-center">
      <div className={cn("text-sm font-bold", className)}>{String(value)}</div>
      <div className="text-content-tertiary text-xs tracking-wide uppercase">
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
      <div className="text-content-primary text-sm font-bold">{group.name}</div>
      <div className="text-content-tertiary mb-3 text-xs">
        {group.type} &middot; {group.cardId}
      </div>

      {isFieldCard ? (
        <div className="mb-3 flex flex-wrap gap-5 text-xs">
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
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          {group.cost != null && (
            <StatPill
              label="Cost"
              value={group.cost}
              className="text-gold-600"
            />
          )}
          {group.life != null && (
            <StatPill label="Life" value={group.life} className="text-error" />
          )}
        </div>
      )}

      {group.effectText && (
        <div className="text-content-secondary border-border flex flex-col gap-2 border-t pt-3 text-xs leading-relaxed">
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

  const inspectEntry =
    inspectCardId && !inspectIsLeader
      ? (cards.find((e) => e.cardId === inspectCardId) ?? null)
      : null;

  const groups = buildGroups(leader, leaderArtUrl, cards);

  if (!leader && cards.length === 0) {
    return (
      <div className="border-border bg-surface-1 rounded border p-8 text-center">
        <p className="text-content-tertiary text-sm font-medium">
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
                        className="text-content-tertiary hover:bg-surface-2 hover:text-content-primary flex h-5 w-5 items-center justify-center rounded text-xs font-bold transition-colors"
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
                        className="text-content-tertiary hover:bg-surface-2 hover:text-content-primary flex h-5 w-5 items-center justify-center rounded text-xs font-bold transition-colors disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="bg-surface-base border-border text-content-primary w-72 p-3"
              >
                <CardTooltipBody group={group} />
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
          copyLimit={getDeckCardCopyLimit(inspectEntry.card)}
          selectedArtUrl={inspectEntry.selectedArtUrl}
          onAdd={() => onAddCard(inspectEntry.card)}
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
          copyLimit={1}
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
