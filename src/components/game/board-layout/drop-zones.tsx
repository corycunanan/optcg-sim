"use client";

import React, { useCallback, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { useZonePosition } from "@/contexts/zone-position-context";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui";
import { Card } from "../card";
import { SQUARE } from "./constants";
import { CardActionMenuContent } from "../card-action-menu";
import { useInteractionMode } from "./interaction-mode";

/** Colored overlay that sits behind the card in a zone during drag. */
export function DropOverlay({
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
      className="relative flex items-center justify-center rounded-md border border-gb-border-strong/30"
    >
      <DropOverlay active={accepts} hovered={isOver && accepts} color="blue" />
      <span className="text-sm font-bold text-gb-text-dim/40 leading-none select-none relative z-[1]">
        {label}
      </span>
    </div>
  );
});

export const DroppableStageZone = React.memo(function DroppableStageZone({
  card,
  cardDb,
  activeDragType,
  onAction,
  zoneKey,
  style,
  animationDelay,
}: {
  card: CardInstance | null;
  cardDb: CardDb;
  activeDragType: string | null;
  onAction?: (action: GameAction) => void;
  zoneKey: string;
  style: React.CSSProperties;
  animationDelay?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const zonePos = useZonePosition();
  const interactionMode = useInteractionMode();
  const inputSuppressed = interactionMode !== "full";
  const accepts = activeDragType === "hand-card";
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-zone-${zoneKey}`,
    data: { type: "stage-zone" },
  });

  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      if (node) zonePos.register(zoneKey, node);
      else zonePos.unregister(zoneKey);
    },
    [setNodeRef, zoneKey, zonePos],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (inputSuppressed) return;
      setMenuOpen(true);
    },
    [inputSuppressed],
  );

  return (
    <div
      ref={mergedRef}
      style={style}
      className="absolute flex items-center justify-center rounded-md border border-gb-border-strong/30"
    >
      <DropOverlay active={accepts} hovered={isOver && accepts} color="green" />
      {card ? (
        <DropdownMenu open={menuOpen} onOpenChange={(open) => { if (!open) setMenuOpen(false); }}>
          <DropdownMenuTrigger asChild>
            <div
              onContextMenu={handleContextMenu}
              className="relative z-[1]"
            >
              <Card
                data={{ card, cardDb }}
                variant="field"
                state={card.state === "RESTED" ? "rest" : "active"}
                motionDelay={animationDelay}
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
      ) : (
        <span className="text-sm font-bold text-gb-text-dim/40 leading-none select-none">
          STG
        </span>
      )}
    </div>
  );
});
