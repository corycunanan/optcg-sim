"use client";

import type { CardDb, PlayerState } from "@shared/game-types";
import { useFieldArrivals } from "@/hooks/use-field-arrivals";
import { Card } from "../card";
import { EmptySlot } from "./empty-slot";
import {
  SQUARE,
  SIDE_ZONE_GAP,
  FIELD_W,
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
  attackerInstanceId?: string | null;
  counterPulseIds?: Set<string>;
  /** Signed offsets merged into displayed DON count per target card
   *  (OPT-274). Negative while a DON token is in-flight so the counter
   *  doesn't increment before the token lands. */
  donCountAdjustments?: Map<string, number>;
}

export function OpponentField({
  opp,
  cardDb,
  activeDragType,
  refreshWave,
  onPreviewZone,
  attackerInstanceId,
  counterPulseIds,
  donCountAdjustments,
}: OpponentFieldProps) {
  const hasTrash = !!opp && opp.trash.length > 0;
  const topTrash = hasTrash ? opp.trash[0] : undefined;

  // Detect newly-arrived cards so the summon-entry pop plays on mount
  // (OPT-274). `useFieldArrivals` compares against the previous render's
  // instanceIds and seeds empty on the first render.
  const fieldIds: string[] = [];
  if (opp?.leader) fieldIds.push(opp.leader.instanceId);
  for (const c of opp?.characters ?? []) {
    if (c) fieldIds.push(c.instanceId);
  }
  const arrivals = useFieldArrivals(fieldIds);

  return (
    <>
      {/* Zone 3 (left): Trash + Deck */}
      <ZoneRef zoneKey="o-trash" style={{ position: "absolute", left: sideCardOffsetX, top: oppTop }}>
        <Card
          variant="trash"
          data={{ cardDb, card: topTrash }}
          empty={!hasTrash}
          emptyLabel="TRASH"
          overlays={
            hasTrash && opp.trash.length > 1
              ? { countBadge: opp.trash.length }
              : undefined
          }
          interaction={{ clickable: hasTrash }}
          onClick={() => hasTrash && onPreviewZone({ type: "trash", owner: "opp" })}
        />
      </ZoneRef>
      <ZoneRef zoneKey="o-deck" style={{ position: "absolute", left: sideCardOffsetX, top: oppTop + SQUARE + SIDE_ZONE_GAP }}>
        <Card
          variant="trash"
          data={{ cardDb }}
          faceDown
          sleeveUrl={opp?.sleeveUrl}
          overlays={{ countBadge: opp?.deck.length, label: "DECK" }}
          interaction={{ clickable: !!opp }}
          onClick={() => opp && onPreviewZone({ type: "deck", owner: "opp" })}
        />
      </ZoneRef>

      {/* Zone 2: Leader row — STG / LDR / DON */}
      <ZoneRef zoneKey="o-stage" style={{ position: "absolute", left: zone2Left, top: oppLeaderTop, width: stgDonWidth, height: SQUARE }} className="flex items-center justify-center rounded-md border border-gb-border-strong/30">
        {opp?.stage ? (
          <Card
            variant="field"
            data={{ card: opp.stage, cardDb }}
            state={opp.stage.state === "RESTED" ? "rest" : "active"}
            motionDelay={refreshWave ? 0.18 : undefined}
          />
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
          isAttacker={attackerInstanceId === opp.leader.instanceId}
          counterPulse={counterPulseIds?.has(opp.leader.instanceId)}
          zoneKey="o-leader"
          style={{ position: "absolute", left: leaderLeft, top: oppLeaderTop }}
          animationDelay={refreshWave ? 0 : undefined}
          donCountAdjust={donCountAdjustments?.get(opp.leader.instanceId)}
          entering={arrivals.has(opp.leader.instanceId)}
        />
      ) : (
        <EmptySlot
          label="LDR"
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
            isAttacker={attackerInstanceId === char.instanceId}
            counterPulse={counterPulseIds?.has(char.instanceId)}
            zoneKey={`o-char-${i}`}
            style={{ position: "absolute", left: pos.left, top: oppCharTop }}
            animationDelay={refreshWave ? 0.03 * (i + 1) : undefined}
            donCountAdjust={donCountAdjustments?.get(char.instanceId)}
            entering={arrivals.has(char.instanceId)}
          />
        ) : (
          <EmptySlot
            key={`opp-c${i}`}
            label={`C${i + 1}`}
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
