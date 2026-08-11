"use client";

import Link from "next/link";
import { useState } from "react";
import { Filter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";

import {
  DeckFiltersDialog,
  DECK_FILTERS_DIALOG_ID,
} from "./deck-filters-dialog";
import { DeckList, type DeckListItem } from "./deck-list";

export function DeckListFilter({ decks }: { decks: DeckListItem[] }) {
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filteredDecks =
    selectedColors.length === 0
      ? decks
      : decks.filter((deck) =>
          deck.colors.some((color) => selectedColors.includes(color))
        );

  return (
    <>
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>My Decks</PageHeaderTitle>
          <PageHeaderDescription>
            Build and manage your OPTCG decks.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            aria-controls={DECK_FILTERS_DIALOG_ID}
            aria-label={
              selectedColors.length > 0
                ? `Filter — ${selectedColors.length} applied`
                : undefined
            }
          >
            <Filter data-icon="inline-start" />
            Filter
            {selectedColors.length > 0 && (
              <Badge aria-hidden>{selectedColors.length}</Badge>
            )}
          </Button>
          <Button asChild>
            <Link href="/decks/new">+ New Deck</Link>
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        {decks.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-content-tertiary text-sm">No decks yet</p>
            <p className="text-content-tertiary mt-1 text-sm">
              Create your first deck to get started
            </p>
            <Link
              href="/decks/new"
              className="bg-primary text-primary-foreground hover:bg-gold-400 mt-6 inline-block rounded px-6 py-2 text-sm font-semibold transition-colors"
            >
              + New Deck
            </Link>
          </div>
        ) : filteredDecks.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-content-tertiary text-sm">No decks match</p>
            <Button
              type="button"
              className="mt-6"
              onClick={() => setSelectedColors([])}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <DeckList decks={filteredDecks} />
        )}
      </div>

      <DeckFiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        selectedColors={selectedColors}
        onApply={(colors) => {
          setSelectedColors(colors);
          setFiltersOpen(false);
        }}
      />
    </>
  );
}
