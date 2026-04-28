import type { HoloEffect } from "@/components/ui/holo-card";

/**
 * Rarity → effect tier mapping for the holo-card spike.
 *
 * Vegapull rarity strings as stored: Common, Uncommon, Rare, SuperRare,
 * SecretRare, Promo, Leader (no spaces — verified against the live DB).
 * The first pass assigns a single shared effect to the "premium" tier; later
 * iterations should split SecretRare / Leader / Promo into their own effects
 * (e.g. rainbow, cosmos).
 */
const HOLO_RARITIES = new Set<string>([
  "SuperRare",
  "SecretRare",
  "Leader",
  "Promo",
]);

export function holoEffectForRarity(rarity: string | null | undefined): HoloEffect {
  if (!rarity) return "none";
  if (HOLO_RARITIES.has(rarity)) return "regular-holo";
  return "none";
}

/**
 * Spike feature flag. Default ON locally; set `NEXT_PUBLIC_FEATURE_HOLO_CARDS=0`
 * to disable everywhere the wrapper is mounted.
 */
export const HOLO_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_HOLO_CARDS !== "0";
