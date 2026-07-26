"use client";

import { useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { Layers3, Lock, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LobbyRoomDeck, LobbyRoomDeckCard } from "@/lib/lobbies/state";
import { UserAvatar } from "@/components/social/user-avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface DeckOption extends LobbyRoomDeck {
  format: string;
  totalCards: number;
  colors: string[];
}

const DECK_GROUPS = [
  { key: "characters", label: "Characters" },
  { key: "events", label: "Events" },
  { key: "stages", label: "Stages" },
] as const;

export function LobbySeatCard({
  role,
  player,
  deck,
  ready,
  readyEditable,
  readyDisabled,
  deckEditable,
  decks,
  deckPlaceholder,
  onDeckChange,
  onReadyChange,
  onPreview,
  previewSide,
  disclosure,
  actions,
  disabled = false,
}: {
  role: "Host" | "Guest";
  player: {
    username: string | null;
    name: string | null;
    image: string | null;
  };
  deck: LobbyRoomDeck | null;
  ready: boolean;
  readyEditable: boolean;
  readyDisabled: boolean;
  deckEditable: boolean;
  decks: DeckOption[];
  deckPlaceholder: string;
  onDeckChange: (deckId: string) => void;
  onReadyChange: (ready: boolean) => void;
  onPreview: (deckId: string) => void;
  previewSide: "left" | "right";
  disclosure?: ReactNode;
  actions?: ReactNode;
  disabled?: boolean;
}) {
  const playerName = displayName(player);

  return (
    <section
      className={cn(
        "border-border bg-surface-1 relative flex min-h-96 flex-col overflow-visible rounded-lg border",
        disabled && "pointer-events-none opacity-50"
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
      <header className="border-border flex min-h-20 items-center justify-between gap-4 border-b px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar user={player} size="md" variant="dark" />
          <div className="min-w-0">
            <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
              {role}
            </p>
            <h2 className="text-content-primary truncate text-lg font-semibold">
              {playerName}
            </h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {readyEditable ? (
            <button
              type="button"
              onClick={() => onReadyChange(!ready)}
              disabled={readyDisabled}
              className={cn(
                "focus-visible:outline-border-focus inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                ready
                  ? "border-success/20 bg-success-soft text-success"
                  : "border-border bg-surface-2 text-content-secondary hover:border-border-strong hover:text-content-primary"
              )}
              aria-pressed={ready}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  ready ? "bg-success" : "bg-content-tertiary"
                )}
              />
              {ready ? "Ready" : "Not ready"}
            </button>
          ) : (
            <span
              className={cn(
                "inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold",
                ready
                  ? "border-success/20 bg-success-soft text-success"
                  : "border-border bg-surface-2 text-content-secondary"
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  ready ? "bg-success" : "bg-content-tertiary"
                )}
              />
              {ready ? "Ready" : "Not ready"}
            </span>
          )}
          {actions}
        </div>
      </header>

      {deck ? (
        <SelectedDeck
          key={deck.id}
          deck={deck}
          onPreview={onPreview}
          previewSide={previewSide}
        />
      ) : (
        <NoDeckChosen />
      )}

      <footer className="border-border mt-auto border-t p-4">
        {deckEditable ? (
          <Select value={deck?.id ?? ""} onValueChange={onDeckChange}>
            <SelectTrigger className="bg-surface-3 w-full">
              <SelectValue placeholder={deckPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {decks.map((deckOption) => (
                <SelectItem key={deckOption.id} value={deckOption.id}>
                  {deckOption.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="border-border bg-surface-3 text-content-secondary flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm">
            <Lock className="size-4" />
            <span className="truncate">{deck?.name ?? "Waiting for deck"}</span>
          </div>
        )}
      </footer>
    </section>
  );
}

function SelectedDeck({
  deck,
  onPreview,
  previewSide,
}: {
  deck: LobbyRoomDeck;
  onPreview: (deckId: string) => void;
  previewSide: "left" | "right";
}) {
  const [hoveredCard, setHoveredCard] = useState<LobbyRoomDeckCard | null>(
    null
  );

  const groupedCards = useMemo(
    () =>
      DECK_GROUPS.map((group) => ({
        ...group,
        cards: deck.contents?.[group.key] ?? [],
      })).filter((group) => group.cards.length > 0),
    [deck.contents]
  );

  const hoveredImage = hoveredCard?.imageUrl ?? null;

  return (
    <div className="relative grid flex-1 gap-5 p-5 sm:grid-cols-[auto_1fr]">
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onPreview(deck.id)}
          className="bg-surface-3 border-border group aspect-card focus-visible:outline-border-focus relative w-32 overflow-hidden rounded-md border text-left shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={`Preview ${deck.name}`}
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
          <p className="text-content-tertiary mt-1 font-mono text-xs">
            {deck.leaderId}
          </p>
        </div>
      </div>

      <div className="min-w-0">
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

        <div className="border-border bg-surface-3 h-64 overflow-y-auto rounded-md border">
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
                    <li key={entry.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setHoveredCard(entry)}
                        onMouseLeave={() => setHoveredCard(null)}
                        onFocus={() => setHoveredCard(entry)}
                        onBlur={() => setHoveredCard(null)}
                        className="text-content-secondary hover:bg-surface-2 hover:text-content-primary focus-visible:bg-surface-2 focus-visible:text-content-primary flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors outline-none"
                      >
                        <span className="truncate">{entry.name}</span>
                        <span className="text-content-primary shrink-0 font-semibold tabular-nums">
                          ×{entry.quantity}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <div className="text-content-tertiary flex h-full items-center justify-center px-5 text-center text-xs">
              Deck list unavailable
            </div>
          )}
        </div>
      </div>

      {hoveredImage && hoveredCard && (
        <div
          className={cn(
            "border-border bg-surface-2 aspect-card pointer-events-none absolute top-16 z-30 hidden w-40 overflow-hidden rounded-md border p-1 shadow-[var(--shadow-lg)] xl:block",
            previewSide === "left" ? "right-full mr-4" : "left-full ml-4"
          )}
          aria-hidden="true"
        >
          <Image
            src={hoveredImage}
            alt=""
            fill
            sizes="160px"
            unoptimized
            className="h-full w-full rounded object-cover"
          />
        </div>
      )}
    </div>
  );
}

function NoDeckChosen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <div className="border-border bg-surface-3 aspect-card flex w-24 items-center justify-center rounded-md border border-dashed">
        <UserRound className="text-content-tertiary size-8" />
      </div>
      <div>
        <h3 className="text-content-primary text-base font-semibold">
          No deck chosen
        </h3>
        <p className="text-content-tertiary mt-1 text-sm">
          Choose a deck to reveal your leader and list.
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
