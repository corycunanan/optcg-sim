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

export type BoardZonePrefix = "p" | "o";

/** Resolve a game-engine player index to its visual board side. `p` is the
 * bottom field and `o` is the top field; neither prefix implies viewer
 * identity. */
export function boardZonePrefix(
  playerIndex: 0 | 1,
  bottomPlayerIndex: 0 | 1,
): BoardZonePrefix {
  return playerIndex === bottomPlayerIndex ? "p" : "o";
}

export function boardZoneKey(
  playerIndex: 0 | 1,
  bottomPlayerIndex: 0 | 1,
  zone: string,
): string {
  return `${boardZonePrefix(playerIndex, bottomPlayerIndex)}-${zone}`;
}

export interface BoardComposition<T> {
  bottom: T;
  top: T;
  bottomOwner: "me" | "opp";
  topOwner: "me" | "opp";
  topPlayerIndex: 0 | 1;
}

/** Order identity-relative `me` / `opp` data onto the explicit visual anchor.
 * Spectator projections use the host (engine player 0) in the legacy `me`
 * slot until the spectator session lands; `bottomPlayerIndex` remains the
 * only input that decides which player is rendered at the bottom. */
export function resolveBoardComposition<T>(
  me: T,
  opp: T,
  myIndex: 0 | 1 | null,
  bottomPlayerIndex: 0 | 1,
): BoardComposition<T> {
  const mePlayerIndex = myIndex ?? 0;
  const meIsBottom = mePlayerIndex === bottomPlayerIndex;
  return {
    bottom: meIsBottom ? me : opp,
    top: meIsBottom ? opp : me,
    bottomOwner: meIsBottom ? "me" : "opp",
    topOwner: meIsBottom ? "opp" : "me",
    topPlayerIndex: bottomPlayerIndex === 0 ? 1 : 0,
  };
}

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
