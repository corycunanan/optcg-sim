/**
 * Utility functions shared across the application.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with conflict resolution.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

/**
 * Strip the variant suffix from a vegapull card ID.
 * e.g. "OP01-001_p1" → "OP01-001", "OP01-001_r1" → "OP01-001", "OP01-001" → "OP01-001"
 */
export function stripVariantSuffix(vegapullId: string): string {
  return vegapullId.replace(/_[pr]\d+$/, "");
}

/**
 * Detect variant type from a vegapull card ID.
 * Returns "base", "parallel", or "reprint".
 */
export function detectVariantType(
  vegapullId: string
): "base" | "parallel" | "reprint" {
  if (/_p\d+$/.test(vegapullId)) return "parallel";
  if (/_r\d+$/.test(vegapullId)) return "reprint";
  return "base";
}

/**
 * Decode HTML entities in a string.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

/**
 * Sanitize card effect text: decode HTML entities, convert <br> to newlines, strip tags.
 */
export function sanitizeEffectText(text: string): string {
  if (!text || text === "-") return "";
  return decodeHtmlEntities(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
