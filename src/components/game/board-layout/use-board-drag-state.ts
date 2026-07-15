"use client";

import { useReducedMotion } from "motion/react";
import type { CardDb, GameAction, TurnState } from "@shared/game-types";
import { useDragTilt } from "@/hooks/use-drag-tilt";
import { useBoardDnd } from "./use-board-dnd";

interface UseBoardDragStateOptions {
  cardDb: CardDb;
  battle: TurnState["battle"] | null;
  onAction: (action: GameAction) => void;
  onRedistributeDrop: (
    fromCardId: string,
    donId: string,
    toCardId: string
  ) => void;
  onHandReorder: (activeInstanceId: string, overInstanceId: string) => void;
  disabled: boolean;
  boardScale: number;
  outerScale: number;
}

export function getDragOverlayScale(
  boardScale: number,
  outerScale: number
): number {
  return outerScale * boardScale;
}

/** Owns the complete dnd-kit runtime contract for the board: active payload,
 * sensors, action routing, reduced-motion tilt, and escaped-overlay scaling. */
export function useBoardDragState({
  cardDb,
  battle,
  onAction,
  onRedistributeDrop,
  onHandReorder,
  disabled,
  boardScale,
  outerScale,
}: UseBoardDragStateOptions) {
  const dnd = useBoardDnd(
    cardDb,
    battle,
    onAction,
    onRedistributeDrop,
    onHandReorder,
    disabled
  );
  const reducedMotion = useReducedMotion();
  const tilt = useDragTilt({ disabled: !!reducedMotion });

  return {
    ...dnd,
    overlayScale: getDragOverlayScale(boardScale, outerScale),
    tiltX: tilt.tiltX,
    tiltY: tilt.tiltY,
    handleDragStart(event: Parameters<typeof dnd.handleDragStart>[0]) {
      dnd.handleDragStart(event);
      tilt.handleDragStart(event);
    },
    handleDragMove: tilt.handleDragMove,
    handleDragEnd(event: Parameters<typeof dnd.handleDragEnd>[0]) {
      dnd.handleDragEnd(event);
      tilt.handleDragEnd(event);
    },
    handleDragCancel(event: Parameters<typeof tilt.handleDragEnd>[0]) {
      dnd.handleDragCancel();
      tilt.handleDragEnd(event);
    },
  };
}
