"use client";

import { useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  NAVBAR_H,
  SQUARE,
  HAND_CARD_W,
  HAND_CARD_H,
  MID_ZONE_H,
  CHAR_ROW_GAP,
  ZONE_GAP,
  ROW_GAP,
  LEADER_GAP,
  SIDE_ZONE_GAP,
  CHAR_ROW_W,
  FIELD_W,
  FIELD_H,
  BOARD_CONTENT_H,
  MIN_HAND_BOARD_GAP,
  PLAYER_HAND_VIEWPORT_MARGIN,
  getViewportSize,
} from "./board-layout/constants";

/* ─── Slot — placeholder for a single card position ───────────────────── */

function Slot({
  label,
  faceDown,
  className,
  style,
}: {
  label?: string;
  faceDown?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "rounded border flex items-center justify-center",
        faceDown
          ? "bg-gb-surface-inset border-gb-border-strong border-solid"
          : "bg-gb-surface-raised/50 border-gb-border-strong border-dashed",
        className,
      )}
      style={style}
    >
      {label && (
        <span className="text-xs text-gb-text-dim text-center leading-tight select-none">
          {label}
        </span>
      )}
    </div>
  );
}

function HandStrip({
  faceDown,
  style,
}: {
  faceDown?: boolean;
  style: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 flex justify-center gap-2.5 z-10",
        faceDown ? "items-end" : "items-start",
      )}
      style={style}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Slot
          key={i}
          faceDown={faceDown}
          label={faceDown ? undefined : `H${i + 1}`}
          style={{ width: HAND_CARD_W, height: HAND_CARD_H }}
        />
      ))}
    </div>
  );
}

/* ─── Root: Board Scaffold ─────────────────────────────────────────────
   Pure absolute positioning. Every element is placed with explicit
   pixel coordinates so there are no flex/grid centering ambiguities.

   Zone codes:
     Zone 1 = Life
     Zone 2 = Characters, Leader, Stage, DON
     Zone 3 = Deck, Trash
     Zone 4 = Hand

   Layout per half (opponent):
     [Zone 3] gap [Zone 2] gap [Zone 1]

   Layout per half (player, mirrored):
     [Zone 1] gap [Zone 2] gap [Zone 3]
   ──────────────────────────────────────────────────────────────────── */

export function BoardScaffold() {
  const [viewport, setViewport] = useState(getViewportSize);

  useLayoutEffect(() => {
    function updateViewport() {
      setViewport(getViewportSize());
    }

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
    };
  }, []);

  const zone2Left = SQUARE + ZONE_GAP;
  const zone2Right = zone2Left + CHAR_ROW_W;

  const oppTop = 0;
  const oppLeaderTop = oppTop;
  const oppCharTop = oppTop + SQUARE + ROW_GAP;
  const midTop = oppTop + FIELD_H;
  const playerTop = midTop + MID_ZONE_H;
  const playerCharTop = playerTop;
  const playerLeaderTop = playerTop + SQUARE + ROW_GAP;

  const charSlotPositions = Array.from({ length: 5 }, (_, i) => ({
    left: zone2Left + i * (SQUARE + CHAR_ROW_GAP),
  }));

  const leaderLeft = zone2Left + (CHAR_ROW_W - SQUARE) / 2;
  const stgDonWidth = (CHAR_ROW_W - SQUARE - 2 * LEADER_GAP) / 2;
  const boardScale = Math.max(
    0,
    Math.min(
      1,
      viewport.width / FIELD_W,
      (viewport.height - PLAYER_HAND_VIEWPORT_MARGIN - 2 * MIN_HAND_BOARD_GAP) /
        (BOARD_CONTENT_H + 2 * HAND_CARD_H),
    ),
  );
  const scaledBoardHeight = BOARD_CONTENT_H * boardScale;
  const scaledHandHeight = HAND_CARD_H * boardScale;
  const boardBottomPx =
    viewport.height -
    PLAYER_HAND_VIEWPORT_MARGIN -
    scaledHandHeight -
    MIN_HAND_BOARD_GAP;
  const boardTopPx = boardBottomPx - scaledBoardHeight;
  const opponentHandTopPx = 0;
  const playerHandTopPx = boardBottomPx + MIN_HAND_BOARD_GAP;

  return (
    <div className="relative h-full w-full overflow-hidden bg-gb-board">
      <nav
        className="absolute inset-x-0 top-0 z-20 flex items-center bg-neutral-700 px-6"
        style={{ height: NAVBAR_H }}
      >
        <span className="text-xs font-bold tracking-widest text-gb-text-bright">
          OPTCG SIM
        </span>
      </nav>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">
        <div
          className="relative shrink-0"
          style={{
            width: FIELD_W,
            height: HAND_CARD_H,
            top: opponentHandTopPx,
            transform: `scale(${boardScale})`,
            transformOrigin: "top center",
          }}
        >
          <HandStrip faceDown style={{ top: 0, height: HAND_CARD_H }} />
        </div>
      </div>

      <div className="absolute inset-x-0 flex justify-center" style={{ top: boardTopPx }}>
        <div
          className="relative shrink-0 overflow-hidden bg-gb-board"
          style={{
            width: FIELD_W,
            height: BOARD_CONTENT_H,
            transform: `scale(${boardScale})`,
            transformOrigin: "top center",
          }}
        >
          {/* ── Opponent Field ─────────────────────────────────────────── */}

          {/* Zone 3: Trash + Deck (left) */}
          <Slot
            label="TRASH"
            style={{
              position: "absolute",
              left: 0,
              top: oppTop,
              width: SQUARE,
              height: SQUARE,
            }}
          />
          <Slot
            label="DECK"
            style={{
              position: "absolute",
              left: 0,
              top: oppTop + SQUARE + SIDE_ZONE_GAP,
              width: SQUARE,
              height: SQUARE,
            }}
          />

          {/* Zone 2: Leader row (STG / LDR / DON) */}
          <Slot
            label="STG"
            style={{
              position: "absolute",
              left: zone2Left,
              top: oppLeaderTop,
              width: stgDonWidth,
              height: SQUARE,
            }}
          />
          <Slot
            label="LDR"
            style={{
              position: "absolute",
              left: leaderLeft,
              top: oppLeaderTop,
              width: SQUARE,
              height: SQUARE,
            }}
          />
          <Slot
            label="DON"
            style={{
              position: "absolute",
              left: zone2Right - stgDonWidth,
              top: oppLeaderTop,
              width: stgDonWidth,
              height: SQUARE,
            }}
          />

          {/* Zone 2: Character row */}
          {charSlotPositions.map((pos, i) => (
            <Slot
              key={`opp-c${i}`}
              label={`C${i + 1}`}
              style={{
                position: "absolute",
                left: pos.left,
                top: oppCharTop,
                width: SQUARE,
                height: SQUARE,
              }}
            />
          ))}

          {/* Zone 1: Life (right) */}
          <Slot
            label="LIFE"
            style={{
              position: "absolute",
              left: FIELD_W - SQUARE,
              top: oppTop,
              width: SQUARE,
              height: SQUARE,
            }}
          />

          {/* ── Mid Zone ───────────────────────────────────────────────── */}
          <div
            className="absolute flex items-center justify-center bg-gb-board-dark"
            style={{
              left: 0,
              top: midTop,
              width: FIELD_W,
              height: MID_ZONE_H,
            }}
          >
            <span className="text-xs uppercase tracking-widest text-gb-text-dim">
              Controls &middot; Prompts &middot; Phase Info
            </span>
          </div>

          {/* ── Player Field (mirrored) ────────────────────────────────── */}

          {/* Zone 1: Life (left) */}
          <Slot
            label="LIFE"
            style={{
              position: "absolute",
              left: 0,
              top: playerTop,
              width: SQUARE,
              height: SQUARE,
            }}
          />

          {/* Zone 2: Character row */}
          {charSlotPositions.map((pos, i) => (
            <Slot
              key={`plr-c${i}`}
              label={`C${i + 1}`}
              style={{
                position: "absolute",
                left: pos.left,
                top: playerCharTop,
                width: SQUARE,
                height: SQUARE,
              }}
            />
          ))}

          {/* Zone 2: Leader row (DON / LDR / STG) */}
          <Slot
            label="DON"
            style={{
              position: "absolute",
              left: zone2Left,
              top: playerLeaderTop,
              width: stgDonWidth,
              height: SQUARE,
            }}
          />
          <Slot
            label="LDR"
            style={{
              position: "absolute",
              left: leaderLeft,
              top: playerLeaderTop,
              width: SQUARE,
              height: SQUARE,
            }}
          />
          <Slot
            label="STG"
            style={{
              position: "absolute",
              left: zone2Right - stgDonWidth,
              top: playerLeaderTop,
              width: stgDonWidth,
              height: SQUARE,
            }}
          />

          {/* Zone 3: Deck + Trash (right) */}
          <Slot
            label="DECK"
            style={{
              position: "absolute",
              left: FIELD_W - SQUARE,
              top: playerTop,
              width: SQUARE,
              height: SQUARE,
            }}
          />
          <Slot
            label="TRASH"
            style={{
              position: "absolute",
              left: FIELD_W - SQUARE,
              top: playerTop + SQUARE + SIDE_ZONE_GAP,
              width: SQUARE,
              height: SQUARE,
            }}
          />
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 flex justify-center"
        style={{ top: playerHandTopPx }}
      >
        <div
          className="relative shrink-0"
          style={{
            width: FIELD_W,
            height: HAND_CARD_H,
            transform: `scale(${boardScale})`,
            transformOrigin: "top center",
          }}
        >
          <HandStrip style={{ top: 0, height: HAND_CARD_H }} />
        </div>
      </div>
    </div>
  );
}
