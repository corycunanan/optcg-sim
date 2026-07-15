"use client";

import { DragOverlay } from "@dnd-kit/core";
import { motion, type MotionValue } from "motion/react";
import type { CardDb } from "@shared/game-types";
import { Card } from "../card";
import { DonCard } from "./don-zone";
import type { DragPayload } from "./constants";

interface BoardDragOverlayProps {
  activeDrag: DragPayload | null;
  cardDb: CardDb;
  donArtUrl?: string | null;
  overlayScale: number;
  tiltX: MotionValue<number>;
  tiltY: MotionValue<number>;
}

/** Renders the body-portaled drag preview while preserving board-space scale
 * and the existing card/DON variants for every drag verb. */
export function BoardDragOverlay({
  activeDrag,
  cardDb,
  donArtUrl,
  overlayScale,
  tiltX,
  tiltY,
}: BoardDragOverlayProps) {
  return (
    <DragOverlay dropAnimation={null}>
      {activeDrag && (
        <motion.div
          style={{
            // The overlay escapes the board transform. Recreate perspective
            // here so velocity tilt reads as depth rather than skew.
            transformPerspective: 1000,
            rotateX: tiltX,
            rotateY: tiltY,
          }}
        >
          <div
            style={{
              transform: `scale(${overlayScale})`,
              transformOrigin: "top left",
            }}
          >
            {activeDrag.type === "hand-card" && (
              <Card
                variant="hand"
                data={{ cardDb, card: activeDrag.card }}
                interaction={{ tooltipDisabled: true }}
              />
            )}
            {(activeDrag.type === "active-don" ||
              activeDrag.type === "redistribute-don") && (
              <DonCard donArtUrl={donArtUrl} />
            )}
            {activeDrag.type === "attacker" && (
              <Card
                variant="field"
                data={{ cardDb, card: activeDrag.card }}
                overlays={{ donCount: activeDrag.card.attachedDon.length }}
                interaction={{ tooltipDisabled: true }}
              />
            )}
          </div>
        </motion.div>
      )}
    </DragOverlay>
  );
}
