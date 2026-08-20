"use client";

import { useState } from "react";

import { ColorChipToggle } from "@/components/cards/color-chip";
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

export const DECK_FILTERS_DIALOG_ID = "deck-filters";

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
      <DialogContent
        id={DECK_FILTERS_DIALOG_ID}
        size="sm"
      >
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
        <h3 className="text-content-tertiary text-sm font-semibold tracking-widest uppercase">
          Color
        </h3>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((color) => (
            <ColorChipToggle
              key={color}
              color={color}
              pressed={draft.includes(color)}
              onPressedChange={() => toggleColor(color)}
            />
          ))}
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
          <Button
            type="button"
            variant="gold"
            elevation="flat"
            onClick={() => onApply(draft)}
          >
            Apply Filters
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
