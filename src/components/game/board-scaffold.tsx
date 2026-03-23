"use client";

import { cn } from "@/lib/utils";

/* ─── Figma Wireframe Dimensions ───────────────────────────────────────────
   Source: Board Design → Screen (node 622:3724)
   All values in px, rounded from Figma auto-layout measurements.
   ──────────────────────────────────────────────────────────────────────── */

const SCREEN_W = 1280;
const SCREEN_H = 832;
const NAVBAR_H = 48;
const OPP_HAND_Y = 24;
const OPP_HAND_H = 84;
const PLAYER_HAND_Y = 700;
const PLAYER_HAND_H = 118;
const MID_ZONE_H = 64;

// Card zone is square so cards (70×98) can rotate 90° when rested
const SQUARE = 112;

const HAND_CARD_W = 84;
const HAND_CARD_H = 118;

/* ─── Slot — placeholder for a single card position ───────────────────── */

function Slot({
  w,
  h,
  label,
  faceDown,
  className,
  style,
}: {
  w?: number;
  h: number;
  label?: string;
  faceDown?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "rounded border flex items-center justify-center shrink-0",
        faceDown
          ? "bg-gb-surface-inset border-gb-border-strong border-solid"
          : "bg-gb-surface-raised/50 border-gb-border-strong border-dashed",
        className,
      )}
      style={{ width: w, height: h, ...style }}
    >
      {label && (
        <span className="text-xs text-gb-text-dim text-center leading-tight select-none">
          {label}
        </span>
      )}
    </div>
  );
}

/* ─── Zone 2 — Field Grid ─────────────────────────────────────────────
   Characters, Leader, Stage, DON.

   Leader row: 3-column grid (1fr | auto | 1fr)
     - 1fr columns hold Stage and DON (stretch to fill remaining space)
     - auto column holds Leader (fixed SQUARE width → aligns with C3)

   Opponent (top → bottom):
     Row 1: [STG] [LDR] [DON]
     Row 2: [C1] [C2] [C3] [C4] [C5]

   Player (top → bottom, 180° mirror):
     Row 1: [C1] [C2] [C3] [C4] [C5]
     Row 2: [DON] [LDR] [STG]

   Zone layout per half:
     [Zone 3] gap-8 [Zone 2] gap-8 [Zone 1]  (opponent)
     [Zone 1] gap-8 [Zone 2] gap-8 [Zone 3]  (player)
   ──────────────────────────────────────────────────────────────────── */

function FieldGrid({ side }: { side: "opponent" | "player" }) {
  const isOpp = side === "opponent";

  const leaderRow = (
    <div
      className="grid items-center gap-2.5"
      style={{ gridTemplateColumns: "1fr auto 1fr" }}
    >
      <Slot h={SQUARE} label={isOpp ? "STG" : "DON"} />
      <Slot w={SQUARE} h={SQUARE} label="LDR" />
      <Slot h={SQUARE} label={isOpp ? "DON" : "STG"} />
    </div>
  );

  const characterRow = (
    <div className="flex justify-center gap-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Slot key={i} w={SQUARE} h={SQUARE} label={`C${i + 1}`} />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {isOpp ? (
        <>
          {leaderRow}
          {characterRow}
        </>
      ) : (
        <>
          {characterRow}
          {leaderRow}
        </>
      )}
    </div>
  );
}

/* ─── Opponent Field ───────────────────────────────────────────────────── */
/*  Left → Right: [Zone 3: Deck/Trash] [Zone 2: Field] [Zone 1: Life]
    All zones top-aligned via items-start.                                 */

function OpponentField() {
  return (
    <div className="flex items-start gap-8">
      {/* Zone 3 */}
      <div className="flex flex-col items-center gap-3 shrink-0">
        <Slot w={SQUARE} h={SQUARE} label="TRASH" />
        <Slot w={SQUARE} h={SQUARE} label="DECK" />
      </div>

      {/* Zone 2 */}
      <FieldGrid side="opponent" />

      {/* Zone 1 */}
      <div className="flex flex-col items-center shrink-0">
        <Slot w={SQUARE} h={SQUARE} label="LIFE" />
      </div>
    </div>
  );
}

/* ─── Player Field ─────────────────────────────────────────────────────── */
/*  Left → Right: [Zone 1: Life] [Zone 2: Field] [Zone 3: Deck/Trash]
    180° mirror of opponent field. All zones top-aligned.                  */

function PlayerField() {
  return (
    <div className="flex items-start gap-8">
      {/* Zone 1 */}
      <div className="flex flex-col items-center shrink-0">
        <Slot w={SQUARE} h={SQUARE} label="LIFE" />
      </div>

      {/* Zone 2 */}
      <FieldGrid side="player" />

      {/* Zone 3 */}
      <div className="flex flex-col items-center gap-3 shrink-0">
        <Slot w={SQUARE} h={SQUARE} label="DECK" />
        <Slot w={SQUARE} h={SQUARE} label="TRASH" />
      </div>
    </div>
  );
}

/* ─── Mid Zone — controls / prompts / phase info ──────────────────────── */

function MidZone() {
  return (
    <div
      className="self-stretch bg-gb-board-dark flex items-center justify-center gap-2.5 px-2.5"
      style={{ height: MID_ZONE_H }}
    >
      <span className="text-xs text-gb-text-dim tracking-widest uppercase">
        Controls &middot; Prompts &middot; Phase Info
      </span>
    </div>
  );
}

/* ─── Hand Strip — absolute-positioned row of cards ───────────────────── */

function HandStrip({
  top,
  height,
  faceDown,
  count,
  alignItems,
}: {
  top: number;
  height: number;
  faceDown?: boolean;
  count: number;
  alignItems: "items-start" | "items-end";
}) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 flex justify-center gap-2.5 px-2.5 z-10",
        alignItems,
      )}
      style={{ top, height }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Slot
          key={i}
          w={HAND_CARD_W}
          h={HAND_CARD_H}
          faceDown={faceDown}
          label={faceDown ? undefined : `H${i + 1}`}
        />
      ))}
    </div>
  );
}

/* ─── Root: Board Scaffold ─────────────────────────────────────────────── */

export function BoardScaffold() {
  return (
    <div
      className="relative bg-gb-board flex flex-col items-stretch mx-auto overflow-hidden"
      style={{ width: SCREEN_W, height: SCREEN_H }}
    >
      {/* Navbar */}
      <nav
        className="bg-neutral-700 flex items-center justify-between px-6 shrink-0 z-20"
        style={{ width: SCREEN_W, height: NAVBAR_H }}
      >
        <span className="text-xs font-bold text-gb-text-bright tracking-widest">
          OPTCG SIM
        </span>
      </nav>

      {/* Opponent Hand (face-down, half-clipped behind navbar) */}
      <HandStrip
        top={OPP_HAND_Y}
        height={OPP_HAND_H}
        faceDown
        count={5}
        alignItems="items-end"
      />

      {/* Board area */}
      <div className="flex-1 flex justify-center pt-20">
        <div className="flex flex-col items-stretch">
          <OpponentField />
          <MidZone />
          <PlayerField />
        </div>
      </div>

      {/* Player Hand (face-up, overlapping at bottom) */}
      <HandStrip
        top={PLAYER_HAND_Y}
        height={PLAYER_HAND_H}
        count={5}
        alignItems="items-start"
      />
    </div>
  );
}
