import type { HoloEffect } from "@/components/ui/holo-card";

/**
 * Rarity → effect tier mapping for the holo-card spike.
 *
 * The current `regular-holo` is intentionally subtle (pearlescent shimmer +
 * cursor-anchored highlight) — too soft to function as a rarity differentiator
 * on its own — so every card gets it. Future iterations will introduce more
 * pronounced tiers (e.g. iridescent rainbow for SecretRare, cosmos for Leader)
 * and reintroduce a rarity gate at that point.
 *
 * Vegapull rarity strings as stored: Common, Uncommon, Rare, SuperRare,
 * SecretRare, Promo, Leader (no spaces — verified against the live DB).
 */
export function holoEffectForRarity(rarity: string | null | undefined): HoloEffect {
  if (!rarity) return "none";
  return "regular-holo";
}

/**
 * Spike feature flag. Default ON locally; set `NEXT_PUBLIC_FEATURE_HOLO_CARDS=0`
 * to disable everywhere the wrapper is mounted.
 */
export const HOLO_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_HOLO_CARDS !== "0";
