"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COLORS } from "@/lib/cards/colors-ui";
import { cn } from "@/lib/utils";

export const DECK_FILTERS_DIALOG_ID = "deck-filters";

const COLOR_VARIANTS = {
  Red: "card-red",
  Blue: "card-blue",
  Green: "card-green",
  Purple: "card-purple",
  Black: "card-black",
  Yellow: "card-yellow",
} as const;

const COLOR_SWATCH_CLASSES = {
  Red: "border-transparent bg-card-red",
  Blue: "border-transparent bg-card-blue",
  Green: "border-transparent bg-card-green",
  Purple: "border-transparent bg-card-purple",
  Black: "border-transparent bg-card-black",
  Yellow: "border-transparent bg-card-yellow",
} as const;

interface DeckFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedColors: string[];
  onApply: (colors: string[]) => void;
}

export function DeckFiltersDialog({
  open,
  onOpenChange,
  selectedColors,
  onApply,
}: DeckFiltersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id={DECK_FILTERS_DIALOG_ID} size="sm">
        {open && (
          <DeckFiltersForm
            selectedColors={selectedColors}
            onApply={onApply}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeckFiltersForm({
  selectedColors,
  onApply,
  onCancel,
}: Pick<DeckFiltersDialogProps, "selectedColors" | "onApply"> & {
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(selectedColors);

  const toggleColor = (color: string) => {
    setDraft((current) =>
      current.includes(color)
        ? current.filter((selected) => selected !== color)
        : [...current, color]
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Filter Decks</DialogTitle>
        <DialogDescription>
          {draft.length === 0
            ? "Nothing selected — every deck is in view."
            : `${draft.length} filter${draft.length === 1 ? "" : "s"} selected. Nothing changes until you apply.`}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-3 py-2">
        <h3 className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
          Color
        </h3>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((color) => {
            const pressed = draft.includes(color);
            return (
              <Badge
                key={color}
                asChild
                variant={pressed ? COLOR_VARIANTS[color] : "outline"}
              >
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => toggleColor(color)}
                  className="focus-visible:outline-border-focus inline-flex cursor-pointer items-center gap-2 px-3 py-1 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  {pressed ? (
                    <Check className="size-3 shrink-0" aria-hidden />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        "size-3 shrink-0 rounded border",
                        COLOR_SWATCH_CLASSES[color]
                      )}
                    />
                  )}
                  {color}
                </button>
              </Badge>
            );
          })}
        </div>
      </DialogBody>

      <DialogFooter className="border-border items-center justify-between border-t">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDraft([])}
          disabled={draft.length === 0}
        >
          Clear all
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="gold" onClick={() => onApply(draft)}>
            Apply Filters
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
