/**
 * Utility functions shared across the application.
 */

import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

export {
  cardIdToOriginSet,
  decodeHtmlEntities,
  detectVariantType,
  stripVariantSuffix,
} from "@shared/card-parsing";

/**
 * Custom utilities declared in `globals.css` are invisible to tailwind-merge —
 * it only knows the classes stock Tailwind generates. An unregistered utility
 * never conflicts with anything, so `cn()` keeps it alongside the class meant
 * to replace it and stylesheet order decides the winner instead of call order.
 *
 * `lift` (the standardized hover lift, ELEVATION-LANGUAGE.md §The standardized
 * lift) writes the same `translate` property as `translate-y-*`, so it joins
 * that class group and a later `translate-y-0` correctly drops it.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "translate-y": ["lift"],
    },
  },
});

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
