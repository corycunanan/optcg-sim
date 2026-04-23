"use client";

import React, { useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { BattleSubPhase, CardDb, CardInstance } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import { Card } from "../card";
import { BOARD_CARD_W, BOARD_CARD_H, type DragPayload } from "./constants";
import { DropOverlay } from "./drop-zones";

function isValidCounterDrag(drag: DragPayload | null, cardDb: CardDb): boolean {
  if (!drag || drag.type !== "hand-card") return false;
  const data = cardDb[drag.card.cardId];
  if (!data) return false;
  if (data.type === "Character" && data.counter != null && data.counter > 0) return true;
  if (data.type === "Event" && data.effectText?.includes("[Counter]")) return true;
  return false;
}

export const DroppableTrashZone = React.memo(function DroppableTrashZone({
  trash,
  cardDb,
  activeDrag,
  battleSubPhase,
  onClickTrash,
  zoneKey,
  style,
}: {
  trash: CardInstance[];
  cardDb: CardDb;
  activeDrag: DragPayload | null;
  battleSubPhase: BattleSubPhase | null;
  onClickTrash?: () => void;
  zoneKey?: string;
  style?: React.CSSProperties;
}) {
  const inCounterStep = battleSubPhase === "COUNTER_STEP";
  const validDrag = inCounterStep && isValidCounterDrag(activeDrag, cardDb);
  const zonePos = useZonePosition();

  const { setNodeRef, isOver } = useDroppable({
    id: "counter-trash",
    data: { type: "counter-trash" },
    disabled: !inCounterStep,
  });

  const ref = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      if (zoneKey) {
        if (node) zonePos.register(zoneKey, node);
        else zonePos.unregister(zoneKey);
      }
    },
    [setNodeRef, zoneKey, zonePos],
  );

  const topCard = trash.length > 0 ? trash[0] : undefined;

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center"
      style={{ ...style, width: BOARD_CARD_W, height: BOARD_CARD_H }}
    >
      <DropOverlay active={validDrag} hovered={isOver && validDrag} color="red" />
      <Card
        variant="trash"
        data={{ cardDb, card: topCard }}
        empty={!topCard}
        emptyLabel="TRASH"
        overlays={
          trash.length > 1 ? { countBadge: trash.length } : undefined
        }
        interaction={{ clickable: !!onClickTrash }}
        onClick={onClickTrash}
        className="relative z-[1]"
      />
    </div>
  );
});
