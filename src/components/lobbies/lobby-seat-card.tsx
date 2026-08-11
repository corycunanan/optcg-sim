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
        "flex min-w-0 flex-col items-start gap-5",
        dimmed && "opacity-60"
      )}
      aria-label={`${role} seat — ${playerName}`}
    >
      {/* Pulls the ghost button's own padding out so the glyph reads on the
          same left edge as the avatar, leader card, and ready control. */}
      <SeatOverflowMenu
        className="-ml-3"
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

      <div className="flex min-w-0 max-w-full items-center gap-3">
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

      <LeaderSlot
        deck={deck}
        deckEditable={deckEditable}
        onChangeDeck={() => setChangeDeckOpen(true)}
        onPreview={onPreview}
      />

      <ReadyControl
        ready={ready}
        editable={readyEditable}
        disabled={readyDisabled}
        onChange={onReadyChange}
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
}: {
  ready: boolean;
  editable: boolean;
  disabled: boolean;
  onChange: (ready: boolean) => void;
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
          "flex min-h-10 items-center gap-2 text-xs font-semibold tracking-widest uppercase",
          ready ? "text-success" : "text-content-tertiary"
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
        "min-w-40",
        ready && "border-success/40 text-success hover:border-success/60"
      )}
    >
      {dot}
      {ready ? "Ready" : "Ready up"}
    </Button>
  );
}

/**
 * The leader art is the seat's hero and its only route into the deck: the
 * viewer's own seat opens the change-deck modal (which shows the full
 * contents), every other seat opens the read-only preview.
 */
function LeaderSlot({
  deck,
  deckEditable,
  onChangeDeck,
  onPreview,
}: {
  deck: LobbyRoomDeck | null;
  deckEditable: boolean;
  onChangeDeck: () => void;
  onPreview: (deckId: string) => void;
}) {
  const caption = (
    <div className="w-48 min-w-0">
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

    return (
      <div className="flex flex-col gap-3">
        {deckEditable ? (
          <button
            type="button"
            onClick={onChangeDeck}
            className="border-border bg-surface-2 hover:border-border-strong hover:bg-surface-3 focus-visible:outline-border-focus aspect-card w-48 rounded-md border border-dashed transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
            aria-label="Choose a deck"
            data-deck-leader-action="change"
          >
            {placeholder}
          </button>
        ) : (
          <div
            className="border-border bg-surface-2 aspect-card w-48 rounded-md border border-dashed"
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}
        {caption}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => (deckEditable ? onChangeDeck() : onPreview(deck.id))}
        className="bg-surface-2 border-border focus-visible:outline-border-focus aspect-card relative w-48 overflow-hidden rounded-md border shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:-outline-offset-2"
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
      {caption}
    </div>
  );
}

function displayName(user: { username?: string | null; name?: string | null }) {
  return user.username ?? user.name ?? "Player";
}
