"use client";

const COLORS = ["Red", "Blue", "Green", "Purple", "Black", "Yellow"];
const TYPES = ["Leader", "Character", "Event", "Stage"];
const BLOCKS = [1, 2, 3, 4];

const COLOR_ACTIVE: Record<string, { bg: string; text: string; border: string }> = {
  Red:    { bg: "var(--card-red)",    text: "#fff", border: "var(--card-red)" },
  Blue:   { bg: "var(--card-blue)",   text: "#fff", border: "var(--card-blue)" },
  Green:  { bg: "var(--card-green)",  text: "#fff", border: "var(--card-green)" },
  Purple: { bg: "var(--card-purple)", text: "#fff", border: "var(--card-purple)" },
  Black:  { bg: "var(--card-black)",  text: "#ddd", border: "var(--card-black)" },
  Yellow: { bg: "var(--card-yellow)", text: "#222", border: "var(--card-yellow)" },
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
    <div
      className="space-y-4 rounded-xl p-4"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* Colors */}
      <div>
        <label
          className="mb-2 block text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-tertiary)" }}
        >
          Color
        </label>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => {
            const active = activeColors.includes(c);
            const colorStyle = COLOR_ACTIVE[c];
            return (
              <button
                key={c}
                onClick={() => toggleFilter("color", c, activeColors)}
                className="rounded-md px-3 py-1 text-xs font-medium transition-all"
                style={
                  active
                    ? {
                        background: colorStyle.bg,
                        color: colorStyle.text,
                        border: `1px solid ${colorStyle.border}`,
                      }
                    : {
                        background: "var(--surface-2)",
                        color: "var(--text-tertiary)",
                        border: "1px solid var(--border)",
                      }
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
        <label
          className="mb-2 block text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-tertiary)" }}
        >
          Type
        </label>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => {
            const active = activeTypes.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleFilter("type", t, activeTypes)}
                className="rounded-md px-3 py-1 text-xs font-medium transition-all"
                style={
                  active
                    ? {
                        background: "var(--teal)",
                        color: "var(--surface-0)",
                        border: "1px solid var(--teal)",
                      }
                    : {
                        background: "var(--surface-2)",
                        color: "var(--text-tertiary)",
                        border: "1px solid var(--border)",
                      }
                }
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Set + Block + Reprint filter row */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Set dropdown */}
        <div className="min-w-[200px] flex-1">
          <label
            className="mb-2 block text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-tertiary)" }}
          >
            Set
          </label>
          <select
            value={currentFilters.set}
            onChange={(e) => onFilterChange({ set: e.target.value })}
            className="w-full rounded-md px-3 py-1.5 text-sm focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          >
            <option value="">All Sets</option>
            {sets.map((s) => (
              <option key={s.packId} value={s.setLabel}>
                {s.setLabel} — {s.setName}
              </option>
            ))}
          </select>
        </div>

        {/* Block */}
        <div>
          <label
            className="mb-2 block text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-tertiary)" }}
          >
            Block
          </label>
          <div className="flex gap-1.5">
            {BLOCKS.map((b) => {
              const active = activeBlocks.includes(b);
              return (
                <button
                  key={b}
                  onClick={() =>
                    toggleFilter("block", String(b), activeBlocks.map(String))
                  }
                  className="rounded-md px-3 py-1 text-xs font-medium transition-all"
                  style={
                    active
                      ? {
                          background: "var(--sage)",
                          color: "var(--surface-0)",
                          border: "1px solid var(--sage)",
                        }
                      : {
                          background: "var(--surface-2)",
                          color: "var(--text-tertiary)",
                          border: "1px solid var(--border)",
                        }
                  }
                >
                  {b}
                </button>
              );
            })}
          </div>
        </div>

        {/* Reprint filter toggle */}
        <div>
          <label
            className="mb-2 block text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-tertiary)" }}
          >
            Reprints
          </label>
          <button
            onClick={() =>
              onFilterChange({ originOnly: originOnly ? "" : "true" })
            }
            className="flex items-center gap-2 rounded-md px-3 py-1 text-xs font-medium transition-all"
            style={
              originOnly
                ? {
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    border: "1px solid var(--accent)",
                  }
                : {
                    background: "var(--surface-2)",
                    color: "var(--text-tertiary)",
                    border: "1px solid var(--border)",
                  }
            }
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm transition-colors"
              style={{
                background: originOnly ? "var(--accent)" : "transparent",
                border: originOnly
                  ? "1.5px solid var(--accent)"
                  : "1.5px solid var(--text-tertiary)",
              }}
            />
            Origin only
          </button>
        </div>
      </div>
    </div>
  );
}
