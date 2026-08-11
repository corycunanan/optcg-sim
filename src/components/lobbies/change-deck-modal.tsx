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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="2xl"
        // The grid owns the only scroll region; the dialog frame stays fixed
        // so the rail and the commit buttons never scroll away. `overflow-y-
        // hidden` overrides the primitive's default `overflow-y-auto`.
        className="flex max-h-[80vh] flex-col gap-5 overflow-y-hidden"
        data-change-deck-modal
      >
        <DialogHeader>
          {/* Shared DialogTitle default — matches every other modal title. */}
          <DialogTitle>Change deck</DialogTitle>
          <DialogDescription>
            Preview any of your decks, then confirm to take it into the match.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          {/*
            No visible eyebrow — `aria-label` is what names the rail now.
            Square corners per the shape semantics: rounded rectangles are
            reserved for cards, and a dense row list is the quiet end of
            angular.

            No fill and no border either — the rail sits directly on the modal
            surface and the selected row's lighter tint is the only
            delimitation it needs. Chrome recedes; the art is the figure.
          */}
          <div
            className="max-h-48 min-h-0 overflow-y-auto p-1 sm:max-h-none"
            role="group"
            aria-label="Your decks"
          >
            {decks.length === 0 ? (
              <p className="text-content-tertiary px-3 py-2 text-sm">
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
                      "focus-visible:outline-border-focus flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
                      // Rest sits on the bare modal surface (27%), hover
                      // lifts to surface-2 (32%), selection lands on
                      // surface-3 (37%) — one direction, lighter with
                      // engagement. Each text/background pairing is already
                      // in the contrast manifest.
                      isSelected
                        ? "bg-surface-3 text-content-primary font-semibold"
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

          {/*
            The art sits directly on the modal surface — no panel. This column
            is still the only scroll region, so the rail and the commit buttons
            never scroll away. `p-2` keeps the hover lift and the focus ring
            off the clipping edge.
          */}
          <div className="flex min-h-0 flex-col">
            {loading && (
              <div
                className="flex min-h-0 flex-1 flex-wrap content-start gap-4 p-2"
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
                className="border-error/30 bg-error-soft flex min-h-0 flex-1 flex-col items-center justify-center gap-3 border p-5 text-center"
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
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  <DeckCardGrid groups={groups} showCounts />
                </div>
              ) : (
                <div className="text-content-tertiary flex min-h-0 flex-1 items-center justify-center p-5 text-center text-sm">
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
