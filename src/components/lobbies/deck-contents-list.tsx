"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import {
  CardDetailResponseSchema,
  type CardDetail,
} from "@/lib/validators/cards";
import type {
  LobbyRoomDeckCard,
  LobbyRoomDeckContents,
} from "@/lib/lobbies/state";
import {
  CardInfoPanel,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui";

const cardDetailsCache = new Map<string, CardDetail>();

export const DECK_GROUPS = [
  { key: "characters", label: "Characters" },
  { key: "events", label: "Events" },
  { key: "stages", label: "Stages" },
] as const;

/**
 * The OPT-587 deck-list presentation: one column, grouped by card type with a
 * sticky header carrying the group total, display name plus `×quantity` rows.
 *
 * Shared by the seat card and the change-deck modal so both surfaces read the
 * same. `previewSide` opts a surface into the focus-driven card art preview;
 * pass `null` where the surface is already a preview (the modal).
 */
export function DeckContentsList({
  contents,
  previewSide = null,
  emptyLabel = "Deck list unavailable",
  className,
}: {
  contents: LobbyRoomDeckContents | undefined;
  previewSide?: "left" | "right" | null;
  emptyLabel?: string;
  className?: string;
}) {
  const groupedCards = useMemo(
    () =>
      DECK_GROUPS.map((group) => ({
        ...group,
        cards: contents?.[group.key] ?? [],
      })).filter((group) => group.cards.length > 0),
    [contents]
  );

  return (
    <div
      className={cn(
        "border-border bg-surface-3 min-h-0 flex-1 overflow-y-auto rounded-md border",
        className
      )}
    >
      {groupedCards.length > 0 ? (
        groupedCards.map((group) => (
          <div key={group.key}>
            <div className="bg-surface-2 text-content-tertiary sticky top-0 z-10 flex items-center justify-between px-3 py-2 text-xs font-semibold tracking-widest uppercase">
              <span>{group.label}</span>
              <span className="tabular-nums">
                {group.cards.reduce(
                  (total, entry) => total + entry.quantity,
                  0
                )}
              </span>
            </div>
            <ul className="divide-border divide-y">
              {group.cards.map((entry) => (
                <DeckListRow
                  key={entry.id}
                  entry={entry}
                  previewSide={previewSide}
                />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <div className="text-content-tertiary flex h-full items-center justify-center px-5 py-6 text-center text-xs">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

function DeckListRow({
  entry,
  previewSide,
}: {
  entry: LobbyRoomDeckCard;
  previewSide: "left" | "right" | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cardDetails, setCardDetails] = useState<CardDetail | null>(
    () => cardDetailsCache.get(entry.cardId) ?? null
  );

  const handlePreviewOpenChange = (open: boolean) => {
    if (open && !cardDetails) {
      setCardDetails(cardDetailsCache.get(entry.cardId) ?? null);
    }
    setPreviewOpen(open);
  };

  useEffect(() => {
    if (!previewOpen || cardDetails) return;

    if (cardDetailsCache.has(entry.cardId)) return;

    let active = true;
    apiGet(
      `/api/cards/${encodeURIComponent(entry.cardId)}`,
      CardDetailResponseSchema
    )
      .then(({ data }) => {
        cardDetailsCache.set(entry.cardId, data);
        if (active) setCardDetails(data);
      })
      .catch(() => {
        // The existing image-only preview is the intentional failure state.
      });

    return () => {
      active = false;
    };
  }, [cardDetails, entry.cardId, previewOpen]);

  if (!previewSide) {
    return (
      <li className="text-content-secondary flex items-center justify-between gap-3 px-3 py-2 text-xs">
        <span className="truncate">{entry.name}</span>
        <span className="text-content-primary shrink-0 font-semibold tabular-nums">
          ×{entry.quantity}
        </span>
      </li>
    );
  }

  const trigger = (
    <button
      type="button"
      onFocus={() => handlePreviewOpenChange(true)}
      onBlur={() => handlePreviewOpenChange(false)}
      className="text-content-secondary hover:bg-surface-2 hover:text-content-primary focus-visible:bg-surface-2 focus-visible:text-content-primary flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors outline-none"
    >
      <span className="truncate">{entry.name}</span>
      <span className="text-content-primary shrink-0 font-semibold tabular-nums">
        ×{entry.quantity}
      </span>
    </button>
  );

  return (
    <li>
      {entry.imageUrl ? (
        <HoverCard
          open={previewOpen}
          onOpenChange={handlePreviewOpenChange}
          openDelay={0}
          closeDelay={0}
        >
          <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
          <HoverCardContent
            side={previewSide}
            sideOffset={16}
            collisionPadding={16}
            className="pointer-events-none hidden w-auto rounded-none border-0 bg-transparent p-0 shadow-none xl:flex"
            aria-hidden="true"
            data-lobby-card-preview={previewSide}
          >
            <div className="relative aspect-card w-40 shrink-0 overflow-hidden rounded-md">
              <Image
                src={entry.imageUrl}
                alt=""
                fill
                sizes="160px"
                unoptimized
                className="h-full w-full rounded object-cover"
              />
            </div>
            {cardDetails && (
              <CardInfoPanel
                className="w-72"
                name={cardDetails.name}
                cardType={cardDetails.type}
                cardId={cardDetails.id}
                cost={cardDetails.cost}
                power={cardDetails.power}
                counter={cardDetails.counter}
                life={cardDetails.life}
                colors={cardDetails.color}
                traits={cardDetails.traits}
                attribute={cardDetails.attribute}
                effectText={cardDetails.effectText}
                triggerText={cardDetails.triggerText}
              />
            )}
          </HoverCardContent>
        </HoverCard>
      ) : (
        trigger
      )}
    </li>
  );
}
