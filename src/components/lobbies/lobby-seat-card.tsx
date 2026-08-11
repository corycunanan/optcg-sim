"use client";

import { Children, useState, type ReactNode } from "react";
import Image from "next/image";
import { Ellipsis, Eye, Plus, Replace, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LobbyRoomDeck } from "@/lib/lobbies/state";
import { UserAvatar } from "@/components/social/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChangeDeckModal, type LobbyDeckOption } from "./change-deck-modal";

/** Who this seat speaks for. Solitaire seats are two sides of one player. */
export type LobbySeatRole = "Host" | "Guest" | "Side 1" | "Side 2";

/**
 * A seat's readiness state, or `undefined` when the mode has no such concept.
 *
 * The four values only ever mean anything together, so they travel together:
 * a seat either has a readiness group or it does not, and solitaire — where
 * one player owns both sides and there is nobody to signal to — does not.
 */
export type LobbySeatReadiness = {
  ready: boolean;
  /** This viewer owns the seat: a toggle rather than a read-only status line. */
  editable: boolean;
  disabled: boolean;
  onChange: (ready: boolean) => void;
};

/**
 * A seat is four stacked groups on the bare page surface — overflow menu,
 * identity, leader, readiness — with no wrapping panel and no internal
 * dividers. The deck itself is not listed here: the leader card is the door to
 * it (change-deck modal on your own seat, deck preview on the other one), so
 * the seat stays a glance-readable summary of *who* and *what they brought*.
 *
 * Readiness is the one optional group. Solitaire drops it — both sides belong
 * to the same player, so there is no one to declare readiness *to* — and the
 * seat becomes three groups. Nothing is reserved in its place: an empty slot
 * would be holding space for a concept the mode does not have. Solitaire
 * renders the same seat twice, so the two sides stay aligned by construction
 * in every regime, and the height the group would have cost goes to the leader
 * art, which is the stack's only flexible member.
 *
 * The lobby frame never scrolls, so the seat has to survive on a height budget
 * it does not control. Two responses, both keyed off the same groups, and both
 * obeying one rule: **the leader art is sized by the seat, never the reverse.**
 *
 * - From `lg` the stack keeps OPT-650's order and the leader is the *only*
 *   flexible member. Everything else is fixed chrome, so the leader absorbs
 *   whatever height is left and derives its width from the card ratio.
 * - Below `lg` a single column cannot hold four stacked groups next to a second
 *   panel, so a grid re-flows them into a row: leader thumbnail down the left,
 *   identity / leader caption / readiness beside it, overflow menu on the
 *   identity row. Only placement changes — the DOM stays in the reading and tab
 *   order the stacked layout paints, and the placement properties simply stop
 *   applying once the seat is a flex column at `lg`.
 *
 * The compact art is height-first too (`h-24`, width from the ratio), so the
 * rows are sized entirely by the text column and the art can never paint past
 * the bottom of the section that contains it. That was the failure the earlier
 * fixed-width thumbnail hid: a grid box whose painted content ran longer than
 * the box the parent had agreed to give it.
 *
 * Readiness then folds up beside the caption once the seat is wide enough to
 * seat both, trading 52px of height for 160px of width. That trade is keyed off
 * a *container* query rather than the viewport: a fixed social rail takes 280px
 * out of every page, so viewport width says nothing useful about how much room
 * this seat actually got.
 */
export function LobbySeatCard({
  role,
  player,
  online,
  deck,
  readiness,
  deckEditable,
  decks,
  onDeckChange,
  onPreview,
  menuItems,
  dimmed = false,
}: {
  role: LobbySeatRole;
  player: {
    username: string | null;
    name: string | null;
    image: string | null;
  };
  /** Realtime presence for this seat; renders the avatar's green dot. */
  online?: boolean;
  deck: LobbyRoomDeck | null;
  /** Omitted in solitaire, where readiness is not a state the mode has. */
  readiness?: LobbySeatReadiness;
  deckEditable: boolean;
  decks: LobbyDeckOption[];
  onDeckChange: (deckId: string) => void;
  onPreview: (deckId: string) => void;
  /** Extra `DropdownMenuItem`s appended to this seat's overflow menu. */
  menuItems?: ReactNode;
  /**
   * Recedes the seat while the match owns the table. Purely visual — every
   * mutating control is already gated by `deckEditable` and the readiness
   * group's own `editable` / `disabled`, and suppressing pointer events here
   * would also kill the read-only affordances (deck preview, the overflow
   * menu) that stay meaningful mid-match.
   */
  dimmed?: boolean;
}) {
  const playerName = displayName(player);
  const [changeDeckOpen, setChangeDeckOpen] = useState(false);
  // Without the readiness row the compact grid is two rows, not three. The art
  // and caption have to stop reaching for a third line that no longer exists,
  // or the seat pays a trailing `gap-y-3` for an empty row.
  const compactArtRows = readiness
    ? "row-end-4 @min-[26rem]:row-end-3"
    : "row-end-3";
  const compactCaptionColumns = readiness
    ? "col-end-4 @min-[26rem]:col-end-3"
    : "col-end-4";

  return (
    <section
      className={cn(
        // `shrink-0` is load-bearing below `lg`: the seats column is a flex
        // column on a height budget, and a shrinkable seat would be handed a
        // box shorter than the rows it just laid out — painting its ready
        // control on top of whatever follows.
        "@container grid min-h-0 min-w-0 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3",
        // From `lg` the seat is a fixed-width centered column: every group
        // hangs off the column's vertical center line and the stack floats on
        // the height budget instead of hugging the top — the LoL-lobby read.
        "lg:flex lg:w-72 lg:flex-col lg:items-center lg:justify-center lg:gap-4 lg:[@media(min-height:50rem)]:gap-5",
        dimmed && "opacity-60"
      )}
      aria-label={`${role} seat — ${playerName}`}
    >
      {/* The trailing column is as wide as the ready control below it, so the
          menu is pinned to that column's end rather than stretched across it —
          the two controls then share one right edge. At `lg` the seat is a
          centered stack, so the menu pins to the column's top-right corner
          instead of joining the centered spine. */}
      <SeatOverflowMenu
        className="col-start-3 row-start-1 justify-self-end lg:self-end"
        seatLabel={`${role} seat — ${playerName}`}
      >
        {deckEditable ? (
          <DropdownMenuItem onSelect={() => setChangeDeckOpen(true)}>
            <Replace />
            Change deck…
          </DropdownMenuItem>
        ) : deck ? (
          <DropdownMenuItem onSelect={() => onPreview(deck.id)}>
            <Eye />
            Preview deck
          </DropdownMenuItem>
        ) : null}
        {menuItems}
      </SeatOverflowMenu>

      <div className="col-start-2 row-start-1 flex min-w-0 max-w-full items-center gap-3">
        <UserAvatar
          user={player}
          size="md"
          variant="dark"
          showOnline={online}
        />
        <div className="min-w-0">
          <h2 className="text-content-primary truncate text-lg font-semibold">
            {playerName}
          </h2>
          <p className="text-gold-600 mt-1 text-xs font-semibold tracking-widest uppercase">
            {role}
          </p>
        </div>
      </div>

      {/* Placement uses explicit end lines rather than `row-span`/`col-span`:
          the span utilities compile to the `grid-row`/`grid-column` shorthand,
          which resets the start line, so a span declared inside the container
          query would silently unpin whatever the base classes placed. */}
      <div
        className="max-lg:contents lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:items-center lg:gap-3"
        data-leader-art-caption-group
      >
        <LeaderArt
          deck={deck}
          deckEditable={deckEditable}
          onChangeDeck={() => setChangeDeckOpen(true)}
          onPreview={onPreview}
          className={cn("col-start-1 row-start-1", compactArtRows)}
        />

        <LeaderCaption
          deck={deck}
          deckEditable={deckEditable}
          className={cn("col-start-2 row-start-2", compactCaptionColumns)}
        />
      </div>

      {/* Its own row while the seat is narrow — a 10rem control and a truncating
          identity cannot share 20rem without one of them disappearing. Past
          26rem it moves up beside the caption, under the overflow menu it now
          shares a column edge with, and the strip loses a whole row. */}
      {readiness && (
        <ReadyControl
          ready={readiness.ready}
          editable={readiness.editable}
          disabled={readiness.disabled}
          onChange={readiness.onChange}
          className="col-start-2 col-end-4 row-start-3 justify-self-start @min-[26rem]:col-start-3 @min-[26rem]:row-start-2 @min-[26rem]:justify-self-end"
        />
      )}

      {deckEditable && (
        <ChangeDeckModal
          open={changeDeckOpen}
          onOpenChange={setChangeDeckOpen}
          decks={decks}
          currentDeck={deck}
          onConfirm={onDeckChange}
        />
      )}
    </section>
  );
}

/**
 * The seat's single `⋮` menu. When no action applies to the current seat state
 * the trigger is dropped — an empty menu is worse than no affordance — but its
 * box is held open by an inert placeholder. Two seats render side by side, so
 * collapsing the group would start one identity row a control-height above the
 * other; the placeholder is `aria-hidden`, unfocusable, and paints nothing, so
 * it costs the keyboard and screen-reader paths nothing.
 */
function SeatOverflowMenu({
  seatLabel,
  className,
  children,
}: {
  seatLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) {
    return (
      <span
        aria-hidden="true"
        className={cn("size-10", className)}
        data-seat-menu-placeholder
      />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={className}
          aria-label={`More actions for ${seatLabel}`}
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.map((item, index) => (
          <SeatMenuSection key={index} first={index === 0}>
            {item}
          </SeatMenuSection>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SeatMenuSection({
  first,
  children,
}: {
  first: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {!first && <DropdownMenuSeparator />}
      {children}
    </>
  );
}

/**
 * Readiness is live status, not a call to action: the one gold control in the
 * lobby is Start Match. The editable seat gets a plain button whose chrome
 * never changes; only the status dot and its label carry the state. The other
 * seat drops the button shell entirely and reads as a status line, keeping the
 * same slot height so both stacks stay aligned.
 */
function ReadyControl({
  ready,
  editable,
  disabled,
  onChange,
  className,
}: {
  ready: boolean;
  editable: boolean;
  disabled: boolean;
  onChange: (ready: boolean) => void;
  className?: string;
}) {
  const dot = (
    <span
      className={cn(
        "size-2 rounded-full",
        ready ? "bg-success" : "bg-content-tertiary"
      )}
      aria-hidden="true"
    />
  );

  if (!editable) {
    return (
      <p
        className={cn(
          "flex min-h-10 shrink-0 items-center gap-2 text-xs font-semibold tracking-widest uppercase",
          ready ? "text-success" : "text-content-tertiary",
          className
        )}
        data-seat-ready-status
      >
        {dot}
        {ready ? "Ready" : "Not ready"}
      </p>
    );
  }

  return (
    <Button
      type="button"
      onClick={() => onChange(!ready)}
      disabled={disabled}
      aria-pressed={ready}
      className={cn(
        "min-w-40 shrink-0",
        ready && "border-success/40 text-success hover:border-success/60",
        className
      )}
    >
      {dot}
      {ready ? "Ready" : "Ready up"}
    </Button>
  );
}

/**
 * Sizing shared by every leader-art state so the filled card, the "choose a
 * deck" affordance, and the inert placeholder occupy exactly the same box.
 *
 * Height drives width in both regimes — the art never states a width of its
 * own, so it can never be the thing that decides how tall its container is.
 *
 * Below `lg` the art is a thumbnail pinned to `h-24`: shorter than the shortest
 * text column it can sit beside, so the strip's height is always the text
 * column's and the art always lands inside it. (A fixed *width* here was the
 * OPT-658 defect — `w-24` implies a 134px card against a text column the seat
 * had no obligation to make that tall.) From `lg` it is the seat's one flexible
 * member: `flex-1` hands it whatever height the fixed groups leave and the cap
 * holds it at OPT-650's hero size (16.75rem is 12rem — `w-48` — at the 600/838
 * card ratio). `w-auto` lets `aspect-card` derive the width from the height in
 * both cases, so the art scales without ever being cropped.
 */
const LEADER_ART_CLASS =
  "aspect-card h-24 w-auto shrink-0 rounded-md lg:h-auto lg:max-h-[16.75rem] lg:min-h-0 lg:w-auto lg:flex-1";

/**
 * The leader art is the seat's hero and its only route into the deck: the
 * viewer's own seat opens the change-deck modal (which shows the full
 * contents), every other seat opens the read-only preview.
 */
function LeaderArt({
  deck,
  deckEditable,
  onChangeDeck,
  onPreview,
  className,
}: {
  deck: LobbyRoomDeck | null;
  deckEditable: boolean;
  onChangeDeck: () => void;
  onPreview: (deckId: string) => void;
  className?: string;
}) {
  if (!deck) {
    const placeholder = (
      <span className="text-content-tertiary flex h-full items-center justify-center">
        {deckEditable ? (
          <Plus className="size-8" />
        ) : (
          <UserRound className="size-8" />
        )}
      </span>
    );

    if (!deckEditable) {
      return (
        <div
          className={cn(
            "border-border bg-surface-2 border border-dashed",
            LEADER_ART_CLASS,
            className
          )}
          aria-hidden="true"
        >
          {placeholder}
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={onChangeDeck}
        className={cn(
          "border-border bg-surface-2 hover:border-border-strong hover:bg-surface-3 focus-visible:outline-border-focus border border-dashed transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
          LEADER_ART_CLASS,
          className
        )}
        aria-label="Choose a deck"
        data-deck-leader-action="change"
      >
        {placeholder}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (deckEditable ? onChangeDeck() : onPreview(deck.id))}
      className={cn(
        "bg-surface-2 border-border focus-visible:outline-border-focus relative overflow-hidden border shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:-outline-offset-2",
        LEADER_ART_CLASS,
        className
      )}
      aria-label={
        deckEditable ? `Change deck — ${deck.name}` : `Preview ${deck.name}`
      }
      data-deck-leader-action={deckEditable ? "change" : "preview"}
    >
      {deck.leaderImageUrl ? (
        <Image
          src={deck.leaderImageUrl}
          alt={deck.leaderName ?? deck.name}
          fill
          sizes="192px"
          unoptimized
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-content-tertiary flex h-full items-center justify-center">
          <UserRound className="size-8" />
        </span>
      )}
    </button>
  );
}

/**
 * Names what the art is showing. It sits with the identity column while the
 * seat is a row and slides under the art once the seat stacks at `lg`, where
 * its width caps at the art's hero width so long leader names truncate rather
 * than widening the stack.
 */
function LeaderCaption({
  deck,
  deckEditable,
  className,
}: {
  deck: LobbyRoomDeck | null;
  deckEditable: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("w-full min-w-0 shrink-0 lg:w-48 lg:text-center", className)}
    >
      <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
        Leader
      </p>
      <p
        className={cn(
          "mt-1 truncate text-sm font-semibold",
          deck ? "text-content-primary" : "text-content-tertiary"
        )}
      >
        {deck
          ? (deck.leaderName ?? deck.name)
          : deckEditable
            ? "Choose a deck"
            : "Waiting on their deck"}
      </p>
    </div>
  );
}

function displayName(user: { username?: string | null; name?: string | null }) {
  return user.username ?? user.name ?? "Player";
}
