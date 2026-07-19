export const ALL_CARD_SETS_FILTER = "all";

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
