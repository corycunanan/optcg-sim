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
 * Elevation: a **card surface**, not a structural list row — the row's subject
 * is the leader's printed art, and the whole row is one object you pick up.
 * `docs/design/ELEVATION-LANGUAGE.md` §The three treatments carves art-bearing
 * rows out of the flat "list rows" bucket for exactly that reason, and puts
 * them on the card register: `shadow-sm` at rest, `shadow-md` on hover, cast
 * through `ChamferFrame`'s `shadow` layer so the cast follows the chamfered
 * silhouette instead of a rectangle. Hover moves the row one full tier, so the
 * elevation *color* step and the shadow step change together — the ladder in
 * that doc pairs them per tier, which is why moving both is one change and not
 * two (§Anti-stacking).
 *
 * Interaction: the deck name carries the real link and stretches its hit area
 * over the whole row through an `::after` overlay, which keeps the row
 * single-click navigable *and* keeps the two nested controls — the leader
 * tooltip trigger and the kebab — as real siblings rather than illegal
 * interactive descendants of an anchor. Both lift above the overlay with
 * `relative z-10`.
 *
 * Focus stops, in order: thumbnail, deck name, kebab. The frame's chamfered
 * ring is the **single** indicator for all three, so every stop opts out of
 * its own — the thumbnail's ring, the kebab Button's outline, and the global
 * `:focus-visible` outline the link would otherwise pick up from globals.css.
 * `ChamferFrame`'s focus support is `:has(:focus-visible)`, which matches any
 * descendant and cannot be narrowed to the link alone from the consumer side,
 * so any stop that kept its own indicator would paint two at once. Scoping
 * that selector belongs to the primitive; see the PR discussion.
 */
function DeckRow({ deck }: { deck: DeckListItem }) {
  const { leader } = deck;

  return (
    <li>
      <ChamferFrame
        interactive
        cut="lg"
        shadow="sm"
        shadowHover="md"
        className="group"
        surfaceClassName="bg-surface-1 group-hover:bg-surface-2 relative flex items-center gap-4 p-4 transition-colors duration-200"
      >
        <TooltipRoot delayDuration={200}>
          <TooltipTrigger asChild>
            {/*
              A real button so the leader panel is reachable by keyboard as
              well as hover — it is the only route to the leader's life,
              power, and effect text from this page. Its own focus ring is
              suppressed: the frame's chamfered ring is the row's single
              focus indicator.
            */}
            <button
              type="button"
              aria-label={`Leader details for ${leader.name}`}
              className="relative z-10 w-14 shrink-0 cursor-help rounded focus-visible:outline-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={leader.imageUrl}
                alt=""
                className="aspect-card rounded-card w-full object-cover object-top"
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
            className="w-72 max-w-none border-0 bg-transparent p-0"
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
            <h2 className="text-content-primary truncate text-base font-semibold">
              {/*
                `focus-visible:outline-none` opts out of the global
                `:focus-visible` outline in globals.css — on this stop the
                frame ring is already drawing, and the global rule would
                outline the text box inside it as a second indicator.
              */}
              <Link
                href={`/decks/${deck.id}`}
                className="after:absolute after:inset-0 focus-visible:outline-none"
              >
                {deck.name}
              </Link>
            </h2>
            {/*
              Name *and* printed ID, because the name alone is ambiguous: a
              leader is reprinted across sets, and players trade and talk in
              IDs. `Card.id` is the printed ID (`prisma/schema.prisma`), so no
              second lookup is needed — the row already has it for the panel.
            */}
            <p className="text-content-tertiary mt-1 truncate text-sm">
              {leader.name} ({leader.id})
            </p>
          </div>

          {/*
            The cluster wraps internally as well as moving below the name:
            colour labels + count + date + a 48px kebab exceed the width left
            beside the thumbnail at 320px, so `shrink-0` alone would push the
            row into horizontal overflow. It only refuses to shrink once
            there is room for it beside the name.
          */}
          <div
            data-slot="deck-row-meta"
            className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 sm:shrink-0"
          >
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
            {/*
              `focus-visible:outline-none` defers to the frame ring: the Button
              primitive's own focus outline would be the row's second
              simultaneous indicator.
            */}
            <DeckDeleteButton
              deckId={deck.id}
              deckName={deck.name}
              className="relative z-10 focus-visible:outline-none"
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
