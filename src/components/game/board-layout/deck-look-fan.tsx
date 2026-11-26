"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import type { CardDb } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import type { DeckLookSlotView, DeckLookView } from "@/hooks/use-deck-look";
import { fanSlotPoses } from "@/lib/game/deck-look";
import { cardTransitions } from "@/lib/motion";
import { Card } from "../card";
import { CARD_SIZES } from "../card/sizes";
import { FIELD_W } from "./constants";

/** Fan cards use the modal size token (about 1.5× a board card). */
const FAN_CARD = CARD_SIZES.modal;
/** Widest the fan may spread, in design px. */
const FAN_MAX_W = FIELD_W - 2 * FAN_CARD.width;
/** How far a revealed pick rises out of the fan, in design px. */
const REVEAL_LIFT_PX = 16;
/** When a revealed pick turns back over, after it starts rising. The flip
 *  up and back each take the shared 300ms flip, inside one spotlight dwell. */
const REVEAL_FACE_MS = 650;

/** Steps of a revealed pick: rising (and showing its face), then back down. */
function useRevealPhase(revealAt: number | undefined) {
  const [phase, setPhase] = React.useState<"rest" | "face" | "back">("rest");
  React.useEffect(() => {
    if (revealAt === undefined) return;
    const now = Date.now();
    const timers = [
      setTimeout(() => setPhase("face"), Math.max(0, revealAt - now)),
      setTimeout(
        () => setPhase("back"),
        Math.max(0, revealAt + REVEAL_FACE_MS - now),
      ),
    ];
    return () => timers.forEach(clearTimeout);
  }, [revealAt]);
  return phase;
}

function FanSlot({
  slot,
  faceDown,
  pose,
  cardDb,
  sleeveUrl,
}: {
  slot: DeckLookSlotView;
  faceDown: boolean;
  pose: { x: number; y: number; rotate: number };
  cardDb: CardDb;
  sleeveUrl?: string | null;
}) {
  const zonePos = useZonePosition();
  const { zoneKey } = slot;
  const ref = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (node) zonePos.register(zoneKey, node);
      else zonePos.unregister(zoneKey);
    },
    [zoneKey, zonePos],
  );
  const phase = useRevealPhase(slot.revealAt);
  const revealing = phase !== "rest";
  const showFace = !faceDown || phase === "face";
  const cardId = slot.cardId ?? (phase === "face" ? slot.revealCardId : null);

  return (
    // The registered box stays unrotated so a flight starts square on it.
    <div
      ref={ref}
      data-testid="deck-look-slot"
      data-slot-hidden={slot.hidden ? "true" : undefined}
      className={slot.hidden ? "invisible absolute" : "absolute"}
      style={{
        width: FAN_CARD.width,
        height: FAN_CARD.height,
        left: pose.x - FAN_CARD.width / 2,
        top: pose.y - FAN_CARD.height / 2,
      }}
    >
      <motion.div
        className="h-full w-full"
        initial={false}
        animate={{
          y: revealing ? -REVEAL_LIFT_PX : 0,
          rotate: revealing ? 0 : pose.rotate,
        }}
        transition={cardTransitions.handReflow}
      >
        <Card
          variant="modal"
          data={cardId ? { cardId, cardDb } : undefined}
          faceDown={!showFace}
          sleeveUrl={sleeveUrl}
          interaction={{ tooltipDisabled: true }}
          style={{ width: "100%", height: "100%" }}
        />
      </motion.div>
    </div>
  );
}

/**
 * OPT-1056: the looked-at cards, fanned at board center. Every card enters
 * and leaves through the flight layer; this component only holds them in
 * place (and lifts a revealed pick) while they rest here.
 */
export function DeckLookFan({
  looks,
  cardDb,
  top,
  sleeveUrls,
}: {
  looks: readonly DeckLookView[];
  cardDb: CardDb;
  /** Board-center y in design px. */
  top: number;
  sleeveUrls?: [string | null, string | null];
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-10"
      style={{ top, height: 0 }}
    >
      <AnimatePresence>
        {looks.map((view) => {
          const poses = fanSlotPoses(view.slots.length, {
            faceDown: view.look.faceDown,
            top: view.prefix === "o",
            cardWidth: FAN_CARD.width,
            maxWidth: FAN_MAX_W,
          });
          return (
            <motion.div
              key={view.look.id}
              data-testid="deck-look-fan"
              className="absolute left-1/2 top-0"
              exit={{ opacity: 0 }}
              transition={cardTransitions.zoneExit}
            >
              {view.slots.map((slot) => (
                <FanSlot
                  key={slot.zoneKey}
                  slot={slot}
                  faceDown={view.look.faceDown}
                  pose={poses[slot.index]}
                  cardDb={cardDb}
                  sleeveUrl={sleeveUrls?.[view.look.playerIndex] ?? null}
                />
              ))}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
