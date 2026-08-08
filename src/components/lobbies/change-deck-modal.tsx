"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import {
  DeckDetailResponseSchema,
  type DeckDetailResponse,
} from "@/lib/validators/cards";
import type { LobbyRoomDeck, LobbyRoomDeckContents } from "@/lib/lobbies/state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DeckContentsList } from "./deck-contents-list";

export interface LobbyDeckOption extends LobbyRoomDeck {
  format: string;
  totalCards: number;
  colors: string[];
}

/**
 * Two-pane deck switcher. The left rail lists the viewer's decks and only
 * *previews* the highlighted one; nothing is committed until "Use this deck".
 * Cancel / Escape discards the preview and restores the seated deck.
 */
export function ChangeDeckModal({
  open,
  onOpenChange,
  decks,
  currentDeck,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decks: LobbyDeckOption[];
  currentDeck: LobbyRoomDeck | null;
  onConfirm: (deckId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    currentDeck?.id ?? null
  );

  // Re-seed the preview from the seated deck every time the modal opens so a
  // discarded selection never leaks into the next visit. Adjusted during
  // render rather than in an effect — no cascading commit.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSelectedId(currentDeck?.id ?? decks[0]?.id ?? null);
  }

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedId) ?? null,
    [decks, selectedId]
  );
  const seededContents =
    selectedId && selectedId === currentDeck?.id
      ? currentDeck.contents
      : undefined;
  const { contents, loading, failed, retry } = useDeckContents(
    open ? selectedId : null,
    seededContents
  );

  const previewDeck =
    selectedDeck ?? (selectedId === currentDeck?.id ? currentDeck : null);
  const commitDisabled = !selectedId || selectedId === currentDeck?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        className="flex max-h-[80vh] flex-col gap-5"
        data-change-deck-modal
      >
        <DialogHeader>
          <DialogTitle className="font-display uppercase">
            Change deck
          </DialogTitle>
          <DialogDescription>
            Preview any of your decks, then confirm to take it into the match.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-2">
            <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
              Decks
            </p>
            <div
              className="border-border bg-surface-3 max-h-48 min-h-0 flex-1 overflow-y-auto rounded-md border p-1 sm:max-h-none"
              role="group"
              aria-label="Your decks"
            >
              {decks.length === 0 ? (
                <p className="text-content-tertiary px-3 py-2 text-xs">
                  No decks yet. Build one to play.
                </p>
              ) : (
                decks.map((deck) => {
                  const isSelected = deck.id === selectedId;
                  const isCurrent = deck.id === currentDeck?.id;
                  return (
                    <button
                      key={deck.id}
                      type="button"
                      onClick={() => setSelectedId(deck.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        "focus-visible:outline-border-focus flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
                        isSelected
                          ? "bg-surface-1 text-content-primary font-semibold"
                          : "text-content-secondary hover:bg-surface-2 hover:text-content-primary"
                      )}
                    >
                      <span className="truncate">{deck.name}</span>
                      {isCurrent && (
                        <>
                          <span className="sr-only">Current deck</span>
                          <Check
                            className="text-gold-600 size-4 shrink-0"
                            aria-hidden="true"
                          />
                        </>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="border-border bg-surface-3 aspect-card relative w-16 shrink-0 overflow-hidden rounded-md border">
                {previewDeck?.leaderImageUrl ? (
                  <Image
                    src={previewDeck.leaderImageUrl}
                    alt={previewDeck.leaderName ?? previewDeck.name}
                    fill
                    sizes="64px"
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-content-tertiary flex h-full items-center justify-center">
                    <UserRound className="size-5" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-content-primary truncate text-base font-semibold">
                  {previewDeck?.name ?? "Select a deck"}
                </h3>
                <p className="text-content-tertiary mt-1 truncate font-mono text-xs">
                  {previewDeck?.leaderName ?? previewDeck?.leaderId ?? "—"}
                </p>
              </div>
            </div>

            {loading && (
              <div
                className="border-border bg-surface-3 flex min-h-0 flex-1 flex-col gap-2 rounded-md border p-3"
                role="status"
              >
                <span className="sr-only">
                  Loading {previewDeck?.name ?? "deck"} list
                </span>
                <Skeleton className="h-3 w-full" aria-hidden="true" />
                <Skeleton className="h-3 w-4/5" aria-hidden="true" />
                <Skeleton className="h-3 w-3/5" aria-hidden="true" />
              </div>
            )}

            {failed && (
              <div
                className="border-error/30 bg-error-soft flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-md border p-5 text-center"
                role="alert"
              >
                <p className="text-error text-sm">
                  Could not load this deck list.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={retry}
                >
                  Retry
                </Button>
              </div>
            )}

            {!loading && !failed && (
              <DeckContentsList
                contents={contents}
                emptyLabel="This deck has no cards yet"
                className="max-h-64 sm:max-h-none"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="gold"
            disabled={commitDisabled}
            onClick={() => {
              if (!selectedId) return;
              onConfirm(selectedId);
              onOpenChange(false);
            }}
          >
            Use this deck
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Deck contents for the preview pane. The seated deck arrives pre-grouped on
 * the lobby snapshot; every other deck is fetched once and memoised for the
 * lifetime of the modal so re-selecting a row is instant.
 */
function useDeckContents(
  deckId: string | null,
  seed: LobbyRoomDeckContents | undefined
) {
  const [cache, setCache] = useState<Record<string, LobbyRoomDeckContents>>({});
  const [failedId, setFailedId] = useState<string | null>(null);

  // A failure is scoped to the deck currently in the pane and is dropped as
  // soon as the selection moves (including to `null` when the modal closes),
  // so reopening the modal retries rather than replaying a stale error.
  const [lastDeckId, setLastDeckId] = useState(deckId);
  if (deckId !== lastDeckId) {
    setLastDeckId(deckId);
    setFailedId(null);
  }

  const cached = deckId ? cache[deckId] : undefined;
  const contents = seed ?? cached;
  const failed = Boolean(deckId) && failedId === deckId;

  useEffect(() => {
    if (!deckId || seed || cached || failed) return;

    let cancelled = false;

    apiGet(`/api/decks/${deckId}`, DeckDetailResponseSchema)
      .then((json) => {
        if (cancelled) return;
        // Only successes are cached. A transient failure must not poison the
        // deck for the lifetime of the (seat-lived, always-mounted) modal.
        setCache((current) => ({
          ...current,
          [deckId]: groupDeckDetail(json.data),
        }));
      })
      .catch(() => {
        if (!cancelled) setFailedId(deckId);
      });

    return () => {
      cancelled = true;
    };
    // `failed` flipping back to false is what re-arms the fetch on retry.
  }, [deckId, seed, cached, failed]);

  const retry = () => setFailedId(null);

  return {
    contents,
    failed,
    retry,
    loading: Boolean(deckId) && !contents && !failed,
  };
}

function emptyDeckContents(): LobbyRoomDeckContents {
  return { characters: [], events: [], stages: [] };
}

/** Mirrors `groupDeckCards` in `src/lib/lobbies/build-state.ts`. */
function groupDeckDetail(
  deck: DeckDetailResponse["data"]
): LobbyRoomDeckContents {
  const contents = emptyDeckContents();

  for (const entry of deck.cards) {
    const card = {
      id: entry.cardId,
      name: entry.card.name,
      quantity: entry.quantity,
      imageUrl: entry.selectedArtUrl ?? entry.card.imageUrl,
    };
    if (entry.card.type === "Character") contents.characters.push(card);
    if (entry.card.type === "Event") contents.events.push(card);
    if (entry.card.type === "Stage") contents.stages.push(card);
  }

  return contents;
}
