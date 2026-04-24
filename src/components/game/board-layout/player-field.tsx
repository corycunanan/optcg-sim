"use client";

import type { CardDb, GameAction, PlayerState, TurnState } from "@shared/game-types";
import { Card } from "../card";
import { EmptySlot } from "./empty-slot";
import {
  SQUARE,
  SIDE_ZONE_GAP,
  FIELD_W,
  type DragPayload,
} from "./constants";
import {
  zone2Left,
  zone2Right,
  playerTop,
  playerCharTop,
  playerLeaderTop,
  charSlotCenters,
  leaderLeft,
  stgDonWidth,
  sideCardOffsetX,
} from "./board-geometry";
import { DonZone } from "./don-zone";
import { LifeZone } from "./life-zone";
import { DroppableCharSlot, DroppableStageZone } from "./drop-zones";
import { PlayerFieldCard } from "./field-card";
import { DroppableTrashZone } from "./trash-zone";
import { ZoneRef } from "./zone-ref";

interface PlayerFieldProps {
  me: PlayerState | null;
  cardDb: CardDb;
  activeDragType: string | null;
  activeDrag: DragPayload | null;
  turn: TurnState | null;
  refreshWave: boolean;
  canInteract: boolean;
  canDragCounter: boolean;
  inBlockStep: boolean;
  selectedBlockerId: string | null;
  setSelectedBlockerId: (id: string | null) => void;
  onAction: (action: GameAction) => void;
  onPreviewZone: (preview: { type: "deck" | "trash"; owner: "me" }) => void;
  redistributeSourceIds?: Set<string>;
  pendingTransferDonIdsByCard?: Map<string, Set<string>>;
  donCountAdjustments?: Map<string, number>;
  attackerInstanceId?: string | null;
  counterPulseIds?: Set<string>;
}

export function PlayerField({
  me,
  cardDb,
  activeDragType,
  activeDrag,
  turn,
  refreshWave,
  canInteract,
  inBlockStep,
  selectedBlockerId,
  setSelectedBlockerId,
  onAction,
  onPreviewZone,
  redistributeSourceIds,
  pendingTransferDonIdsByCard,
  donCountAdjustments,
  attackerInstanceId,
  counterPulseIds,
}: PlayerFieldProps) {
  return (
    <>
      {/* Zone 1 (left): Life */}
      <LifeZone
        life={me?.life ?? []}
        cardDb={cardDb}
        zoneKey="p-life"
        sleeveUrl={me?.sleeveUrl}
        style={{ position: "absolute", left: sideCardOffsetX, top: playerTop }}
      />

      {/* Zone 2: Character row */}
      {charSlotCenters.map((pos, i) => {
        const char = me?.characters[i] ?? null;
        if (!char) {
          return (
            <DroppableCharSlot
              key={`plr-c${i}`}
              slotIndex={i}
              label={`C${i + 1}`}
              cardDb={cardDb}
              activeDragType={activeDragType}
              zoneKey={`p-char-${i}`}
              style={{ position: "absolute", left: pos.left, top: playerCharTop }}
            />
          );
        }
        const charData = cardDb[char.cardId];
        const isBlockerEligible = inBlockStep && char.state === "ACTIVE" && !!charData?.keywords?.blocker;
        return (
          <PlayerFieldCard
            key={`plr-c${i}`}
            card={char}
            cardDb={cardDb}
            activeDragType={activeDragType}
            canAttack={canInteract && char.state === "ACTIVE"}
            blockerSelectable={isBlockerEligible}
            selected={selectedBlockerId === char.instanceId}
            isAttacker={attackerInstanceId === char.instanceId}
            counterPulse={counterPulseIds?.has(char.instanceId)}
            onSelect={isBlockerEligible ? () => setSelectedBlockerId(char.instanceId) : undefined}
            onAction={onAction}
            zoneKey={`p-char-${i}`}
            slotIndex={i}
            boardFull={(me?.characters.filter(Boolean).length ?? 0) >= 5}
            animationDelay={refreshWave ? 0.03 * (i + 1) : undefined}
            redistributeSource={redistributeSourceIds?.has(char.instanceId)}
            pendingTransferDonIds={pendingTransferDonIdsByCard?.get(char.instanceId)}
            donCountAdjust={donCountAdjustments?.get(char.instanceId)}
            style={{ position: "absolute", left: pos.left, top: playerCharTop }}
          />
        );
      })}

      {/* Zone 2: Leader row — DON / LDR / STG */}
      <DonZone
        player={me}
        enableDrag={canInteract}
        zoneKey="p-don"
        donArtUrl={me?.donArtUrl}
        style={{ left: zone2Left, top: playerLeaderTop, width: stgDonWidth, height: SQUARE }}
        animationDelay={refreshWave ? 0.2 : undefined}
      />

      {me?.leader ? (
        <PlayerFieldCard
          card={me.leader}
          cardDb={cardDb}
          activeDragType={activeDragType}
          canAttack={canInteract && me.leader.state === "ACTIVE"}
          isAttacker={attackerInstanceId === me.leader.instanceId}
          counterPulse={counterPulseIds?.has(me.leader.instanceId)}
          onAction={onAction}
          zoneKey="p-leader"
          style={{ position: "absolute", left: leaderLeft, top: playerLeaderTop }}
          animationDelay={refreshWave ? 0 : undefined}
          redistributeSource={redistributeSourceIds?.has(me.leader.instanceId)}
          pendingTransferDonIds={pendingTransferDonIdsByCard?.get(me.leader.instanceId)}
          donCountAdjust={donCountAdjustments?.get(me.leader.instanceId)}
        />
      ) : (
        <EmptySlot
          label="LDR"
          style={{ position: "absolute", left: leaderLeft, top: playerLeaderTop }}
        />
      )}

      <DroppableStageZone
        card={me?.stage ?? null}
        cardDb={cardDb}
        activeDragType={activeDragType}
        onAction={onAction}
        zoneKey="p-stage"
        style={{ position: "absolute", left: zone2Right - stgDonWidth, top: playerLeaderTop, width: stgDonWidth, height: SQUARE }}
        animationDelay={refreshWave ? 0.18 : undefined}
      />

      {/* Zone 3 (right): Deck + Trash */}
      <ZoneRef zoneKey="p-deck" style={{ position: "absolute", left: FIELD_W - SQUARE + sideCardOffsetX, top: playerTop }}>
        <Card
          variant="trash"
          data={{ cardDb }}
          faceDown
          sleeveUrl={me?.sleeveUrl}
          overlays={{ countBadge: me?.deck.length, label: "DECK" }}
          interaction={{ clickable: !!me }}
          onClick={() => me && onPreviewZone({ type: "deck", owner: "me" })}
        />
      </ZoneRef>
      <DroppableTrashZone
        trash={me?.trash ?? []}
        cardDb={cardDb}
        activeDrag={activeDrag}
        battleSubPhase={turn?.battleSubPhase ?? null}
        onClickTrash={() => me && me.trash.length > 0 && onPreviewZone({ type: "trash", owner: "me" })}
        zoneKey="p-trash"
        style={{ position: "absolute", left: FIELD_W - SQUARE + sideCardOffsetX, top: playerTop + SQUARE + SIDE_ZONE_GAP }}
      />
    </>
  );
}
