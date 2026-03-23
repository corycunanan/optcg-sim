"use client";

import { cn } from "@/lib/utils";

/* ─── Dimensions (preserved from wireframe) ───────────────────────────── */

const SCREEN_W = 1280;
const SCREEN_H = 832;
const NAVBAR_H = 48;
const MID_ZONE_H = 64;
const SQUARE = 112;
const HAND_CARD_W = 84;
const HAND_CARD_H = 118;

/* ─── Derived layout values ───────────────────────────────────────────── */

const CHAR_ROW_GAP = 10;
const ZONE_GAP = 32;
const ROW_GAP = 20;
const LEADER_GAP = 10;
const SIDE_ZONE_GAP = 12;

const CHAR_ROW_W = 5 * SQUARE + 4 * CHAR_ROW_GAP;
const FIELD_W = SQUARE + ZONE_GAP + CHAR_ROW_W + ZONE_GAP + SQUARE;
const FIELD_H = SQUARE + ROW_GAP + SQUARE;
const BOARD_CONTENT_H = FIELD_H + MID_ZONE_H + FIELD_H;

const BOARD_LEFT = (SCREEN_W - FIELD_W) / 2;
const BOARD_TOP = NAVBAR_H + 80;
const HAND_GAP = 20;
const OPP_HAND_BOTTOM = BOARD_TOP - HAND_GAP;
const PLAYER_HAND_TOP = BOARD_TOP + BOARD_CONTENT_H + HAND_GAP;

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
  const zone2Left = BOARD_LEFT + SQUARE + ZONE_GAP;
  const zone2Right = zone2Left + CHAR_ROW_W;

  const oppTop = BOARD_TOP;
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

  return (
    <div
      className="relative left-1/2 -translate-x-1/2 bg-gb-board overflow-hidden"
      style={{ width: SCREEN_W, height: SCREEN_H }}
    >
      {/* ── Navbar ──────────────────────────────────────────────────── */}
      <nav
        className="absolute inset-x-0 top-0 bg-neutral-700 flex items-center px-6 z-20"
        style={{ height: NAVBAR_H }}
      >
        <span className="text-xs font-bold text-gb-text-bright tracking-widest">
          OPTCG SIM
        </span>
      </nav>

      {/* ── Opponent Hand (Zone 4) — half-clipped behind navbar ───── */}
      <div
        className="absolute inset-x-0 flex justify-center gap-2.5 items-end z-10"
        style={{ top: 0, height: OPP_HAND_BOTTOM }}
      >
        {Array.from({ length: 5 }, (_, i) => (
          <Slot
            key={i}
            faceDown
            style={{ width: HAND_CARD_W, height: HAND_CARD_H }}
          />
        ))}
      </div>

      {/* ── Opponent Field ─────────────────────────────────────────── */}

      {/* Zone 3: Trash + Deck (left) */}
      <Slot
        label="TRASH"
        style={{
          position: "absolute",
          left: BOARD_LEFT,
          top: oppTop,
          width: SQUARE,
          height: SQUARE,
        }}
      />
      <Slot
        label="DECK"
        style={{
          position: "absolute",
          left: BOARD_LEFT,
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
          left: zone2Right + ZONE_GAP,
          top: oppTop,
          width: SQUARE,
          height: SQUARE,
        }}
      />

      {/* ── Mid Zone ───────────────────────────────────────────────── */}
      <div
        className="absolute bg-gb-board-dark flex items-center justify-center"
        style={{
          left: BOARD_LEFT,
          top: midTop,
          width: FIELD_W,
          height: MID_ZONE_H,
        }}
      >
        <span className="text-xs text-gb-text-dim tracking-widest uppercase">
          Controls &middot; Prompts &middot; Phase Info
        </span>
      </div>

      {/* ── Player Field (mirrored) ────────────────────────────────── */}

      {/* Zone 1: Life (left) */}
      <Slot
        label="LIFE"
        style={{
          position: "absolute",
          left: BOARD_LEFT,
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
          left: zone2Right + ZONE_GAP,
          top: playerTop,
          width: SQUARE,
          height: SQUARE,
        }}
      />
      <Slot
        label="TRASH"
        style={{
          position: "absolute",
          left: zone2Right + ZONE_GAP,
          top: playerTop + SQUARE + SIDE_ZONE_GAP,
          width: SQUARE,
          height: SQUARE,
        }}
      />

      {/* ── Player Hand (Zone 4) — fully visible ──────────────────── */}
      <div
        className="absolute inset-x-0 flex justify-center gap-2.5 items-start z-10"
        style={{ top: PLAYER_HAND_TOP, height: HAND_CARD_H }}
      >
        {Array.from({ length: 5 }, (_, i) => (
          <Slot
            key={i}
            label={`H${i + 1}`}
            style={{ width: HAND_CARD_W, height: HAND_CARD_H }}
          />
        ))}
      </div>
    </div>
  );
}
