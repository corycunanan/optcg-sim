/**
 * Utility functions shared across the application.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export {
  cardIdToOriginSet,
  decodeHtmlEntities,
  detectVariantType,
  stripVariantSuffix,
} from "@shared/card-parsing";

/**
 * Merge Tailwind CSS classes with conflict resolution.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
