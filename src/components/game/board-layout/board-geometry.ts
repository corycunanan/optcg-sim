import {
  SQUARE,
  HAND_CARD_W,
  HAND_CARD_H,
  MID_ZONE_H,
  CHAR_ROW_GAP,
  ZONE_GAP,
  ROW_GAP,
  LEADER_GAP,
  CHAR_ROW_W,
  FIELD_W,
  FIELD_H,
  BOARD_CONTENT_H,
  MIN_HAND_BOARD_GAP,
  PLAYER_HAND_VIEWPORT_MARGIN,
  BOARD_CARD_W,
  CARD_OFFSET_X,
} from "./constants";

/* ── Static field positions ────────────────────────────────────────── */

export const zone2Left = SQUARE + ZONE_GAP;
export const zone2Right = zone2Left + CHAR_ROW_W;

export const oppTop = 0;
export const oppLeaderTop = oppTop;
export const oppCharTop = oppTop + SQUARE + ROW_GAP;
export const midTop = oppTop + FIELD_H;
export const playerTop = midTop + MID_ZONE_H;
export const playerCharTop = playerTop;
export const playerLeaderTop = playerTop + SQUARE + ROW_GAP;

export const charSlotCenters = Array.from({ length: 5 }, (_, i) => ({
  left: zone2Left + i * (SQUARE + CHAR_ROW_GAP),
}));

export const leaderLeft = zone2Left + (CHAR_ROW_W - SQUARE) / 2;
export const stgDonWidth = (CHAR_ROW_W - SQUARE - 2 * LEADER_GAP) / 2;
export const sideCardOffsetX = CARD_OFFSET_X;

/* ── Design-canvas fit ─────────────────────────────────────────────── */

export interface BoardScaling {
  boardScale: number;
  boardTop: number;
  playerHandTop: number;
}

/**
 * Fits the board's intrinsic content (FIELD_W × BOARD_CONTENT_H plus the two
 * hand strips) into the design canvas supplied by the surrounding
 * `<ScaledBoard>`. The smaller-axis ratio wins; `<ScaledBoard>` then maps the
 * design canvas to the viewport. There is no `Math.min(1, …)` cap — at the
 * 1920×1080 design canvas the board's intrinsic ~888×788 content is smaller
 * than the canvas on both axes, so capping at 1× left ~46% horizontal empty
 * space (OPT-349). Letting the scale grow above 1 fills the smaller axis;
 * letterbox lives on the wider axis only.
 */
export function computeBoardScaling(viewport: { width: number; height: number }): BoardScaling {
  const boardScale = Math.max(
    0,
    Math.min(
      viewport.width / FIELD_W,
      (viewport.height -
        PLAYER_HAND_VIEWPORT_MARGIN -
        2 * MIN_HAND_BOARD_GAP) /
        (BOARD_CONTENT_H + 2 * HAND_CARD_H),
    ),
  );

  const scaledBoardH = BOARD_CONTENT_H * boardScale;
  const scaledHandH = HAND_CARD_H * boardScale;
  const boardBottom =
    viewport.height -
    PLAYER_HAND_VIEWPORT_MARGIN -
    scaledHandH -
    MIN_HAND_BOARD_GAP;
  const boardTop = boardBottom - scaledBoardH;
  const playerHandTop = boardBottom + MIN_HAND_BOARD_GAP;

  return { boardScale, boardTop, playerHandTop };
}
