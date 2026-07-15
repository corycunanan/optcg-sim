/**
 * Pure card identifier and text parsing utilities shared by the app and data
 * pipeline. Keep this module runtime-neutral.
 */

/** Decode the HTML entities used in vegapull card text. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&apos;/g, "'");
}

/** Strip the variant suffix from a vegapull card ID. */
export function stripVariantSuffix(vegapullId: string): string {
  return vegapullId.replace(/_[pr]\d+$/, "");
}

/** Determine the variant represented by a vegapull card ID. */
export function detectVariantType(
  vegapullId: string
): "base" | "parallel" | "reprint" {
  if (/_p\d+$/.test(vegapullId)) return "parallel";
  if (/_r\d+$/.test(vegapullId)) return "reprint";
  return "base";
}

/**
 * Parse a card ID prefix into an origin set label.
 * e.g. "OP01-001" → "OP-01", "ST01-001" → "ST-01", "EB01-001" → "EB-01"
 */
export function cardIdToOriginSet(cardId: string): string {
  const match = cardId.match(/^([A-Z]+)(\d+)-/);
  if (!match) return "UNKNOWN";
  const [, prefix, num] = match;
  return `${prefix}-${num}`;
}
