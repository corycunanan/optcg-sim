"use client";

const COLORS = ["Red", "Blue", "Green", "Purple", "Black", "Yellow"];
const TYPES = ["Leader", "Character", "Event", "Stage"];
const BLOCKS = [1, 2, 3, 4];

const COLOR_STYLES: Record<string, string> = {
  Red: "bg-red-100 text-red-800 border-red-300",
  Blue: "bg-blue-100 text-blue-800 border-blue-300",
  Green: "bg-green-100 text-green-800 border-green-300",
  Purple: "bg-purple-100 text-purple-800 border-purple-300",
  Black: "bg-gray-200 text-gray-800 border-gray-400",
  Yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
};

interface CardFiltersProps {
  sets: { setLabel: string; setName: string; packId: string }[];
  currentFilters: {
    q: string;
    color: string;
    type: string;
    set: string;
    block: string;
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

  function toggleFilter(
    filterKey: string,
    value: string,
    activeValues: string[]
  ) {
    const newValues = activeValues.includes(value)
      ? activeValues.filter((v) => v !== value)
      : [...activeValues, value];
    onFilterChange({ [filterKey]: newValues.join(",") });
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      {/* Colors */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
          Color
        </label>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => toggleFilter("color", c, activeColors)}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                activeColors.includes(c)
                  ? COLOR_STYLES[c]
                  : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Types */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
          Type
        </label>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => toggleFilter("type", t, activeTypes)}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                activeTypes.includes(t)
                  ? "border-indigo-300 bg-indigo-100 text-indigo-800"
                  : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Set + Block row */}
      <div className="flex flex-wrap gap-4">
        {/* Set dropdown */}
        <div className="min-w-[200px] flex-1">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Set
          </label>
          <select
            value={currentFilters.set}
            onChange={(e) => onFilterChange({ set: e.target.value })}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none"
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
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Block
          </label>
          <div className="flex gap-1.5">
            {BLOCKS.map((b) => (
              <button
                key={b}
                onClick={() =>
                  toggleFilter("block", String(b), activeBlocks.map(String))
                }
                className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                  activeBlocks.includes(b)
                    ? "border-amber-300 bg-amber-100 text-amber-800"
                    : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
