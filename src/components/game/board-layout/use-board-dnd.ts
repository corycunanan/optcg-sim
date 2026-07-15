"use client";

import { useMemo, useState } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  Announcements,
  DragEndEvent,
  DragStartEvent,
  ScreenReaderInstructions,
} from "@dnd-kit/core";
import type { CardDb, GameAction, TurnState } from "@shared/game-types";
import { isCounterEvent } from "@/lib/game/counter-eligibility";
import type { DragPayload } from "./constants";
import { boardKeyboardCoordinates } from "./board-keyboard-coordinates";

type BoardDropData = {
  type?: unknown;
  slotIndex?: unknown;
  targetInstanceId?: unknown;
  card?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoardDropData(value: unknown): value is BoardDropData {
  return isRecord(value);
}

function isDragPayload(value: unknown): value is DragPayload {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "hand-card":
    case "attacker":
      return isRecord(value.card);
    case "active-don":
      return isRecord(value.don);
    case "redistribute-don":
      return (
        isRecord(value.don) && typeof value.fromCardInstanceId === "string"
      );
    default:
      return false;
  }
}

const OWN_FIELD_DROP_TYPES = new Set([
  "own-field",
  "character-slot",
  "stage-zone",
  "don-target",
]);

const boardScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "To pick up a card, press Enter or Space. While dragging, use the arrow keys to move between legal targets. Press Enter or Space again to drop, or Escape to cancel.",
};

export function describeBoardDrag(
  dragData: DragPayload,
  cardDb: CardDb
): string {
  switch (dragData.type) {
    case "hand-card":
    case "attacker":
      return cardDb[dragData.card.cardId]?.name ?? "card";
    case "active-don":
      return "active DON";
    case "redistribute-don":
      return "attached DON";
  }
}

export function describeBoardDrop(dropData: BoardDropData | undefined): string {
  switch (dropData?.type) {
    case "character-slot":
      return `character slot ${Number(dropData.slotIndex) + 1}`;
    case "stage-zone":
      return "stage zone";
    case "own-field":
      return "your field";
    case "counter-target":
      return "the defending card";
    case "don-target":
      return "a DON attachment target";
    case "attack-target":
      return "an attack target";
    case "hand-card":
      return "another position in your hand";
    default:
      return "a legal target";
  }
}

/** Resolve hand-card gestures independently from dnd-kit so the interaction
 * grammar is testable as a dispatch contract. Events use the broad own-field
 * surface; Character counters affect only the current defender. */
export function resolveHandCardDropAction(
  dragData: Extract<DragPayload, { type: "hand-card" }>,
  dropData: BoardDropData,
  cardDb: CardDb,
  battle: TurnState["battle"] | null
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
  onRedistributeDrop?: (
    fromCardId: string,
    donId: string,
    toCardId: string
  ) => void,
  onHandReorder?: (activeInstanceId: string, overInstanceId: string) => void,
  /** When true, drop handlers are no-ops. Sandbox spectator/responseOnly
   *  modes (OPT-290) pass this so that a stray drag can't fire an action.
   *  The drag start still tracks `activeDrag` so DragOverlay rendering stays
   *  consistent — only the resolution is suppressed. */
  disabled = false
) {
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates })
  );

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart({ active }) {
        const dragData = active.data.current;
        if (!isDragPayload(dragData)) return "Unknown item picked up.";
        return `${describeBoardDrag(dragData, cardDb)} picked up.`;
      },
      onDragOver({ active, over }) {
        if (!over) return "No legal drop target.";
        const dragData = active.data.current;
        if (!isDragPayload(dragData)) return "Unknown item is being dragged.";
        if (over.id === active.id) {
          return `${describeBoardDrag(dragData, cardDb)} remains at its current position.`;
        }
        return `${describeBoardDrag(dragData, cardDb)} is over ${describeBoardDrop(over.data.current)}.`;
      },
      onDragEnd({ active, over }) {
        const dragData = active.data.current;
        if (!isDragPayload(dragData)) return "Unknown item was not moved.";
        return over && over.id !== active.id
          ? `${describeBoardDrag(dragData, cardDb)} dropped on ${describeBoardDrop(over.data.current)}.`
          : `${describeBoardDrag(dragData, cardDb)} was not moved.`;
      },
      onDragCancel({ active }) {
        const dragData = active.data.current;
        if (!isDragPayload(dragData)) return "Unknown item drag canceled.";
        return `${describeBoardDrag(dragData, cardDb)} drag canceled.`;
      },
    }),
    [cardDb]
  );

  function handleDragStart(event: DragStartEvent) {
    const dragData = event.active.data.current;
    setActiveDrag(isDragPayload(dragData) ? dragData : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);
    if (disabled) return;
    if (!over) return;

    const dragData = active.data.current;
    const dropData = isBoardDropData(over.data.current)
      ? over.data.current
      : undefined;
    if (!isDragPayload(dragData)) return;

    // Hand-card reorder: sortable reports the target hand card via over.data.
    // Only fires when active.id !== over.id (dropping on self is a no-op).
    if (
      dragData.type === "hand-card" &&
      dropData?.type === "hand-card" &&
      active.id !== over.id &&
      isRecord(dropData.card) &&
      typeof dropData.card.instanceId === "string"
    ) {
      onHandReorder?.(dragData.card.instanceId, dropData.card.instanceId);
      return;
    }

    if (!dropData) return;

    if (dragData.type === "hand-card") {
      const action = resolveHandCardDropAction(
        dragData,
        dropData,
        cardDb,
        battle
      );
      if (action) onAction(action);
      return;
    }

    if (
      dragData.type === "active-don" &&
      dropData.type === "don-target" &&
      typeof dropData.targetInstanceId === "string"
    ) {
      onAction({
        type: "ATTACH_DON",
        targetInstanceId: dropData.targetInstanceId,
        count: 1,
      });
    } else if (
      dragData.type === "redistribute-don" &&
      dropData.type === "don-target" &&
      typeof dropData.targetInstanceId === "string"
    ) {
      onRedistributeDrop?.(
        dragData.fromCardInstanceId,
        dragData.don.instanceId,
        dropData.targetInstanceId
      );
    } else if (
      dragData.type === "attacker" &&
      dropData.type === "attack-target" &&
      typeof dropData.targetInstanceId === "string"
    ) {
      onAction({
        type: "DECLARE_ATTACK",
        attackerInstanceId: dragData.card.instanceId,
        targetInstanceId: dropData.targetInstanceId,
      });
    }
  }

  function handleDragCancel() {
    setActiveDrag(null);
  }

  return {
    activeDrag,
    activeDragType: activeDrag?.type ?? null,
    sensors,
    accessibility: {
      announcements,
      screenReaderInstructions: boardScreenReaderInstructions,
    },
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}
