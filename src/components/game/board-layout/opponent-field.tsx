"use client";

import { motion } from "motion/react";
import type { CardDb, PlayerState } from "@shared/game-types";
import { cardRest, cardActivate, cardHover } from "@/lib/motion";
import { BoardCard } from "../board-card";
import {
  SQUARE,
  SIDE_ZONE_GAP,
  FIELD_W,
  BOARD_CARD_W,
  BOARD_CARD_H,
} from "./constants";
import {
  zone2Left,
  zone2Right,
  oppTop,
  oppLeaderTop,
  oppCharTop,
  charSlotCenters,
  leaderLeft,
  stgDonWidth,
  sideCardOffsetX,
} from "./board-geometry";
import { DonZone } from "./don-zone";
import { LifeZone } from "./life-zone";
import { OpponentFieldCard } from "./field-card";
import { ZoneRef } from "./zone-ref";

interface OpponentFieldProps {
  opp: PlayerState | null;
  cardDb: CardDb;
  activeDragType: string | null;
  refreshWave: boolean;
  onPreviewZone: (preview: { type: "deck" | "trash"; owner: "opp" }) => void;
}

export function OpponentField({
  opp,
  cardDb,
  activeDragType,
  refreshWave,
  onPreviewZone,
}: OpponentFieldProps) {
  return (
    <>
      {/* Zone 3 (left): Trash + Deck */}
      <ZoneRef zoneKey="o-trash" style={{ position: "absolute", left: sideCardOffsetX, top: oppTop }}>
        <BoardCard
          card={opp && opp.trash.length > 0 ? opp.trash[0] : undefined}
          cardDb={cardDb}
          empty={!opp || opp.trash.length === 0}
          label="TRASH"
          count={opp && opp.trash.length > 1 ? opp.trash.length : undefined}
          width={BOARD_CARD_W}
          height={BOARD_CARD_H}
          onClick={() => opp && opp.trash.length > 0 && onPreviewZone({ type: "trash", owner: "opp" })}
        />
      </ZoneRef>
      <ZoneRef zoneKey="o-deck" style={{ position: "absolute", left: sideCardOffsetX, top: oppTop + SQUARE + SIDE_ZONE_GAP }}>
        <BoardCard
          cardDb={cardDb}
          sleeve
          sleeveUrl={opp?.sleeveUrl}
          label="DECK"
          count={opp?.deck.length}
          width={BOARD_CARD_W}
          height={BOARD_CARD_H}
          onClick={() => opp && onPreviewZone({ type: "deck", owner: "opp" })}
        />
      </ZoneRef>

      {/* Zone 2: Leader row — STG / LDR / DON */}
      <ZoneRef zoneKey="o-stage" style={{ position: "absolute", left: zone2Left, top: oppLeaderTop, width: stgDonWidth, height: SQUARE }} className="flex items-center justify-center rounded-md border border-gb-border-strong/30">
        {opp?.stage ? (
          <motion.div
            animate={{
              rotate: opp.stage.state === "RESTED" ? 90 : 0,
              filter: opp.stage.state === "RESTED" ? "brightness(0.6)" : "brightness(1)",
            }}
            transition={{
              ...(opp.stage.state === "RESTED" ? cardRest : cardActivate),
              delay: refreshWave ? 0.18 : 0,
            }}
            whileHover={cardHover}
          >
            <BoardCard
              card={opp.stage}
              cardDb={cardDb}
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
            />
          </motion.div>
        ) : (
          <span className="text-xs font-bold text-gb-text-dim/40 leading-none select-none">
            STG
          </span>
        )}
      </ZoneRef>

      {opp?.leader ? (
        <OpponentFieldCard
          card={opp.leader}
          cardDb={cardDb}
          activeDragType={activeDragType}
          zoneKey="o-leader"
          style={{ position: "absolute", left: leaderLeft, top: oppLeaderTop }}
          animationDelay={refreshWave ? 0 : undefined}
        />
      ) : (
        <BoardCard
          cardDb={cardDb}
          empty
          label="LDR"
          width={SQUARE}
          height={SQUARE}
          style={{ position: "absolute", left: leaderLeft, top: oppLeaderTop }}
        />
      )}

      <DonZone
        player={opp}
        zoneKey="o-don"
        donArtUrl={opp?.donArtUrl}
        style={{ left: zone2Right - stgDonWidth, top: oppLeaderTop, width: stgDonWidth, height: SQUARE }}
        animationDelay={refreshWave ? 0.2 : undefined}
      />

      {/* Zone 2: Character row */}
      {charSlotCenters.map((pos, i) => {
        const char = opp?.characters[i] ?? null;
        return char ? (
          <OpponentFieldCard
            key={`opp-c${i}`}
            card={char}
            cardDb={cardDb}
            activeDragType={activeDragType}
            zoneKey={`o-char-${i}`}
            style={{ position: "absolute", left: pos.left, top: oppCharTop }}
            animationDelay={refreshWave ? 0.03 * (i + 1) : undefined}
          />
        ) : (
          <BoardCard
            key={`opp-c${i}`}
            cardDb={cardDb}
            empty
            label={`C${i + 1}`}
            width={SQUARE}
            height={SQUARE}
            style={{ position: "absolute", left: pos.left, top: oppCharTop }}
          />
        );
      })}

      {/* Zone 1 (right): Life */}
      <LifeZone
        life={opp?.life ?? []}
        cardDb={cardDb}
        zoneKey="o-life"
        sleeveUrl={opp?.sleeveUrl}
        style={{ position: "absolute", left: FIELD_W - SQUARE + sideCardOffsetX, top: oppTop }}
      />
    </>
  );
}
