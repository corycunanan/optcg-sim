import type { CardInstance, DonInstance } from "@shared/game-types";

/* ─── Geometry (reference: GAME-BOARD-LAYOUT-REFERENCE.md) ────────── */

export const NAVBAR_H = 48;
export const SQUARE = 128;
export const HAND_CARD_W = 96;
export const HAND_CARD_H = 134;
export const MID_ZONE_H = 40;
export const CHAR_ROW_GAP = 68;
export const ZONE_GAP = 180;
export const ROW_GAP = 8;
export const LEADER_GAP = 10;
export const SIDE_ZONE_GAP = 8;

export const CHAR_ROW_W = 5 * SQUARE + 4 * CHAR_ROW_GAP;
export const FIELD_W = SQUARE + ZONE_GAP + CHAR_ROW_W + ZONE_GAP + SQUARE;
export const FIELD_H = SQUARE + ROW_GAP + SQUARE;
export const BOARD_CONTENT_H = FIELD_H + MID_ZONE_H + FIELD_H;

export const MIN_HAND_BOARD_GAP = 12;
export const PLAYER_HAND_VIEWPORT_MARGIN = 8;

export const BOARD_CARD_W = 92;
export const BOARD_CARD_H = SQUARE;
export const CARD_OFFSET_X = (SQUARE - BOARD_CARD_W) / 2;
export const DON_CARD_W = 57;
export const DON_CARD_H = 80;
export const DON_ACTIVE_OVERLAP = 40;
export const DON_RESTED_OVERLAP = 68;

/* ─── Viewport measurement ────────────────────────────────────────── */

export function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: FIELD_W, height: BOARD_CONTENT_H + 2 * HAND_CARD_H };
  }
  const vv = window.visualViewport;
  if (vv) return { width: vv.width, height: vv.height };
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };
}

/* ─── Drag & Drop payload types ───────────────────────────────────── */

export interface HandCardDrag {
  type: "hand-card";
  card: CardInstance;
}

export interface ActiveDonDrag {
  type: "active-don";
  don: DonInstance;
}

export interface AttackerDrag {
  type: "attacker";
  card: CardInstance;
}

export interface RedistributeDonDrag {
  type: "redistribute-don";
  don: DonInstance;
  fromCardInstanceId: string;
}

export type DragPayload = HandCardDrag | ActiveDonDrag | AttackerDrag | RedistributeDonDrag;
