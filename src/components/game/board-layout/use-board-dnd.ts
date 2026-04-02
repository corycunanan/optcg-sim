"use client";

import { useState } from "react";
import {
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { CardDb, GameAction, TurnState } from "@shared/game-types";
import type { DragPayload } from "./constants";

export function useBoardDnd(
  cardDb: CardDb,
  battle: TurnState["battle"] | null,
  onAction: (action: GameAction) => void,
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
    if (!over) return;

    const dragData = active.data.current as DragPayload;
    const dropData = over.data.current as Record<string, unknown>;

    if (dragData.type === "hand-card" && dropData.type === "character-slot") {
      onAction({
        type: "PLAY_CARD",
        cardInstanceId: dragData.card.instanceId,
        position: dropData.slotIndex as number,
      });
    } else if (
      dragData.type === "active-don" &&
      dropData.type === "don-target"
    ) {
      onAction({
        type: "ATTACH_DON",
        targetInstanceId: dropData.targetInstanceId as string,
        count: 1,
      });
    } else if (
      dragData.type === "attacker" &&
      dropData.type === "attack-target"
    ) {
      onAction({
        type: "DECLARE_ATTACK",
        attackerInstanceId: dragData.card.instanceId,
        targetInstanceId: dropData.targetInstanceId as string,
      });
    } else if (
      dragData.type === "hand-card" &&
      dropData.type === "counter-trash" &&
      battle
    ) {
      const cardData = cardDb[dragData.card.cardId];
      if (cardData?.type === "Character" && cardData.counter != null && cardData.counter > 0) {
        onAction({
          type: "USE_COUNTER",
          cardInstanceId: dragData.card.instanceId,
          counterTargetInstanceId: battle.targetInstanceId,
        });
      } else if (cardData?.type === "Event" && cardData.effectText?.includes("[Counter]")) {
        onAction({
          type: "USE_COUNTER_EVENT",
          cardInstanceId: dragData.card.instanceId,
          counterTargetInstanceId: battle.targetInstanceId,
        });
      }
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
