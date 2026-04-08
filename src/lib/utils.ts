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
 * Deterministic pseudo-random rotation for a card instance.
 * Used in deck preview grids to fan stacked copies naturally.
 * Range: -1.5° to +1.5°
 */
export function cardRotation(cardId: string, index: number): number {
  let hash = index * 31;
  for (let i = 0; i < cardId.length; i++) {
    hash = (hash * 37 + cardId.charCodeAt(i)) & 0xffff;
  }
  return ((hash % 100) / 100) * 3 - 1.5;
}
