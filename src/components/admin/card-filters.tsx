"use client";

import { cn } from "@/lib/utils";
import { SetFilter } from "./set-filter";

const COLORS = ["Red", "Blue", "Green", "Purple", "Black", "Yellow"];
const TYPES = ["Leader", "Character", "Event", "Stage"];
const BLOCKS = [1, 2, 3, 4];

// CSS variable tokens for tcg colors — dynamic and can't be expressed with static Tailwind
const COLOR_ACTIVE: Record<string, { bg: string; text: string; border: string }> = {
  Red:    { bg: "var(--card-red)",    text: "var(--text-inverse)", border: "var(--card-red)" },
  Blue:   { bg: "var(--card-blue)",   text: "var(--text-inverse)", border: "var(--card-blue)" },
  Green:  { bg: "var(--card-green)",  text: "var(--text-inverse)", border: "var(--card-green)" },
  Purple: { bg: "var(--card-purple)", text: "var(--text-inverse)", border: "var(--card-purple)" },
  Black:  { bg: "var(--card-black)",  text: "var(--text-inverse)", border: "var(--card-black)" },
  Yellow: { bg: "var(--card-yellow)", text: "var(--text-primary)", border: "var(--card-yellow)" },
};

interface CardFiltersProps {
  sets: { setLabel: string; setName: string; packId: string }[];
  currentFilters: {
    q: string;
    color: string;
    type: string;
    set: string;
    block: string;
    originOnly: string;
  };
  onFilterChange: (updates: Record<string, string>) => void;
}

export function CardFilters({
  sets,
  currentFilters,
  onFilterChange,
}: CardFiltersProps) {
  const activeColors = currentFilters.color
    ? currentFilters.color.split(",")
    : [];
  const activeTypes = currentFilters.type
    ? currentFilters.type.split(",")
    : [];
  const activeBlocks = currentFilters.block
    ? currentFilters.block.split(",").map(Number)
    : [];
  const originOnly = currentFilters.originOnly === "true";

  function toggleFilter(
    filterKey: string,
    value: string,
    activeValues: string[],
  ) {
    const newValues = activeValues.includes(value)
      ? activeValues.filter((v) => v !== value)
      : [...activeValues, value];
    onFilterChange({ [filterKey]: newValues.join(",") });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-1 p-4">
      {/* Colors */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-content-tertiary">
          Color
        </label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => {
            const active = activeColors.includes(c);
            const colorStyle = COLOR_ACTIVE[c];
            return (
              <button
                key={c}
                onClick={() => toggleFilter("color", c, activeColors)}
                className={cn(
                  "rounded border px-3 py-1 text-xs font-medium transition-all",
                  !active && "border-border bg-surface-2 text-content-tertiary hover:bg-surface-3",
                )}
                style={
                  active
                    ? {
                        background: colorStyle.bg,
                        color: colorStyle.text,
                        borderColor: colorStyle.border,
                      }
                    : undefined
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Types */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-content-tertiary">
          Type
        </label>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => {
            const active = activeTypes.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleFilter("type", t, activeTypes)}
                className={cn(
                  "rounded border px-3 py-1 text-xs font-medium transition-all",
                  active
                    ? "border-navy-900 bg-navy-900 text-content-inverse"
                    : "border-border bg-surface-2 text-content-tertiary hover:bg-surface-3",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Set + Block + Reprint filter row */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Set multi-select */}
        <div className="min-w-[240px] flex-1">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-content-tertiary">
            Set
          </label>
          <SetFilter
            sets={sets}
            selectedSets={currentFilters.set ? currentFilters.set.split(",") : []}
            onChange={(labels) => onFilterChange({ set: labels.join(",") })}
          />
        </div>

        {/* Block */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-content-tertiary">
            Block
          </label>
          <div className="flex gap-2">
            {BLOCKS.map((b) => {
              const active = activeBlocks.includes(b);
              return (
                <button
                  key={b}
                  onClick={() =>
                    toggleFilter("block", String(b), activeBlocks.map(String))
                  }
                  className={cn(
                    "rounded border px-3 py-1 text-xs font-medium transition-all",
                    active
                      ? "border-navy-900 bg-navy-900 text-content-inverse"
                      : "border-border bg-surface-2 text-content-tertiary hover:bg-surface-3",
                  )}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </div>

        {/* Reprint filter toggle */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-content-tertiary">
            Reprints
          </label>
          <button
            onClick={() =>
              onFilterChange({ originOnly: originOnly ? "" : "true" })
            }
            className={cn(
              "flex items-center gap-2 rounded border px-3 py-1 text-xs font-medium transition-all",
              originOnly
                ? "border-navy-900 bg-navy-100 text-navy-900"
                : "border-border bg-surface-2 text-content-tertiary hover:bg-surface-3",
            )}
          >
            <span
              className={cn(
                "inline-block h-3 w-3 rounded-sm border transition-colors",
                originOnly
                  ? "border-navy-900 bg-navy-900"
                  : "border-content-tertiary bg-transparent",
              )}
            />
            Origin only
          </button>
        </div>
      </div>
    </div>
  );
}
