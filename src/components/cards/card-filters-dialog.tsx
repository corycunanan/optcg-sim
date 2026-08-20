"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
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
import {
  countCardFilterDraft,
  parseCardFilterDraft,
  type CardBrowserFilters,
  type CardFilterDraft,
} from "@/lib/cards/browser-params";
import { COLORS } from "@/lib/cards/colors-ui";
import {
  CHIP_TOGGLE_CLASS,
  CHIP_TOGGLE_UNSELECTED_CLASS,
  ColorChipToggle,
} from "./color-chip";
import { SetFilter } from "./set-filter";

export const CARD_FILTERS_DIALOG_ID = "card-filters";

const TYPES = ["Leader", "Character", "Event", "Stage"];
const BLOCKS = ["1", "2", "3", "4"];

const SECTION_LABEL =
  "text-content-tertiary text-sm font-semibold tracking-widest uppercase";

interface CardFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sets: { setLabel: string; setName: string; packId: string }[];
  filters: CardBrowserFilters;
  onApply: (draft: CardFilterDraft) => void;
}

export function CardFiltersDialog({
  open,
  onOpenChange,
  sets,
  filters,
  onApply,
}: CardFiltersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id={CARD_FILTERS_DIALOG_ID}
        size="lg"
        className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-y-hidden"
      >
        {/* Mounted only while open, so every visit starts from a clean draft. */}
        <CardFiltersForm
          sets={sets}
          filters={filters}
          onApply={onApply}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CardFiltersForm({
  sets,
  filters,
  onApply,
  onCancel,
}: Omit<CardFiltersDialogProps, "open" | "onOpenChange"> & {
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CardFilterDraft>(() =>
    parseCardFilterDraft(filters)
  );

  const draftCount = countCardFilterDraft(draft);

  const toggleValue = (key: "colors" | "types" | "blocks", value: string) => {
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }));
  };

  const clearAll = () =>
    setDraft({
      colors: [],
      types: [],
      blocks: [],
      sets: [],
      originOnly: false,
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Filter Cards</DialogTitle>
        <DialogDescription>
          {draftCount === 0
            ? "Nothing selected — the whole database is in view."
            : `${draftCount} filter${draftCount === 1 ? "" : "s"} selected. Nothing changes until you apply.`}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-6 py-2">
        <FilterSection label="Color">
          <ChipRow>
            {COLORS.map((color) => (
              <ColorChipToggle
                key={color}
                color={color}
                pressed={draft.colors.includes(color)}
                onPressedChange={() => toggleValue("colors", color)}
              />
            ))}
          </ChipRow>
        </FilterSection>

        <div className="grid gap-6 sm:grid-cols-2">
          <FilterSection label="Card Type">
            <ChipRow>
              {TYPES.map((type) => (
                <FilterChip
                  key={type}
                  label={type}
                  pressed={draft.types.includes(type)}
                  onPressedChange={() => toggleValue("types", type)}
                />
              ))}
            </ChipRow>
          </FilterSection>

          <FilterSection label="Block">
            <ChipRow>
              {BLOCKS.map((block) => (
                <FilterChip
                  key={block}
                  label={block}
                  pressed={draft.blocks.includes(block)}
                  onPressedChange={() => toggleValue("blocks", block)}
                />
              ))}
            </ChipRow>
          </FilterSection>
        </div>

        <FilterSection
          label="Set"
          action={
            <div className="flex items-center gap-3">
              <span className="text-content-tertiary text-sm">
                {draft.sets.length === 0
                  ? "All sets"
                  : `${draft.sets.length} selected`}
              </span>
              {draft.sets.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft((prev) => ({ ...prev, sets: [] }))}
                >
                  Clear sets
                </Button>
              )}
            </div>
          }
        >
          <SetFilter
            sets={sets}
            selectedSets={draft.sets}
            onChange={(nextSets) =>
              setDraft((prev) => ({ ...prev, sets: nextSets }))
            }
          />
        </FilterSection>

        <FilterSection label="Printings">
          <ChipRow>
            <FilterChip
              label="Origin printings only"
              pressed={draft.originOnly}
              onPressedChange={() =>
                setDraft((prev) => ({ ...prev, originOnly: !prev.originOnly }))
              }
            />
          </ChipRow>
          <p className="text-content-tertiary max-w-prose text-sm">
            Match a card only in the set it debuted in, hiding the reprints that
            carry it into later sets.
          </p>
        </FilterSection>
      </DialogBody>

      <DialogFooter className="border-border items-center justify-between border-t">
        <Button
          type="button"
          variant="ghost"
          onClick={clearAll}
          disabled={draftCount === 0}
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

function FilterSection({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-3">
      <div className="flex min-h-5 items-center justify-between gap-4">
        <h3 className={SECTION_LABEL}>{label}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/**
 * Toggle chip for the plain-value sections. It shares the canonical chip shell
 * with `ColorChipToggle`: the leading 12px slot is constant across states — an
 * outline box when unselected, a check when selected — so selection never
 * reflows the row and never rests on color alone.
 */
function FilterChip({
  label,
  pressed,
  onPressedChange,
}: {
  label: string;
  pressed: boolean;
  onPressedChange: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPressedChange}
      className={cn(
        CHIP_TOGGLE_CLASS,
        pressed
          ? "border-border-strong bg-accent-soft text-content-primary"
          : CHIP_TOGGLE_UNSELECTED_CLASS
      )}
    >
      {pressed ? (
        <Check className="size-3 shrink-0" aria-hidden />
      ) : (
        <span
          aria-hidden
          className="border-border-strong size-3 shrink-0 rounded border"
        />
      )}
      {label}
    </button>
  );
}
