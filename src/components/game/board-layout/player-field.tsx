"use client";

import { memo, useCallback } from "react";
import type {
  ActiveProhibition,
  CardDb,
  CardInstance,
  GameAction,
  PlayerState,
  TurnState,
} from "@shared/game-types";
import { hasRuntimeKeyword } from "@shared/effective-keyword";
import { isBlockerProhibited } from "@shared/blocker-prohibition";
import {
  matchesTargetFilter,
  type SharedTargetFilter,
  type SharedTargetFilterCard,
} from "@shared/target-filter";
import {
  computeEffectiveCost,
  useActiveEffects,
} from "@/contexts/active-effects-context";
import { useFieldArrivals } from "@/hooks/use-field-arrivals";
import { isCounterEvent } from "@/lib/game/counter-eligibility";
import { EmptySlot } from "./empty-slot";
import {
  SQUARE,
  SIDE_ZONE_GAP,
  FIELD_W,
  FIELD_H,
  CHAR_ROW_W,
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
  boardZoneKey,
} from "./board-geometry";
import { DonZone } from "./don-zone";
import { DeckPile } from "./deck-pile";
import { LifeZone } from "./life-zone";
import { DroppableCharSlot, DroppableOwnField, DroppableStageZone } from "./drop-zones";
import { PlayerFieldCard } from "./field-card";
import { DroppableTrashZone } from "./trash-zone";
import type { TargetCardSelectionState } from "@/lib/game/target-selection";
import type { PowerModPulse } from "@/hooks/use-power-modified-pulse";
import { useInteractionMode } from "./interaction-mode";

interface PlayerFieldProps {
  me: PlayerState | null;
  playerIndex: 0 | 1;
  bottomPlayerIndex: 0 | 1;
  owner: "me" | "opp";
  cardDb: CardDb;
  prohibitions?: ActiveProhibition[];
  activeDragType: string | null;
  activeDrag: DragPayload | null;
  refreshWave: boolean;
  canInteract: boolean;
  canActivateMain: boolean;
  oncePerTurnUsed?: TurnState["oncePerTurnUsed"];
  canDragCounter: boolean;
  inBlockStep: boolean;
  selectedBlockerId: string | null;
  setSelectedBlockerId: (id: string | null) => void;
  onAction: (action: GameAction) => void;
  onPreviewZone: (preview: { type: "deck" | "trash" | "life"; owner: "me" | "opp" }) => void;
  redistributeSourceIds?: Set<string>;
  pendingTransferDonIdsByCard?: Map<string, Set<string>>;
  donCountAdjustments?: Map<string, number>;
  attackerInstanceId?: string | null;
  attackerCard?: CardInstance | null;
  blockerAlreadyDeclared?: boolean;
  defenderInstanceId?: string | null;
  counterPulseIds?: Set<string>;
  winnerPulseIds?: Set<string>;
  powerModPulses?: ReadonlyMap<string, PowerModPulse>;
  effectsNegatedPulses?: ReadonlyMap<string, string>;
  attackRedirectedPulses?: ReadonlyMap<string, number>;
  lifeTriggerPulse?: boolean;
  lifeDamagePulseNonce?: number;
  lifeScriedPulseNonce?: number;
  /** Active arrivals keyed by anchor-derived bottom pile zone keys. */
  pileArrivingCounts?: ReadonlyMap<string, number>;
  targetSelectionById?: ReadonlyMap<string, TargetCardSelectionState>;
  onTargetToggle?: (instanceId: string) => void;
}

function PlayerFieldComponent({
  me,
  playerIndex,
  bottomPlayerIndex,
  owner,
  cardDb,
  prohibitions = [],
  activeDragType,
  activeDrag,
  refreshWave,
  canInteract,
  canActivateMain,
  oncePerTurnUsed,
  canDragCounter,
  inBlockStep,
  selectedBlockerId,
  setSelectedBlockerId,
  onAction,
  onPreviewZone,
  redistributeSourceIds,
  pendingTransferDonIdsByCard,
  donCountAdjustments,
  attackerInstanceId,
  attackerCard,
  blockerAlreadyDeclared = false,
  defenderInstanceId,
  counterPulseIds,
  winnerPulseIds,
  powerModPulses,
  effectsNegatedPulses,
  attackRedirectedPulses,
  lifeTriggerPulse,
  lifeDamagePulseNonce,
  lifeScriedPulseNonce,
  pileArrivingCounts,
  targetSelectionById,
  onTargetToggle,
}: PlayerFieldProps) {
  const interactionMode = useInteractionMode();
  const activeEffects = useActiveEffects();
  const attackerData = attackerCard ? cardDb[attackerCard.cardId] : undefined;
  const attackerUnblockable = attackerCard
    ? hasRuntimeKeyword(
        attackerCard.instanceId,
        attackerData?.keywords,
        activeEffects,
        "UNBLOCKABLE",
      )
    : false;
  const zoneKey = (zone: string) =>
    boardZoneKey(playerIndex, bottomPlayerIndex, zone);
  const handlePreviewLife = useCallback(
    () => onPreviewZone({ type: "life", owner }),
    [onPreviewZone, owner],
  );
  // Detect newly-arrived cards so the summon-entry pop plays on mount
  // (OPT-274). `useFieldArrivals` compares against the previous render's
  // instanceIds and seeds empty on the first render.
  const fieldIds: string[] = [];
  if (me?.leader) fieldIds.push(me.leader.instanceId);
  for (const c of me?.characters ?? []) {
    if (c) fieldIds.push(c.instanceId);
  }
  const arrivals = useFieldArrivals(fieldIds);
  const draggedHandData =
    activeDrag?.type === "hand-card" ? cardDb[activeDrag.card.cardId] : undefined;
  const eventFieldDropActive =
    draggedHandData?.type === "Event" &&
    (canInteract || (canDragCounter && isCounterEvent(draggedHandData)));
  const characterCounterDragActive =
    canDragCounter && draggedHandData?.type === "Character";
  const playSignalActive =
    activeDrag?.type !== "hand-card" || activeDrag.affordable !== false;

  return (
    <>
      <DroppableOwnField
        active={eventFieldDropActive}
        signalActive={eventFieldDropActive && playSignalActive}
        style={{ left: zone2Left, top: playerTop, width: CHAR_ROW_W, height: FIELD_H }}
      />

      {/* Zone 1 (left): Life */}
      <LifeZone
        life={me?.life ?? []}
        cardDb={cardDb}
        zoneKey={zoneKey("life")}
        sleeveUrl={me?.sleeveUrl}
        arrivingCount={pileArrivingCounts?.get(zoneKey("life"))}
        triggerPulse={lifeTriggerPulse}
        damagePulseNonce={lifeDamagePulseNonce}
        scryPulseNonce={lifeScriedPulseNonce}
        onInspect={me ? handlePreviewLife : undefined}
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
              activeDragType={activeDragType}
              draggedCardType={draggedHandData?.type}
              playSignalActive={playSignalActive}
              eventDropTarget={eventFieldDropActive}
              zoneKey={zoneKey(`char-${i}`)}
              style={{ position: "absolute", left: pos.left, top: playerCharTop }}
            />
          );
        }
        const charData = cardDb[char.cardId];
        const blockerProhibited = isBlockerProhibited(
          prohibitions,
          {
            instanceId: char.instanceId,
            controller: char.controller,
            cardType: charData?.type ?? "Character",
          },
          playerIndex,
          {
            matchesFilter: (filter) =>
              matchesBlockerFilter(
                char,
                charData,
                filter,
                activeEffects,
              ),
          },
        );
        const isBlockerEligible =
          interactionMode !== "spectator" &&
          inBlockStep &&
          !blockerAlreadyDeclared &&
          !attackerUnblockable &&
          !blockerProhibited &&
          char.state === "ACTIVE" &&
          hasRuntimeKeyword(
            char.instanceId,
            charData?.keywords,
            activeEffects,
            "BLOCKER",
          );
        return (
          <PlayerFieldCard
            key={`plr-c${i}`}
            card={char}
            cardDb={cardDb}
            activeDragType={activeDragType}
            draggedCardType={draggedHandData?.type}
            playSignalActive={playSignalActive}
            canAttack={canInteract && char.state === "ACTIVE"}
            blockerSelectable={isBlockerEligible}
            selected={selectedBlockerId === char.instanceId}
            isAttacker={attackerInstanceId === char.instanceId}
            isDefender={defenderInstanceId === char.instanceId}
            winnerPulse={winnerPulseIds?.has(char.instanceId)}
            powerMod={powerModPulses?.get(char.instanceId)}
            effectsNegatedPulseNonce={effectsNegatedPulses?.get(char.instanceId)}
            attackRedirectedPulseNonce={attackRedirectedPulses?.get(char.instanceId)}
            counterPulse={counterPulseIds?.has(char.instanceId)}
            canActivateMain={canActivateMain}
            oncePerTurnUsed={oncePerTurnUsed}
            targetSelection={targetSelectionById?.get(char.instanceId)}
            onTargetToggle={() => onTargetToggle?.(char.instanceId)}
            counterTarget={
              characterCounterDragActive && defenderInstanceId === char.instanceId
            }
            counterDragActive={characterCounterDragActive}
            eventDropTarget={eventFieldDropActive}
            onSelect={
              isBlockerEligible
                ? () => setSelectedBlockerId(
                    selectedBlockerId === char.instanceId ? null : char.instanceId,
                  )
                : undefined
            }
            onAction={onAction}
            zoneKey={zoneKey(`char-${i}`)}
            slotIndex={i}
            boardFull={(me?.characters.filter(Boolean).length ?? 0) >= 5}
            animationDelay={refreshWave ? 0.03 * (i + 1) : undefined}
            redistributeSource={redistributeSourceIds?.has(char.instanceId)}
            donArtUrl={me?.donArtUrl}
            pendingTransferDonIds={pendingTransferDonIdsByCard?.get(char.instanceId)}
            donCountAdjust={donCountAdjustments?.get(char.instanceId)}
            entering={arrivals.has(char.instanceId)}
            style={{ position: "absolute", left: pos.left, top: playerCharTop }}
          />
        );
      })}

      {/* Zone 2: Leader row — DON / LDR / STG */}
      <DonZone
        player={me}
        enableDrag={canInteract}
        zoneKey={zoneKey("don")}
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
          isDefender={defenderInstanceId === me.leader.instanceId}
          winnerPulse={winnerPulseIds?.has(me.leader.instanceId)}
          powerMod={powerModPulses?.get(me.leader.instanceId)}
          effectsNegatedPulseNonce={effectsNegatedPulses?.get(me.leader.instanceId)}
          attackRedirectedPulseNonce={attackRedirectedPulses?.get(me.leader.instanceId)}
          counterTarget={
            characterCounterDragActive && defenderInstanceId === me.leader.instanceId
          }
          eventDropTarget={eventFieldDropActive}
          counterPulse={counterPulseIds?.has(me.leader.instanceId)}
          canActivateMain={canActivateMain}
          oncePerTurnUsed={oncePerTurnUsed}
          targetSelection={targetSelectionById?.get(me.leader.instanceId)}
          onTargetToggle={() => onTargetToggle?.(me.leader.instanceId)}
          onAction={onAction}
          zoneKey={zoneKey("leader")}
          style={{ position: "absolute", left: leaderLeft, top: playerLeaderTop }}
          animationDelay={refreshWave ? 0 : undefined}
          redistributeSource={redistributeSourceIds?.has(me.leader.instanceId)}
          donArtUrl={me?.donArtUrl}
          pendingTransferDonIds={pendingTransferDonIdsByCard?.get(me.leader.instanceId)}
          donCountAdjust={donCountAdjustments?.get(me.leader.instanceId)}
          entering={arrivals.has(me.leader.instanceId)}
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
        draggedCardType={draggedHandData?.type}
        playSignalActive={playSignalActive}
        eventDropTarget={eventFieldDropActive}
        canActivateMain={canActivateMain}
        oncePerTurnUsed={oncePerTurnUsed}
        targetSelection={
          me?.stage ? targetSelectionById?.get(me.stage.instanceId) : undefined
        }
        onTargetToggle={() => {
          if (me?.stage) onTargetToggle?.(me.stage.instanceId);
        }}
        onAction={onAction}
        zoneKey={zoneKey("stage")}
        style={{ position: "absolute", left: zone2Right - stgDonWidth, top: playerLeaderTop, width: stgDonWidth, height: SQUARE }}
        animationDelay={refreshWave ? 0.18 : undefined}
      />

      {/* Zone 3 (right): Deck + Trash */}
      <DeckPile
        count={me?.deck.length ?? 0}
        arrivingCount={pileArrivingCounts?.get(zoneKey("deck"))}
        cardDb={cardDb}
        sleeveUrl={me?.sleeveUrl}
        zoneKey={zoneKey("deck")}
        style={{
          position: "absolute",
          left: FIELD_W - SQUARE + sideCardOffsetX,
          top: playerTop,
        }}
        onClick={
          me ? () => onPreviewZone({ type: "deck", owner }) : undefined
        }
      />
      <DroppableTrashZone
        trash={me?.trash ?? []}
        cardDb={cardDb}
        onClickTrash={me && me.trash.length > 0
          ? () => onPreviewZone({ type: "trash", owner })
          : undefined}
        zoneKey={zoneKey("trash")}
        arrivingCount={pileArrivingCounts?.get(zoneKey("trash"))}
        style={{
          position: "absolute",
          left: FIELD_W - SQUARE + sideCardOffsetX,
          top: playerTop + SQUARE + SIDE_ZONE_GAP,
        }}
      />
    </>
  );
}

export const PlayerField = memo(PlayerFieldComponent);
PlayerField.displayName = "PlayerField";

function matchesBlockerFilter(
  card: CardInstance,
  cardData: CardDb[string] | undefined,
  filter: SharedTargetFilter,
  activeEffects: ReturnType<typeof useActiveEffects>,
): boolean {
  const printedPower = card.basePower ?? cardData?.power ?? 0;
  const baseCost = cardData?.cost ?? 0;
  const effectiveCost = computeEffectiveCost(
    activeEffects,
    card.instanceId,
    baseCost,
  );
  const sharedCard: SharedTargetFilterCard = {
    controller: card.controller,
    cost: effectiveCost,
    baseCost,
    power: card.effectivePower ?? printedPower,
    basePower: printedPower,
    colors: cardData?.color ?? [],
    traits: cardData?.types ?? [],
    name: cardData?.name ?? card.cardId,
    attributes: cardData?.attribute ?? [],
    cardType: cardData?.type ?? "Character",
    state: card.state,
    attachedDonCount: card.attachedDon.length,
    instanceId: card.instanceId,
    hasTrigger: cardData?.keywords.trigger === true,
    hasEffect: Boolean(cardData?.effectText?.trim()),
    hasBaseEffect: Boolean(cardData?.effectText?.trim()),
    hasCounter: cardData?.counter != null,
    treatsAsAllNames: false,
    treatsAsAllTraits: false,
    treatsAsAllAttributes: false,
  };

  return matchesTargetFilter(sharedCard, filter, {
    getEffectiveCost: () => effectiveCost,
    getEffectivePower: () => card.effectivePower ?? printedPower,
    hasKeyword: (_candidate, keyword) =>
      isKeywordName(keyword) &&
      hasRuntimeKeyword(
        card.instanceId,
        cardData?.keywords,
        activeEffects,
        keyword,
      ),
  });
}

function isKeywordName(
  keyword: string,
): keyword is Parameters<typeof hasRuntimeKeyword>[3] {
  return [
    "BLOCKER",
    "RUSH",
    "RUSH_CHARACTER",
    "DOUBLE_ATTACK",
    "UNBLOCKABLE",
    "BANISH",
    "TRIGGER",
  ].includes(keyword);
}
