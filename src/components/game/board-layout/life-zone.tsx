"use client";

import React, { useCallback } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { CardDb, LifeCard } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import {
  lifeDamageImpact,
  lifeScriedFlash,
  lifeTriggerPulse,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Card } from "../card";
import { CARD_SIZES } from "../card/sizes";
import { PileReceipt } from "./pile-receipt";

const LIFE_STACK_OFFSET = 20;

export const LifeZone = React.memo(function LifeZone({
  life,
  cardDb,
  zoneKey,
  style,
  sleeveUrl,
  arrivingCount = 0,
  triggerPulse = false,
  damagePulseNonce,
  scryPulseNonce,
}: {
  life: LifeCard[];
  cardDb: CardDb;
  zoneKey?: string;
  style: React.CSSProperties;
  sleeveUrl?: string | null;
  arrivingCount?: number;
  triggerPulse?: boolean;
  damagePulseNonce?: number;
  scryPulseNonce?: number;
}) {
  const zonePos = useZonePosition();
  const reducedMotion = useReducedMotion();
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (zoneKey) {
        if (node) zonePos.register(zoneKey, node);
        else zonePos.unregister(zoneKey);
      }
    },
    [zoneKey, zonePos]
  );
  const visibleLife = arrivingCount > 0 ? life.slice(arrivingCount) : life;
  const count = visibleLife.length;
  const topCard = visibleLife[0];
  const triggerFeedbackActive = triggerPulse && !reducedMotion;
  const damageFeedbackActive =
    damagePulseNonce !== undefined && !reducedMotion;
  const scryFeedbackActive = scryPulseNonce !== undefined && !reducedMotion;

  return (
    <motion.div
      key={`damage:${damageFeedbackActive ? damagePulseNonce : 0}`}
      ref={ref}
      style={{
        ...style,
        width: CARD_SIZES.field.width,
        height: CARD_SIZES.field.height,
      }}
      animate={
        damageFeedbackActive
          ? {
              x: lifeDamageImpact.x,
              opacity: lifeDamageImpact.opacity,
            }
          : { x: 0, opacity: 1 }
      }
      transition={
        damageFeedbackActive
          ? lifeDamageImpact.transition
          : { duration: 0 }
      }
      className={cn(
        "relative rounded",
        damageFeedbackActive &&
          "ring-4 ring-gb-accent-red shadow-[0_0_18px_var(--gb-accent-red)]",
      )}
    >
      {triggerFeedbackActive && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 rounded ring-4 ring-gb-accent-amber shadow-[0_0_18px_var(--gb-accent-amber)]"
          initial={{ opacity: 0, scale: 1 }}
          animate={{
            opacity: lifeTriggerPulse.opacity,
            scale: lifeTriggerPulse.scale,
          }}
          transition={lifeTriggerPulse.transition}
        />
      )}

      {scryFeedbackActive && (
        <motion.div
          key={`scry:${scryPulseNonce}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 rounded ring-4 ring-gb-accent-blue shadow-[0_0_16px_var(--gb-accent-blue)]"
          initial={{ opacity: 0, scale: 1 }}
          animate={{
            opacity: lifeScriedFlash.opacity,
            scale: lifeScriedFlash.scale,
          }}
          transition={lifeScriedFlash.transition}
        />
      )}

      <div
        className="absolute top-0 left-0"
        style={{ zIndex: Math.max(1, count) }}
      >
        <PileReceipt visibleCount={count}>
          {topCard ? (
            <Card
              variant="life"
              data={{
                cardDb,
                cardId: topCard.face === "UP" ? topCard.cardId : undefined,
              }}
              faceDown={topCard.face === "DOWN"}
              sleeveUrl={sleeveUrl}
              overlays={{ countBadge: count }}
            />
          ) : (
            <Card variant="life" data={{ cardDb }} empty emptyLabel="LIFE" />
          )}
        </PileReceipt>
      </div>

      {visibleLife.slice(1).map((card, index) => {
        const stackIndex = index + 1;
        return (
          <div
            key={card.instanceId}
            style={{
              position: "absolute",
              left: 0,
              top: stackIndex * LIFE_STACK_OFFSET,
              zIndex: count - stackIndex,
            }}
          >
            <Card
              variant="life"
              data={{
                cardDb,
                cardId: card.face === "UP" ? card.cardId : undefined,
              }}
              faceDown={card.face === "DOWN"}
              sleeveUrl={sleeveUrl}
            />
          </div>
        );
      })}
    </motion.div>
  );
});
