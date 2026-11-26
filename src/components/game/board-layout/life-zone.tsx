"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { CardDb, LifeCard } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import {
  cardFlip,
  lifeDamageImpact,
  lifeScriedFlash,
  lifeTriggerPulse,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Card } from "../card";
import { CARD_SIZES } from "../card/sizes";
import { getBoardZoneLabel } from "./accessibility";
import { PileReceipt } from "./pile-receipt";

const LIFE_STACK_OFFSET = 20;

interface LifeStack {
  /** Each visible card's face, top first ("U"/"D"). */
  faces: string;
  /** Each visible card's public cardId, top first (face-up cards only). */
  cardIds: readonly (string | undefined)[];
  /** Bumped whenever the visible count changes, which re-keys the stack. */
  epoch: number;
  /** Art kept on a card that just turned face-down, so its front still
   *  shows while it turns away. Cleared once the flip ends. */
  turningDown: ReadonlyMap<number, string>;
}

/**
 * OPT-1059: Life cards have no stable identity to key on (face-down ids are
 * positional), so a turn is read off the faces. While the count holds, each
 * position keeps its card element and a face that changed plays the shared
 * flip in place (`CardFaces`). A count change (a card added, taken or still
 * arriving) re-keys the whole stack, so the cards that shift position swap
 * without a spurious flip.
 */
export function nextLifeStack(
  previous: LifeStack,
  life: readonly LifeCard[],
): LifeStack {
  const faces = life.map((card) => (card.face === "UP" ? "U" : "D")).join("");
  const cardIds = life.map((card) =>
    card.face === "UP" ? card.cardId : undefined,
  );
  if (faces.length !== previous.faces.length) {
    return { faces, cardIds, epoch: previous.epoch + 1, turningDown: new Map() };
  }
  const turningDown = new Map<number, string>();
  for (let i = 0; i < faces.length; i++) {
    const art = previous.cardIds[i] ?? previous.turningDown.get(i);
    if (faces[i] === "D" && previous.faces[i] === "U" && art) {
      turningDown.set(i, art);
    }
  }
  return { faces, cardIds, epoch: previous.epoch, turningDown };
}

function sameStack(a: LifeStack, life: readonly LifeCard[]): boolean {
  return (
    a.faces.length === life.length &&
    life.every(
      (card, i) =>
        a.faces[i] === (card.face === "UP" ? "U" : "D") &&
        a.cardIds[i] === (card.face === "UP" ? card.cardId : undefined),
    )
  );
}

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
  onInspect,
  maxStackSpread,
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
  onInspect?: () => void;
  /** Most the cards under the top one may peek out below it, in board px.
   *  The DON!! deck sits right under Life (OPT-1057), so the stack tightens
   *  to stay clear of it. */
  maxStackSpread?: number;
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
  // Derived during render, so a turn and its flip land in the same commit.
  const [stack, setStack] = useState<LifeStack>(() =>
    nextLifeStack(
      { faces: "", cardIds: [], epoch: 0, turningDown: new Map() },
      visibleLife,
    ),
  );
  let currentStack = stack;
  if (!sameStack(stack, visibleLife)) {
    currentStack = nextLifeStack(stack, visibleLife);
    setStack(currentStack);
  }
  const { epoch, turningDown } = currentStack;
  useEffect(() => {
    if (turningDown.size === 0) return;
    const timer = setTimeout(
      () =>
        setStack((current) =>
          current.turningDown === turningDown
            ? { ...current, turningDown: new Map() }
            : current,
        ),
      cardFlip.duration * 1000 + 100,
    );
    return () => clearTimeout(timer);
  }, [turningDown]);
  const lifeCardId = (card: LifeCard, index: number) =>
    card.face === "UP" ? card.cardId : turningDown.get(index);
  const stackOffset =
    maxStackSpread !== undefined && count > 1
      ? Math.min(LIFE_STACK_OFFSET, maxStackSpread / (count - 1))
      : LIFE_STACK_OFFSET;
  const triggerFeedbackActive = triggerPulse && !reducedMotion;
  const damageFeedbackActive =
    damagePulseNonce !== undefined && !reducedMotion;
  const scryFeedbackActive = scryPulseNonce !== undefined && !reducedMotion;
  const zoneFeedback = damageFeedbackActive
    ? "damage"
    : triggerFeedbackActive
      ? "trigger"
      : scryFeedbackActive
        ? "scried"
        : null;
  const zoneLabel = getBoardZoneLabel(
    zoneKey,
    "life",
    `${count} ${count === 1 ? "card" : "cards"}`,
  );
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onInspect || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      onInspect();
    },
    [onInspect],
  );

  return (
    <motion.div
      key={`damage:${zoneFeedback === "damage" ? damagePulseNonce : 0}`}
      ref={ref}
      role={onInspect ? "button" : "group"}
      tabIndex={onInspect ? 0 : undefined}
      aria-label={onInspect ? `${zoneLabel}. Inspect life` : zoneLabel}
      onClick={onInspect}
      onKeyDown={handleKeyDown}
      style={{
        ...style,
        width: CARD_SIZES.field.width,
        height: CARD_SIZES.field.height,
      }}
      animate={
        zoneFeedback === "damage"
          ? {
              x: lifeDamageImpact.x,
              opacity: lifeDamageImpact.opacity,
            }
          : { x: 0, opacity: 1 }
      }
      transition={
        zoneFeedback === "damage"
          ? lifeDamageImpact.transition
          : { duration: 0 }
      }
      // The zone box is `CARD_SIZES.field` and the top life card sits at
      // top-0/left-0 filling it exactly, so every ring drawn here — focus,
      // damage, and the two pulses below — traces that card's own outline.
      // It takes the card silhouette for the same reason `CardHighlightRing`
      // does (SHAPE-LANGUAGE.md §The card radius).
      className={cn(
        "relative rounded-card focus-visible:outline-none",
        onInspect &&
          "cursor-pointer focus-visible:ring-4 focus-visible:ring-gb-signal-eligible",
        zoneFeedback === "damage" &&
          "ring-4 ring-gb-accent-red shadow-[0_0_18px_var(--gb-accent-red)]",
      )}
    >
      {zoneFeedback === "trigger" && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 rounded-card ring-4 ring-gb-accent-amber shadow-[0_0_18px_var(--gb-accent-amber)]"
          initial={{ opacity: 0, scale: 1 }}
          animate={{
            opacity: lifeTriggerPulse.opacity,
            scale: lifeTriggerPulse.scale,
          }}
          transition={lifeTriggerPulse.transition}
        />
      )}

      {zoneFeedback === "scried" && (
        <motion.div
          key={`scry:${scryPulseNonce}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 rounded-card ring-4 ring-gb-accent-blue shadow-[0_0_16px_var(--gb-accent-blue)]"
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
        <PileReceipt visibleCount={count} showRemovals>
          {topCard ? (
            <Card
              key={`life:${epoch}:0`}
              variant="life"
              data={{
                cardDb,
                cardId: lifeCardId(topCard, 0),
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
            key={`life:${epoch}:${stackIndex}`}
            style={{
              position: "absolute",
              left: 0,
              top: stackIndex * stackOffset,
              zIndex: count - stackIndex,
            }}
          >
            <Card
              variant="life"
              data={{
                cardDb,
                cardId: lifeCardId(card, stackIndex),
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
