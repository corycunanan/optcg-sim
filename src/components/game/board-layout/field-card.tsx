"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { cardHover, cardTap, cardRest, cardActivate } from "@/lib/motion";
import { useZonePosition } from "@/contexts/zone-position-context";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui";
import { BoardCard } from "../board-card";
import { SQUARE, BOARD_CARD_W, BOARD_CARD_H, type AttackerDrag, type RedistributeDonDrag } from "./constants";
import { CardActionMenuContent } from "../card-action-menu";
import { DropOverlay } from "./drop-zones";

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
  slotIndex,
  boardFull,
  style,
  animationDelay,
  redistributeSource,
  pendingTransferDonIds,
  donCountAdjust,
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
  slotIndex?: number;
  boardFull?: boolean;
  style: React.CSSProperties;
  animationDelay?: number;
  redistributeSource?: boolean;
  pendingTransferDonIds?: Set<string>;
  donCountAdjust?: number;
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

  const acceptsDon = activeDragType === "active-don" || activeDragType === "redistribute-don";

  const firstDon = pendingTransferDonIds
    ? card.attachedDon.find((d) => !pendingTransferDonIds.has(d.instanceId))
    : card.attachedDon[0];
  const canRedistribute = !!redistributeSource && !!firstDon;
  const {
    attributes: donAttributes,
    listeners: donListeners,
    setNodeRef: setDonDragRef,
    isDragging: isDonDragging,
  } = useDraggable({
    id: `redistribute-don-${card.instanceId}`,
    data: firstDon
      ? ({
          type: "redistribute-don",
          don: firstDon,
          fromCardInstanceId: card.instanceId,
        } satisfies RedistributeDonDrag)
      : undefined,
    disabled: !canRedistribute,
  });
  const acceptsHandCard = !!boardFull && activeDragType === "hand-card";
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: acceptsHandCard ? `char-slot-${slotIndex}` : `don-target-${card.instanceId}`,
    data: acceptsHandCard
      ? { type: "character-slot", slotIndex }
      : { type: "don-target", targetInstanceId: card.instanceId },
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
          animate={{
            rotate: card.state === "RESTED" ? 90 : 0,
            opacity: isDragging ? 0.3 : 1,
            filter: card.state === "RESTED" ? "brightness(0.6)" : "brightness(1)",
          }}
          transition={{
            ...(card.state === "RESTED" ? cardRest : cardActivate),
            delay: animationDelay ?? 0,
          }}
          whileHover={skipMotion ? undefined : cardHover}
          whileTap={skipMotion ? undefined : cardTap}
          style={{
            ...style,
            width: SQUARE,
            height: SQUARE,
            cursor: canAttack ? "grab" : blockerSelectable ? "pointer" : "default",
          }}
          className={cn(
            "relative flex items-center justify-center rounded-md transition-shadow",
            selected && "ring-2 ring-gb-accent-green shadow-[0_0_10px_var(--gb-accent-green)]",
            blockerSelectable && !selected && "ring-2 ring-gb-accent-blue/40",
          )}
        >
          <DropOverlay active={acceptsDon || acceptsHandCard} hovered={isOver && (acceptsDon || acceptsHandCard)} color={acceptsHandCard ? "red" : "amber"} />
          <BoardCard
            card={card}
            cardDb={cardDb}
            width={BOARD_CARD_W}
            height={BOARD_CARD_H}
            className="relative z-[1]"
            donCountAdjust={donCountAdjust}
          />
          {canRedistribute && (
            <div
              ref={setDonDragRef}
              {...donAttributes}
              {...donListeners}
              onPointerDown={(e) => {
                e.stopPropagation();
                donListeners?.onPointerDown?.(e);
              }}
              className={cn(
                "absolute z-20 left-0 right-0 bottom-0 h-6 rounded-b-md cursor-grab",
                "bg-gb-accent-gold/30 ring-1 ring-gb-accent-gold/60",
                "animate-pulse",
              )}
              style={{ opacity: isDonDragging ? 0.3 : 1 }}
              aria-label="Drag attached DON"
            />
          )}
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
  animationDelay,
}: {
  card: CardInstance;
  cardDb: CardDb;
  activeDragType: string | null;
  zoneKey?: string;
  style: React.CSSProperties;
  animationDelay?: number;
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
      animate={{
        rotate: card.state === "RESTED" ? 90 : 0,
        filter: card.state === "RESTED" ? "brightness(0.6)" : "brightness(1)",
      }}
      transition={{
        ...(card.state === "RESTED" ? cardRest : cardActivate),
        delay: animationDelay ?? 0,
      }}
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
