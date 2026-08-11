export const ALL_CARD_SETS_FILTER = "all";

/** Query-shaped filter state as it arrives from the server. */
export interface CardBrowserFilters {
  q: string;
  color: string;
  type: string;
  set: string;
  block: string;
  originOnly: string;
}

/**
 * The single draft the filter dialog edits. Every filter surface — colors,
 * types, blocks, sets, printings — lives here so one "Apply" commits one
 * navigation.
 */
export interface CardFilterDraft {
  colors: string[];
  types: string[];
  blocks: string[];
  sets: string[];
  originOnly: boolean;
}

function splitFilterValue(value: string): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

export function parseCardFilterDraft(
  filters: CardBrowserFilters
): CardFilterDraft {
  return {
    colors: splitFilterValue(filters.color),
    types: splitFilterValue(filters.type),
    blocks: splitFilterValue(filters.block),
    sets: splitFilterValue(filters.set),
    originOnly: filters.originOnly === "true",
  };
}

/**
 * Query updates for a draft. `set` leads so the committed URL keeps the
 * set-first ordering the browser has always produced, and an empty set
 * selection becomes the explicit "all sets" view rather than falling back to
 * the implicit latest booster.
 */
export function serializeCardFilterDraft(
  draft: CardFilterDraft
): Record<string, string> {
  return {
    set: draft.sets.length > 0 ? draft.sets.join(",") : ALL_CARD_SETS_FILTER,
    color: draft.colors.join(","),
    type: draft.types.join(","),
    block: draft.blocks.join(","),
    originOnly: draft.originOnly ? "true" : "",
  };
}

/**
 * How many filter values a draft holds. Sets count like every other value,
 * including the latest booster a fresh `/cards` visit defaults to: with the
 * filters behind a dialog, this count is the only on-page signal that the
 * results are narrowed at all, so it reports every narrowing in force.
 */
export function countCardFilterDraft(draft: CardFilterDraft): number {
  return (
    draft.colors.length +
    draft.types.length +
    draft.blocks.length +
    draft.sets.length +
    (draft.originOnly ? 1 : 0)
  );
}

export function areCardFilterDraftsEqual(
  a: CardFilterDraft,
  b: CardFilterDraft
): boolean {
  const left = serializeCardFilterDraft(a);
  const right = serializeCardFilterDraft(b);
  return Object.keys(left).every((key) => left[key] === right[key]);
}

export function parseCardBrowserPage(value: string): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

export function clampCardBrowserPage(
  requestedPage: number,
  total: number,
  limit: number
) {
  const totalPages = Math.ceil(total / limit);
  return {
    page: Math.min(requestedPage, Math.max(totalPages, 1)),
    totalPages,
  };
}
