"use client";

import { Children, useState, type ReactNode } from "react";
import Image from "next/image";
import { EllipsisVertical, Eye, Plus, Replace, UserRound } from "lucide-react";
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

/**
 * A seat is four stacked groups on the bare page surface — overflow menu,
 * identity, leader, readiness — with no wrapping panel and no internal
 * dividers. The deck itself is not listed here: the leader card is the door to
 * it (change-deck modal on your own seat, deck preview on the other one), so
 * the seat stays a glance-readable summary of *who* and *what they brought*.
 *
 * The lobby frame never scrolls, so the seat has to survive on a height budget
 * it does not control. Two responses, both keyed off the same groups:
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
 */
export function LobbySeatCard({
  role,
  player,
  online,
  deck,
  ready,
  readyEditable,
  readyDisabled,
  deckEditable,
  decks,
  onDeckChange,
  onReadyChange,
  onPreview,
  menuItems,
  dimmed = false,
}: {
  role: "Host" | "Guest";
  player: {
    username: string | null;
    name: string | null;
    image: string | null;
  };
  /** Realtime presence for this seat; renders the avatar's green dot. */
  online?: boolean;
  deck: LobbyRoomDeck | null;
  ready: boolean;
  readyEditable: boolean;
  readyDisabled: boolean;
  deckEditable: boolean;
  decks: LobbyDeckOption[];
  onDeckChange: (deckId: string) => void;
  onReadyChange: (ready: boolean) => void;
  onPreview: (deckId: string) => void;
  /** Extra `DropdownMenuItem`s appended to this seat's overflow menu. */
  menuItems?: ReactNode;
  /**
   * Recedes the seat while the match owns the table. Purely visual — every
   * mutating control is already gated by `deckEditable` / `readyEditable` /
   * `readyDisabled`, and suppressing pointer events here would also kill the
   * read-only affordances (deck preview, the overflow menu) that stay
   * meaningful mid-match.
   */
  dimmed?: boolean;
}) {
  const playerName = displayName(player);
  const [changeDeckOpen, setChangeDeckOpen] = useState(false);

  return (
    <section
      className={cn(
        "grid min-h-0 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3",
        "lg:flex lg:flex-col lg:gap-4 lg:[@media(min-height:50rem)]:gap-5",
        dimmed && "opacity-60"
      )}
      aria-label={`${role} seat — ${playerName}`}
    >
      {/* Pulls the ghost button's own padding out so the glyph reads on the
          same edge as the rest of the seat — the row's right edge while the
          seat is a row, the shared left edge once it stacks at `lg`. */}
      <SeatOverflowMenu
        className="col-start-3 row-start-1 -mr-3 lg:-ml-3 lg:mr-0"
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

      <LeaderArt
        deck={deck}
        deckEditable={deckEditable}
        onChangeDeck={() => setChangeDeckOpen(true)}
        onPreview={onPreview}
        className="col-start-1 row-span-3 row-start-1"
      />

      <LeaderCaption
        deck={deck}
        deckEditable={deckEditable}
        className="col-span-2 col-start-2 row-start-2"
      />

      <ReadyControl
        ready={ready}
        editable={readyEditable}
        disabled={readyDisabled}
        onChange={onReadyChange}
        className="col-span-2 col-start-2 row-start-3 justify-self-start"
      />

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
          <EllipsisVertical />
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
 * Below `lg` the art is a fixed thumbnail set beside the seat's identity
 * column. From `lg` it is the seat's one flexible member: `flex-1` hands it
 * whatever height the fixed groups leave, `w-auto` lets `aspect-card` derive
 * the width from that height, and the cap holds it at OPT-650's hero size
 * (16.75rem is 12rem — `w-48` — at the 600/838 card ratio). Height drives
 * width rather than the reverse, so the art scales without ever being cropped.
 */
const LEADER_ART_CLASS =
  "aspect-card w-24 shrink-0 rounded-md lg:max-h-[16.75rem] lg:min-h-0 lg:w-auto lg:flex-1";

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
    <div className={cn("w-full min-w-0 shrink-0 lg:w-48", className)}>
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
