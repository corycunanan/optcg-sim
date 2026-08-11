"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { COLORS, COLOR_BG } from "@/lib/cards/colors-ui";
import { cn } from "@/lib/utils";

import { DeckList, type DeckListItem } from "./deck-list";

export function DeckListFilter({ decks }: { decks: DeckListItem[] }) {
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

  const toggleColor = (color: string) => {
    setSelectedColors((current) =>
      current.includes(color)
        ? current.filter((selected) => selected !== color)
        : [...current, color]
    );
  };

  const filteredDecks =
    selectedColors.length === 0
      ? decks
      : decks.filter((deck) =>
          deck.colors.some((color) => selectedColors.includes(color))
        );

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1">
        {COLORS.map((color) => {
          const active = selectedColors.includes(color);
          return (
            <button
              key={color}
              type="button"
              aria-pressed={active}
              onClick={() => toggleColor(color)}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-all",
                active
                  ? color === "Yellow"
                    ? "text-navy-900"
                    : "text-content-inverse"
                  : "border-border bg-secondary text-content-tertiary hover:border-border-strong border"
              )}
              style={active ? { background: COLOR_BG[color] } : undefined}
            >
              {color}
            </button>
          );
        })}
      </div>

      {filteredDecks.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-content-tertiary text-sm">
            No decks match
          </p>
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
    </>
  );
}
