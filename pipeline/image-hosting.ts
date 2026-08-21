export function normalizeCdnUrl(raw: string | undefined): string | null {
  const normalized = raw?.trim().replace(/\/+$/, "");
  return normalized || null;
}

export interface ImageRow {
  id: string;
  imageUrl: string;
}

export function findOffCdnImages(rows: ImageRow[], cdnUrl: string): ImageRow[] {
  const objectPrefix = `${cdnUrl}/`;
  return rows.filter(
    (row) =>
      !row.imageUrl.startsWith(objectPrefix) ||
      row.imageUrl.length === objectPrefix.length
  );
}

export interface OffCdnSummary {
  cards: ImageRow[];
  variants: ImageRow[];
  total: number;
}

export function summarizeOffCdn(
  cards: ImageRow[],
  variants: ImageRow[],
  cdnUrl: string
): OffCdnSummary {
  const offCdnCards = findOffCdnImages(cards, cdnUrl);
  const offCdnVariants = findOffCdnImages(variants, cdnUrl);

  return {
    cards: offCdnCards,
    variants: offCdnVariants,
    total: offCdnCards.length + offCdnVariants.length,
  };
}

export function exitCodeFor(summary: OffCdnSummary | null): 0 | 1 {
  return summary && summary.total === 0 ? 0 : 1;
}
