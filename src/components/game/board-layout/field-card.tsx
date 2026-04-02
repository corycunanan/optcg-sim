"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { cardHover, cardTap } from "@/lib/motion";
import { useZonePosition } from "@/contexts/zone-position-context";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui";
import { BoardCard } from "../board-card";
import { SQUARE, BOARD_CARD_W, BOARD_CARD_H, type AttackerDrag } from "./constants";
import { CardActionMenuContent } from "../card-action-menu";

/** Colored overlay that sits behind the card in a zone during drag. */
function DropOverlay({
  active,
  hovered,
  color,
}: {
  active: boolean;
  hovered: boolean;
  color: "blue" | "amber" | "red" | "green";
}) {
  if (!active) return null;

  const colorMap = {
    blue: "bg-gb-accent-blue/25",
    amber: "bg-gb-accent-amber/25",
    red: "bg-gb-accent-red/25",
    green: "bg-gb-accent-green/25",
  };

  const hoveredColorMap = {
    blue: "bg-gb-accent-blue/50",
    amber: "bg-gb-accent-amber/50",
    red: "bg-gb-accent-red/50",
    green: "bg-gb-accent-green/50",
  };

  return (
    <div
      className={cn(
        "absolute inset-0 z-0 rounded-md transition-colors",
        hovered ? hoveredColorMap[color] : colorMap[color],
        hovered && "animate-pulse",
      )}
    />
  );
}

export const DroppableCharSlot = React.memo(function DroppableCharSlot({
  slotIndex,
  label,
  cardDb,
  activeDragType,
  zoneKey,
  style,
}: {
  slotIndex: number;
  label: string;
  cardDb: CardDb;
  activeDragType: string | null;
  zoneKey?: string;
  style: React.CSSProperties;
}) {
  const accepts = activeDragType === "hand-card";
  const { setNodeRef, isOver } = useDroppable({
    id: `char-slot-${slotIndex}`,
    data: { type: "character-slot", slotIndex },
  });

  const zonePos = useZonePosition();
  const slotRef = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      if (zoneKey) {
        if (node) zonePos.register(zoneKey, node);
        else zonePos.unregister(zoneKey);
      }
    },
    [setNodeRef, zoneKey, zonePos],
  );

  return (
    <div
      ref={slotRef}
      style={{ ...style, width: SQUARE, height: SQUARE }}
      className="relative flex items-center justify-center rounded-md"
    >
      <DropOverlay active={accepts} hovered={isOver && accepts} color="blue" />
      <BoardCard
        cardDb={cardDb}
        empty
        label={label}
        width={BOARD_CARD_W}
        height={BOARD_CARD_H}
        className="relative z-[1]"
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
  zoneKey,
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
  zoneKey?: string;
  style: React.CSSProperties;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const zonePos = useZonePosition();

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
      if (zoneKey) {
        if (node) {
          zonePos.register(zoneKey, node);
          zonePos.registerCard(card.instanceId, zoneKey);
        } else {
          zonePos.unregister(zoneKey);
          zonePos.unregisterCard(card.instanceId);
        }
      }
    },
    [setDragRef, setDropRef, zoneKey, zonePos, card.instanceId],
  );

  // Keep card→zone mapping up to date if instanceId changes while mounted
  useEffect(() => {
    if (zoneKey) zonePos.registerCard(card.instanceId, zoneKey);
    return () => { zonePos.unregisterCard(card.instanceId); };
  }, [card.instanceId, zoneKey, zonePos]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(true);
    },
    [],
  );

  const skipMotion = reducedMotion || isDragging;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={(open) => { if (!open) setMenuOpen(false); }}>
      <DropdownMenuTrigger asChild>
        <motion.div
          ref={mergedRef}
          {...attributes}
          {...listeners}
          onClick={onSelect}
          onContextMenu={handleContextMenu}
          whileHover={skipMotion ? undefined : cardHover}
          whileTap={skipMotion ? undefined : cardTap}
          style={{
            ...style,
            width: SQUARE,
            height: SQUARE,
            opacity: isDragging ? 0.3 : 1,
            cursor: canAttack ? "grab" : blockerSelectable ? "pointer" : "default",
          }}
          className={cn(
            "relative flex items-center justify-center rounded-md transition-shadow",
            selected && "ring-2 ring-gb-accent-green shadow-[0_0_10px_var(--gb-accent-green)]",
            blockerSelectable && !selected && "ring-2 ring-gb-accent-blue/40",
          )}
        >
          <DropOverlay active={acceptsDon} hovered={isOver && acceptsDon} color="amber" />
          <BoardCard
            card={card}
            cardDb={cardDb}
            width={BOARD_CARD_W}
            height={BOARD_CARD_H}
            className="relative z-[1]"
          />
        </motion.div>
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
  zoneKey,
  style,
}: {
  card: CardInstance;
  cardDb: CardDb;
  activeDragType: string | null;
  zoneKey?: string;
  style: React.CSSProperties;
}) {
  const reducedMotion = useReducedMotion();
  const zonePos = useZonePosition();
  const accepts = activeDragType === "attacker";
  const { setNodeRef, isOver } = useDroppable({
    id: `attack-target-${card.instanceId}`,
    data: { type: "attack-target", targetInstanceId: card.instanceId },
  });

  const ref = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      if (zoneKey) {
        if (node) {
          zonePos.register(zoneKey, node);
          zonePos.registerCard(card.instanceId, zoneKey);
        } else {
          zonePos.unregister(zoneKey);
          zonePos.unregisterCard(card.instanceId);
        }
      }
    },
    [setNodeRef, zoneKey, zonePos, card.instanceId],
  );

  // Keep card→zone mapping up to date if instanceId changes while mounted
  useEffect(() => {
    if (zoneKey) zonePos.registerCard(card.instanceId, zoneKey);
    return () => { zonePos.unregisterCard(card.instanceId); };
  }, [card.instanceId, zoneKey, zonePos]);

  return (
    <motion.div
      ref={ref}
      whileHover={reducedMotion ? undefined : cardHover}
      style={{ ...style, width: SQUARE, height: SQUARE }}
      className="relative flex items-center justify-center rounded-md"
    >
      <DropOverlay active={accepts} hovered={isOver && accepts} color="red" />
      <BoardCard
        card={card}
        cardDb={cardDb}
        width={BOARD_CARD_W}
        height={BOARD_CARD_H}
        className="relative z-[1]"
      />
    </motion.div>
  );
});
