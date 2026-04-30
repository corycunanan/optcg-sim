import type { CardSize, CardVariant } from "./types";

/**
 * Card footprint for each size token. Values align with the existing geometry
 * constants in `board-layout/constants.ts` so the primitive drops into the
 * current board without visual regressions during migration.
 */
export const CARD_SIZES: Record<CardSize, { width: number; height: number }> = {
  field: { width: 80, height: 112 },   // BOARD_CARD_W × BOARD_CARD_H (= SQUARE)
  hand: { width: 84, height: 118 },    // HAND_CARD_W × HAND_CARD_H
  modal: { width: 120, height: 168 },  // modal target picker / trash grid
  preview: { width: 200, height: 280 }, // preview page showcase + large callouts
  don: { width: 50, height: 70 },      // DON!! token in the cost area
};

/** Default size token for a given variant. Consumers can override via `size`. */
export const DEFAULT_SIZE_FOR_VARIANT: Record<CardVariant, CardSize> = {
  field: "field",
  hand: "hand",
  modal: "modal",
  life: "field",
  trash: "field",
  don: "don",
};

export function resolveSize(
  variant: CardVariant,
  size?: CardSize,
): { width: number; height: number } {
  return CARD_SIZES[size ?? DEFAULT_SIZE_FOR_VARIANT[variant]];
}
