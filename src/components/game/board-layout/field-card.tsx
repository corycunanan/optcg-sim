"use client";

import React, { useCallback, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui";
import { BoardCard } from "../board-card";
import { BOARD_CARD_W, BOARD_CARD_H, type AttackerDrag } from "./constants";
import { CardActionMenuContent } from "../card-action-menu";

export const DroppableCharSlot = React.memo(function DroppableCharSlot({
  slotIndex,
  label,
  cardDb,
  activeDragType,
  style,
}: {
  slotIndex: number;
  label: string;
  cardDb: CardDb;
  activeDragType: string | null;
  style: React.CSSProperties;
}) {
  const accepts = activeDragType === "hand-card";
  const { setNodeRef, isOver } = useDroppable({
    id: `char-slot-${slotIndex}`,
    data: { type: "character-slot", slotIndex },
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md transition-shadow",
        accepts && "ring-2 ring-gb-accent-blue/30",
        isOver && accepts && "ring-2 ring-gb-accent-green",
      )}
    >
      <BoardCard
        cardDb={cardDb}
        empty
        label={label}
        width={BOARD_CARD_W}
        height={BOARD_CARD_H}
      />
    </div>
  );
});

export const PlayerFieldCard = React.memo(function PlayerFieldCard({
  card,
  cardDb,
  activeDragType,
  canAttack,
  blockerSelectable,
  selected,
  onSelect,
  onAction,
  style,
}: {
  card: CardInstance;
  cardDb: CardDb;
  activeDragType: string | null;
  canAttack: boolean;
  blockerSelectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onAction?: (action: GameAction) => void;
  style: React.CSSProperties;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `attacker-${card.instanceId}`,
    data: { type: "attacker", card } satisfies AttackerDrag,
    disabled: !canAttack,
  });

  const acceptsDon = activeDragType === "active-don";
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `don-target-${card.instanceId}`,
    data: { type: "don-target", targetInstanceId: card.instanceId },
  });

  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(true);
    },
    [],
  );

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <div
          ref={mergedRef}
          {...attributes}
          {...listeners}
          onClick={onSelect}
          onContextMenu={handleContextMenu}
          style={{
            ...style,
            opacity: isDragging ? 0.3 : 1,
            cursor: canAttack ? "grab" : blockerSelectable ? "pointer" : "default",
          }}
          className={cn(
            "rounded-md transition-shadow",
            acceptsDon && "ring-2 ring-gb-accent-amber/30",
            isOver && acceptsDon && "ring-2 ring-gb-accent-amber",
            selected && "ring-2 ring-gb-accent-green shadow-[0_0_10px_var(--gb-accent-green)]",
            blockerSelectable && !selected && "ring-2 ring-gb-accent-blue/40",
          )}
        >
          <BoardCard
            card={card}
            cardDb={cardDb}
            width={BOARD_CARD_W}
            height={BOARD_CARD_H}
          />
        </div>
      </DropdownMenuTrigger>

      {onAction && (
        <CardActionMenuContent
          card={card}
          cardDb={cardDb}
          onAction={onAction}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </DropdownMenu>
  );
});

export const OpponentFieldCard = React.memo(function OpponentFieldCard({
  card,
  cardDb,
  activeDragType,
  style,
}: {
  card: CardInstance;
  cardDb: CardDb;
  activeDragType: string | null;
  style: React.CSSProperties;
}) {
  const accepts = activeDragType === "attacker";
  const { setNodeRef, isOver } = useDroppable({
    id: `attack-target-${card.instanceId}`,
    data: { type: "attack-target", targetInstanceId: card.instanceId },
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md",
        accepts && "ring-2 ring-gb-accent-red/30",
        isOver && accepts && "ring-2 ring-gb-accent-red",
      )}
    >
      <BoardCard
        card={card}
        cardDb={cardDb}
        width={BOARD_CARD_W}
        height={BOARD_CARD_H}
      />
    </div>
  );
});
