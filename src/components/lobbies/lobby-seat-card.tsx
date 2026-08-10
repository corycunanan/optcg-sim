"use client";

import { Children, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  EllipsisVertical,
  Eye,
  Layers3,
  Replace,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LobbyRoomDeck } from "@/lib/lobbies/state";
import { UserAvatar } from "@/components/social/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { DeckContentsList } from "./deck-contents-list";
import { ChangeDeckModal, type LobbyDeckOption } from "./change-deck-modal";

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
  previewSide,
  disclosure,
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
  previewSide: "left" | "right";
  disclosure?: ReactNode;
  /** Extra `DropdownMenuItem`s appended to this seat's overflow menu. */
  menuItems?: ReactNode;
  /**
   * Recedes the seat while the match owns the table. Purely visual — every
   * mutating control is already gated by `deckEditable` / `readyEditable` /
   * `readyDisabled`, and suppressing pointer events here would also kill the
   * read-only affordances (deck preview, the overflow menu, card art hovers)
   * that stay meaningful mid-match.
   */
  dimmed?: boolean;
}) {
  const playerName = displayName(player);
  const [changeDeckOpen, setChangeDeckOpen] = useState(false);

  return (
    <section
      className={cn(
        "border-border bg-surface-1 relative flex h-full min-h-0 flex-col overflow-visible rounded-lg border",
        dimmed && "opacity-50"
      )}
      aria-label={`${role} seat — ${playerName}`}
    >
      {disclosure && (
        <div
          className="border-border bg-surface-2 flex items-center border-b px-5 py-3"
          data-spectator-consent
        >
          {disclosure}
        </div>
      )}
      <header className="border-border flex min-h-20 items-start justify-between gap-4 border-b px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
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
        <div className="flex shrink-0 items-center gap-2">
          <ReadyPill
            ready={ready}
            editable={readyEditable}
            disabled={readyDisabled}
            onChange={onReadyChange}
          />
          <SeatOverflowMenu seatLabel={`${role} seat — ${playerName}`}>
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
        </div>
      </header>

      {deck ? (
        <SelectedDeck
          key={deck.id}
          deck={deck}
          deckEditable={deckEditable}
          onChangeDeck={() => setChangeDeckOpen(true)}
          onPreview={onPreview}
          previewSide={previewSide}
        />
      ) : (
        <NoDeckChosen
          deckEditable={deckEditable}
          onChangeDeck={() => setChangeDeckOpen(true)}
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
 * The seat's single `⋮` menu. Renders nothing when no action applies to the
 * current seat state — an empty menu is worse than no affordance.
 */
function SeatOverflowMenu({
  seatLabel,
  children,
}: {
  seatLabel: string;
  children: ReactNode;
}) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`More actions for ${seatLabel}`}
        >
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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

function ReadyPill({
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
  const label = ready ? "Ready" : "Not ready";
  const tone = ready
    ? "border-success/20 bg-success-soft text-success"
    : "border-border bg-surface-2 text-content-secondary";
  const content = (
    <>
      <span
        className={cn(
          "size-2 rounded-full",
          ready ? "bg-success" : "bg-content-tertiary"
        )}
        aria-hidden="true"
      />
      {label}
    </>
  );
  const base =
    "inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold tracking-widest uppercase";

  if (!editable) {
    return <span className={cn(base, tone)}>{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onChange(!ready)}
      disabled={disabled}
      aria-pressed={ready}
      className={cn(
        base,
        "focus-visible:outline-border-focus transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        ready
          ? tone
          : "border-border bg-surface-2 text-content-secondary hover:border-border-strong hover:text-content-primary"
      )}
    >
      {content}
    </button>
  );
}

function SelectedDeck({
  deck,
  deckEditable,
  onChangeDeck,
  onPreview,
  previewSide,
}: {
  deck: LobbyRoomDeck;
  deckEditable: boolean;
  onChangeDeck: () => void;
  onPreview: (deckId: string) => void;
  previewSide: "left" | "right";
}) {
  return (
    <div className="relative grid min-h-0 flex-1 gap-5 p-5 sm:grid-cols-[auto_1fr]">
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => (deckEditable ? onChangeDeck() : onPreview(deck.id))}
          className="bg-surface-3 border-border group aspect-card focus-visible:outline-border-focus relative w-32 overflow-hidden rounded-md border text-left shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2"
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
              sizes="128px"
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-content-tertiary flex h-full items-center justify-center">
              <UserRound className="size-8" />
            </span>
          )}
        </button>
        <div className="w-32">
          <p className="text-content-primary truncate text-sm font-semibold">
            {deck.leaderName ?? deck.name}
          </p>
          <p className="text-content-tertiary mt-1 font-mono text-sm font-semibold tracking-widest">
            {deck.leaderId}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
              Deck list
            </p>
            <h3 className="text-content-primary truncate text-base font-semibold">
              {deck.name}
            </h3>
          </div>
          <Layers3 className="text-content-tertiary size-5 shrink-0" />
        </div>

        <DeckContentsList contents={deck.contents} previewSide={previewSide} />
      </div>
    </div>
  );
}

function NoDeckChosen({
  deckEditable,
  onChangeDeck,
}: {
  deckEditable: boolean;
  onChangeDeck: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      {deckEditable ? (
        <button
          type="button"
          onClick={onChangeDeck}
          className="border-border bg-surface-3 hover:border-border-strong focus-visible:outline-border-focus aspect-card flex w-24 items-center justify-center rounded-md border border-dashed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label="Choose a deck"
          data-deck-leader-action="change"
        >
          <UserRound className="text-content-tertiary size-8" />
        </button>
      ) : (
        <div className="border-border bg-surface-3 aspect-card flex w-24 items-center justify-center rounded-md border border-dashed">
          <UserRound className="text-content-tertiary size-8" />
        </div>
      )}
      <div>
        <h3 className="text-content-primary text-base font-semibold">
          No deck chosen
        </h3>
        <p className="text-content-tertiary mt-1 text-sm">
          {deckEditable
            ? "Choose a deck to reveal your leader and list."
            : "Waiting on their deck selection."}
        </p>
      </div>
      <div className="flex w-full max-w-64 flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}

function displayName(user: { username?: string | null; name?: string | null }) {
  return user.username ?? user.name ?? "Player";
}
