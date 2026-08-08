"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import { DeckDetailResponseSchema } from "@/lib/validators/cards";
import type { LobbyRoomDeck } from "@/lib/lobbies/state";
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
import {
  DeckCardGrid,
  deckCardTotal,
  groupDeckCards,
  type DeckCardGroup,
} from "./deck-card-grid";

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
  const { groups, loading, failed, retry } = useDeckGroups(
    open ? selectedId : null
  );

  const previewDeck =
    selectedDeck ?? (selectedId === currentDeck?.id ? currentDeck : null);
  const commitDisabled = !selectedId || selectedId === currentDeck?.id;
  const previewLeader = previewDeck?.leaderName ?? previewDeck?.leaderId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        // The grid owns the only scroll region; the dialog frame stays fixed
        // so the rail and the commit buttons never scroll away. `overflow-y-
        // hidden` overrides the primitive's default `overflow-y-auto`.
        className="flex max-h-[80vh] flex-col gap-5 overflow-y-hidden sm:max-w-6xl"
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
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-content-primary min-w-0 truncate text-base font-semibold">
                {previewDeck?.name ?? "Select a deck"}
                {previewLeader && (
                  <span className="text-content-tertiary font-normal">
                    {" "}
                    &middot; {previewLeader}
                  </span>
                )}
              </h3>
              {groups.length > 0 && (
                <span className="text-content-tertiary shrink-0 text-xs tabular-nums">
                  {deckCardTotal(groups)} cards
                </span>
              )}
            </div>

            {loading && (
              <div
                className="border-border bg-surface-3 flex min-h-0 flex-1 flex-wrap content-start gap-4 rounded-md border p-4"
                role="status"
              >
                <span className="sr-only">
                  Loading {previewDeck?.name ?? "deck"} list
                </span>
                {Array.from({ length: 8 }, (_, index) => (
                  <Skeleton
                    key={index}
                    className="w-card-thumb aspect-card rounded"
                    aria-hidden="true"
                  />
                ))}
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

            {!loading &&
              !failed &&
              (groups.length > 0 ? (
                <div className="border-border bg-surface-3 min-h-0 flex-1 overflow-y-auto rounded-md border p-4">
                  <DeckCardGrid groups={groups} showCounts />
                </div>
              ) : (
                <div className="border-border bg-surface-3 text-content-tertiary flex min-h-0 flex-1 items-center justify-center rounded-md border p-5 text-center text-xs">
                  This deck has no cards yet
                </div>
              ))}
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

const NO_GROUPS: DeckCardGroup[] = [];

/**
 * Art groups for the preview pane. Every deck — including the seated one — is
 * fetched once and memoised for the lifetime of the modal, so re-selecting a
 * rail row is instant.
 *
 * The lobby snapshot's pre-grouped `contents` is deliberately not used as a
 * seed any more: it carries only name/quantity/art and no card type, cost,
 * power, or effect text, so it cannot feed the grid's hover tooltips or place
 * the leader in the grid. Seeding it would have made the seated deck the one
 * deck that renders a degraded pane.
 */
function useDeckGroups(deckId: string | null) {
  const [cache, setCache] = useState<Record<string, DeckCardGroup[]>>({});
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
  const failed = Boolean(deckId) && failedId === deckId;

  useEffect(() => {
    if (!deckId || cached || failed) return;

    let cancelled = false;

    apiGet(`/api/decks/${deckId}`, DeckDetailResponseSchema)
      .then((json) => {
        if (cancelled) return;
        // Only successes are cached. A transient failure must not poison the
        // deck for the lifetime of the (seat-lived, always-mounted) modal.
        setCache((current) => ({
          ...current,
          [deckId]: groupDeckCards(json.data),
        }));
      })
      .catch(() => {
        if (!cancelled) setFailedId(deckId);
      });

    return () => {
      cancelled = true;
    };
    // `failed` flipping back to false is what re-arms the fetch on retry.
  }, [deckId, cached, failed]);

  const retry = () => setFailedId(null);

  return {
    groups: cached ?? NO_GROUPS,
    failed,
    retry,
    loading: Boolean(deckId) && !cached && !failed,
  };
}
