import {
  BOARD_CARD_H,
  BOARD_CARD_W,
  DON_CARD_H,
  DON_CARD_W,
  HAND_CARD_H,
  HAND_CARD_W,
} from "../board-layout/constants";
import type { CardSize, CardVariant } from "./types";

/**
 * Card footprint for each size token. Gameplay card sizes are sourced from
 * `board-layout/constants.ts` so the board grid, hand layout, animations, and
 * primitive rendering stay in sync.
 */
export const CARD_SIZES: Record<CardSize, { width: number; height: number }> = {
  field: { width: BOARD_CARD_W, height: BOARD_CARD_H },
  hand: { width: HAND_CARD_W, height: HAND_CARD_H },
  modal: { width: 120, height: 168 },  // modal target picker / trash grid
  preview: { width: 200, height: 280 }, // preview page showcase + large callouts
  don: { width: DON_CARD_W, height: DON_CARD_H },
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
