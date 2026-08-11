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
import { SetFilter } from "./set-filter";

export const CARD_FILTERS_DIALOG_ID = "card-filters";

/**
 * Selected chip fills for the six TCG colors. The card palette is a
 * non-themable feature contract and is exempt from the chroma reservation, so a
 * selected color chip becomes the color it filters by — the same solid fills
 * the `card-*` Badge variants ship.
 */
const COLORS: {
  value: string;
  selectedClassName: string;
  swatchClassName: string;
}[] = [
  {
    value: "Red",
    selectedClassName: "border-card-red bg-card-red text-content-inverse",
    swatchClassName: "border-transparent bg-card-red",
  },
  {
    value: "Blue",
    selectedClassName: "border-card-blue bg-card-blue text-content-inverse",
    swatchClassName: "border-transparent bg-card-blue",
  },
  {
    value: "Green",
    selectedClassName: "border-card-green bg-card-green text-content-inverse",
    swatchClassName: "border-transparent bg-card-green",
  },
  {
    value: "Purple",
    selectedClassName: "border-card-purple bg-card-purple text-content-inverse",
    swatchClassName: "border-transparent bg-card-purple",
  },
  {
    value: "Black",
    selectedClassName: "border-card-black bg-card-black text-content-inverse",
    swatchClassName: "border-transparent bg-card-black",
  },
  {
    value: "Yellow",
    selectedClassName:
      "border-card-yellow bg-card-yellow text-card-yellow-fg",
    swatchClassName: "border-transparent bg-card-yellow",
  },
];

const TYPES = ["Leader", "Character", "Event", "Stage"];
const BLOCKS = ["1", "2", "3", "4"];

const SECTION_LABEL =
  "text-content-tertiary text-xs font-semibold tracking-widest uppercase";

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
              <FilterChip
                key={color.value}
                label={color.value}
                pressed={draft.colors.includes(color.value)}
                onPressedChange={() => toggleValue("colors", color.value)}
                selectedClassName={color.selectedClassName}
                swatchClassName={color.swatchClassName}
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
              <span className="text-content-tertiary text-xs">
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
          <p className="text-content-tertiary max-w-prose text-xs">
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
          <Button type="button" variant="gold" onClick={() => onApply(draft)}>
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
 * Toggle chip. The leading 12px slot is constant across states — an outline box
 * or a color swatch when unselected, a check when selected — so selection never
 * reflows the row and never rests on color alone.
 */
function FilterChip({
  label,
  pressed,
  onPressedChange,
  selectedClassName,
  swatchClassName,
}: {
  label: string;
  pressed: boolean;
  onPressedChange: () => void;
  selectedClassName?: string;
  swatchClassName?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPressedChange}
      className={cn(
        "focus-visible:outline-border-focus inline-flex cursor-pointer items-center gap-2 rounded border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
        pressed
          ? (selectedClassName ??
              "border-border-strong bg-accent-soft text-content-primary")
          : "border-border bg-surface-2 text-content-secondary hover:border-border-strong hover:text-content-primary"
      )}
    >
      {pressed ? (
        <Check className="size-3 shrink-0" aria-hidden />
      ) : (
        <span
          aria-hidden
          className={cn(
            "size-3 shrink-0 rounded border",
            swatchClassName ?? "border-border-strong"
          )}
        />
      )}
      {label}
    </button>
  );
}
