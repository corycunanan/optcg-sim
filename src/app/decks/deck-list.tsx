"use client";

import Link from "next/link";

import { DeckDeleteButton } from "@/components/deck-builder/deck-delete-button";
import {
  CardInfoPanel,
  ChamferFrame,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";

import { DeckColorIndicators } from "./deck-color-indicators";

/** Everything a row renders, pre-resolved on the server. */
export interface DeckListLeader {
  id: string;
  name: string;
  /** Card category — always "Leader" here, but passed through verbatim. */
  type: string;
  /** `Deck.leaderArtUrl` when the owner picked a variant, else the base art. */
  imageUrl: string;
  colors: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  traits: string[];
  attribute: string[];
  effectText: string | null;
  triggerText: string | null;
}

export interface DeckListItem {
  id: string;
  name: string;
  totalCards: number;
  colors: string[];
  /** Machine-readable `updatedAt` for `<time dateTime>`. */
  updatedAtIso: string;
  /** Display date, formatted server-side so hydration can't disagree. */
  updatedAtLabel: string;
  leader: DeckListLeader;
}

/** Main decks are always 50 cards; the leader is counted separately. */
const MAIN_DECK_SIZE = 50;

/**
 * One deck per row.
 *
 * Shape: a borderless chamfered surface (`ChamferFrame`, `edge="none"`,
 * top-left + bottom-right 12px cuts) exactly one elevation step above the page
 * — separation comes from the surface step and the row gap, never from a
 * hairline or a divider. The leader thumbnail is deliberately the only rounded
 * rectangle in the row, per the figure-ground rule in
 * `docs/design/SHAPE-LANGUAGE.md`.
 *
 * Interaction: the deck name carries the real link and stretches its hit area
 * over the whole row through an `::after` overlay, which keeps the row
 * single-click navigable *and* keeps the two nested controls — the leader
 * tooltip trigger and the kebab — as real siblings rather than illegal
 * interactive descendants of an anchor. Both lift above the overlay with
 * `relative z-10`. Focus stops, in order: thumbnail, deck name, kebab; the
 * frame's chamfered focus ring lights for whichever is focused because
 * `interactive` also watches `:has(:focus-visible)`.
 */
function DeckRow({ deck }: { deck: DeckListItem }) {
  const { leader } = deck;

  return (
    <li>
      <ChamferFrame
        interactive
        cut="lg"
        className="group"
        surfaceClassName="bg-surface-1 group-hover:bg-surface-2 relative flex items-center gap-4 p-4 transition-colors duration-200"
      >
        <TooltipRoot delayDuration={200}>
          <TooltipTrigger asChild>
            {/*
              A real button so the leader panel is reachable by keyboard as
              well as hover — it is the only route to the leader's life,
              power, and effect text from this page.
            */}
            <button
              type="button"
              aria-label={`Leader details for ${leader.name}`}
              className="focus-visible:ring-border-focus relative z-10 w-14 shrink-0 cursor-help rounded focus-visible:ring-2 focus-visible:outline-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={leader.imageUrl}
                alt=""
                className="aspect-card w-full rounded object-cover object-top"
                loading="lazy"
              />
            </button>
          </TooltipTrigger>
          {/*
            Tier-5 information surface: `CardInfoPanel` owns the panel, so the
            tooltip primitive is stripped back to a bare positioner rather than
            wrapping a second visible surface around it.
          */}
          <TooltipContent
            side="right"
            className="w-72 max-w-none rounded-none border-0 bg-transparent p-0 shadow-none"
          >
            <CardInfoPanel
              name={leader.name}
              cardType={leader.type}
              cardId={leader.id}
              cost={leader.cost}
              power={leader.power}
              counter={leader.counter}
              life={leader.life}
              colors={leader.colors}
              traits={leader.traits}
              attribute={leader.attribute}
              effectText={leader.effectText}
              triggerText={leader.triggerText}
            />
          </TooltipContent>
        </TooltipRoot>

        {/*
          The single wireframe breakpoint: below `sm` the metadata cluster
          wraps under the deck name instead of sitting beside it, so nothing
          has to be dropped and the thumbnail + name/leader stack survives.
        */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-content-primary truncate text-base">
              <Link
                href={`/decks/${deck.id}`}
                className="after:absolute after:inset-0"
              >
                {deck.name}
              </Link>
            </h2>
            <p className="text-content-tertiary mt-1 truncate text-sm">
              {leader.name}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <DeckColorIndicators colors={deck.colors} />
            <span className="text-content-secondary text-sm tabular-nums">
              {deck.totalCards}/{MAIN_DECK_SIZE}
            </span>
            <time
              dateTime={deck.updatedAtIso}
              className="text-content-tertiary text-sm tabular-nums"
            >
              {deck.updatedAtLabel}
            </time>
            <DeckDeleteButton
              deckId={deck.id}
              deckName={deck.name}
              className="relative z-10"
            />
          </div>
        </div>
      </ChamferFrame>
    </li>
  );
}

/**
 * The `/decks` row list. One tooltip provider for the whole list so the
 * hover delay is shared across rows rather than restarting on each one.
 */
export function DeckList({ decks }: { decks: DeckListItem[] }) {
  return (
    <TooltipProvider disableHoverableContent>
      <ul className="flex flex-col gap-3">
        {decks.map((deck) => (
          <DeckRow key={deck.id} deck={deck} />
        ))}
      </ul>
    </TooltipProvider>
  );
}
