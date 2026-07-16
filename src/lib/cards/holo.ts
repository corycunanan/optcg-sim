import type { HoloEffect } from "@/types/cards";

/**
 * Rarity → effect tier mapping for inspected card artwork.
 *
 * Keep this exhaustive over the values emitted by the card import pipeline so a
 * newly introduced rarity fails visibly as `none` instead of inheriting an
 * arbitrary premium treatment.
 *
 * Vegapull rarity strings as stored: Common, Uncommon, Rare, SuperRare,
 * SecretRare, Leader, Special, TreasureRare, Promo (no spaces).
 */
export type OptcgCardRarity =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "SuperRare"
  | "SecretRare"
  | "Leader"
  | "Special"
  | "TreasureRare"
  | "Promo";

export const HOLO_EFFECT_BY_RARITY = {
  Common: "regular-holo",
  Uncommon: "regular-holo",
  Rare: "regular-holo",
  SuperRare: "prism-holo",
  Promo: "prism-holo",
  SecretRare: "rainbow-holo",
  Special: "rainbow-holo",
  TreasureRare: "rainbow-holo",
  Leader: "cosmos-holo",
} as const satisfies Readonly<Record<OptcgCardRarity, HoloEffect>>;

export function holoEffectForRarity(
  rarity: string | null | undefined
): HoloEffect {
  if (!rarity) return "none";
  if (!Object.prototype.hasOwnProperty.call(HOLO_EFFECT_BY_RARITY, rarity)) {
    return "none";
  }
  return HOLO_EFFECT_BY_RARITY[rarity as OptcgCardRarity];
}

/**
 * Spike feature flag. Default ON locally; set `NEXT_PUBLIC_FEATURE_HOLO_CARDS=0`
 * to disable everywhere the wrapper is mounted.
 */
export const HOLO_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_HOLO_CARDS !== "0";
