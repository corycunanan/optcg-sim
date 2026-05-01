// OPT-349: `computeBoardScaling` must fit the board's intrinsic content into
// the design canvas without the legacy `Math.min(1, …)` cap that left ~46%
// horizontal empty space at 1920×1080. The smaller-axis ratio wins; letterbox
// lives on the wider axis only. `<ScaledBoard>` then maps the design canvas
// to the actual viewport.

import { describe, expect, it } from "vitest";
import { computeBoardScaling } from "./board-geometry";
import {
  FIELD_W,
  BOARD_CONTENT_H,
  HAND_CARD_H,
  PLAYER_HAND_VIEWPORT_MARGIN,
  MIN_HAND_BOARD_GAP,
} from "./constants";

const CONTENT_H = BOARD_CONTENT_H + 2 * HAND_CARD_H;
const VERTICAL_OVERHEAD = PLAYER_HAND_VIEWPORT_MARGIN + 2 * MIN_HAND_BOARD_GAP;

function widthRatio(viewportWidth: number) {
  return viewportWidth / FIELD_W;
}

function heightRatio(viewportHeight: number) {
  return (viewportHeight - VERTICAL_OVERHEAD) / CONTENT_H;
}

describe("computeBoardScaling", () => {
  it("at 1920×1080 design viewport scales above 1× to fill the smaller axis", () => {
    const { boardScale } = computeBoardScaling({ width: 1920, height: 1080 });

    // Pre-OPT-349 this was capped at 1, leaving the board at ~46% width.
    expect(boardScale).toBeGreaterThan(1);

    // Smaller-axis ratio wins. At 1920×1080 that's height.
    expect(boardScale).toBeCloseTo(heightRatio(1080), 5);
    expect(boardScale).toBeLessThanOrEqual(widthRatio(1920));
  });

  it("at 1280×720 (legacy floor) the height axis is the smaller fit", () => {
    const { boardScale } = computeBoardScaling({ width: 1280, height: 720 });

    expect(boardScale).toBeCloseTo(
      Math.min(widthRatio(1280), heightRatio(720)),
      5,
    );
    // Board content fills viewport height (minus hand strips & margins).
    expect(BOARD_CONTENT_H * boardScale + 2 * HAND_CARD_H * boardScale).toBeLessThanOrEqual(
      720 - VERTICAL_OVERHEAD + 0.001,
    );
  });

  it("at 2560×1440 (above-design viewport) keeps scaling beyond design", () => {
    const { boardScale } = computeBoardScaling({ width: 2560, height: 1440 });

    expect(boardScale).toBeGreaterThan(1);
    expect(boardScale).toBeCloseTo(
      Math.min(widthRatio(2560), heightRatio(1440)),
      5,
    );
  });

  it("clamps to 0 if the viewport cannot fit any content", () => {
    const { boardScale } = computeBoardScaling({ width: 0, height: 0 });
    expect(boardScale).toBe(0);
  });

  it("places the player hand below the board content", () => {
    const { boardTop, playerHandTop } = computeBoardScaling({
      width: 1920,
      height: 1080,
    });
    expect(playerHandTop).toBeGreaterThan(boardTop);
  });
});
