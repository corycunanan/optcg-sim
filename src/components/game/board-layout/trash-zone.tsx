"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import type { BattleSubPhase, CardDb, CardInstance } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { BoardCard } from "../board-card";
import { BOARD_CARD_W, BOARD_CARD_H, type DragPayload } from "./constants";

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
  style,
}: {
  trash: CardInstance[];
  cardDb: CardDb;
  activeDrag: DragPayload | null;
  battleSubPhase: BattleSubPhase | null;
  style?: React.CSSProperties;
}) {
  const inCounterStep = battleSubPhase === "COUNTER_STEP";
  const validDrag = inCounterStep && isValidCounterDrag(activeDrag, cardDb);

  const { setNodeRef, isOver } = useDroppable({
    id: "counter-trash",
    data: { type: "counter-trash" },
    disabled: !inCounterStep,
  });

  const topCard = trash.length > 0 ? trash[0] : undefined;

  return (
    <div ref={setNodeRef} className="relative" style={style}>
      <div
        className={cn(
          "rounded transition-shadow duration-150",
          validDrag && "ring-2 ring-gb-accent-purple/60 shadow-[0_0_12px_var(--gb-accent-purple)]",
          validDrag && isOver && "ring-gb-accent-green shadow-[0_0_16px_var(--gb-accent-green)]",
        )}
      >
        <BoardCard
          card={topCard}
          cardDb={cardDb}
          empty={!topCard}
          label="TRASH"
          count={trash.length > 1 ? trash.length : undefined}
          width={BOARD_CARD_W}
          height={BOARD_CARD_H}
        />
      </div>
    </div>
  );
});
