"use client";

import { useState } from "react";
import {
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { CardDb, GameAction, TurnState } from "@shared/game-types";
import { isCounterEvent } from "@/lib/game/counter-eligibility";
import type { DragPayload } from "./constants";

type BoardDropData = {
  type?: unknown;
  slotIndex?: unknown;
  targetInstanceId?: unknown;
};

const OWN_FIELD_DROP_TYPES = new Set([
  "own-field",
  "character-slot",
  "stage-zone",
  "don-target",
]);

/** Resolve hand-card gestures independently from dnd-kit so the interaction
 * grammar is testable as a dispatch contract. Events use the broad own-field
 * surface; Character counters affect only the current defender. */
export function resolveHandCardDropAction(
  dragData: Extract<DragPayload, { type: "hand-card" }>,
  dropData: BoardDropData,
  cardDb: CardDb,
  battle: TurnState["battle"] | null,
): GameAction | null {
  const cardData = cardDb[dragData.card.cardId];
  if (!cardData || typeof dropData.type !== "string") return null;

  if (cardData.type === "Event" && OWN_FIELD_DROP_TYPES.has(dropData.type)) {
    if (battle && isCounterEvent(cardData)) {
      return {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: dragData.card.instanceId,
        counterTargetInstanceId: battle.targetInstanceId,
      };
    }
    if (!battle) {
      return {
        type: "PLAY_CARD",
        cardInstanceId: dragData.card.instanceId,
      };
    }
    return null;
  }

  if (
    cardData.type === "Character" &&
    dropData.type === "counter-target" &&
    battle &&
    dropData.targetInstanceId === battle.targetInstanceId
  ) {
    return {
      type: "USE_COUNTER",
      cardInstanceId: dragData.card.instanceId,
      counterTargetInstanceId: battle.targetInstanceId,
    };
  }

  if (
    cardData.type === "Character" &&
    dropData.type === "character-slot" &&
    typeof dropData.slotIndex === "number"
  ) {
    return {
      type: "PLAY_CARD",
      cardInstanceId: dragData.card.instanceId,
      position: dropData.slotIndex,
    };
  }

  if (cardData.type === "Stage" && dropData.type === "stage-zone") {
    return {
      type: "PLAY_CARD",
      cardInstanceId: dragData.card.instanceId,
    };
  }

  return null;
}

export function useBoardDnd(
  cardDb: CardDb,
  battle: TurnState["battle"] | null,
  onAction: (action: GameAction) => void,
  onRedistributeDrop?: (fromCardId: string, donId: string, toCardId: string) => void,
  onHandReorder?: (activeInstanceId: string, overInstanceId: string) => void,
  /** When true, drop handlers are no-ops. Sandbox spectator/responseOnly
   *  modes (OPT-290) pass this so that a stray drag can't fire an action.
   *  The drag start still tracks `activeDrag` so DragOverlay rendering stays
   *  consistent — only the resolution is suppressed. */
  disabled = false,
) {
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag(event.active.data.current as DragPayload);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);
    if (disabled) return;
    if (!over) return;

    const dragData = active.data.current as DragPayload;
    const dropData = over.data.current as BoardDropData | undefined;

    // Hand-card reorder: sortable reports the target hand card via over.data.
    // Only fires when active.id !== over.id (dropping on self is a no-op).
    if (
      dragData.type === "hand-card" &&
      dropData?.type === "hand-card" &&
      active.id !== over.id
    ) {
      const overCard = (dropData as unknown as { card: { instanceId: string } }).card;
      onHandReorder?.(dragData.card.instanceId, overCard.instanceId);
      return;
    }

    if (!dropData) return;

    if (dragData.type === "hand-card") {
      const action = resolveHandCardDropAction(dragData, dropData, cardDb, battle);
      if (action) onAction(action);
      return;
    }

    if (
      dragData.type === "active-don" &&
      dropData.type === "don-target"
    ) {
      onAction({
        type: "ATTACH_DON",
        targetInstanceId: dropData.targetInstanceId as string,
        count: 1,
      });
    } else if (
      dragData.type === "redistribute-don" &&
      dropData.type === "don-target"
    ) {
      onRedistributeDrop?.(
        dragData.fromCardInstanceId,
        dragData.don.instanceId,
        dropData.targetInstanceId as string,
      );
    } else if (
      dragData.type === "attacker" &&
      dropData.type === "attack-target"
    ) {
      onAction({
        type: "DECLARE_ATTACK",
        attackerInstanceId: dragData.card.instanceId,
        targetInstanceId: dropData.targetInstanceId as string,
      });
    }
  }

  return {
    activeDrag,
    activeDragType: activeDrag?.type ?? null,
    sensors,
    handleDragStart,
    handleDragEnd,
  };
}
