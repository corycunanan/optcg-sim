"use client";

import React from "react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import type { CardDb, CardInstance } from "@shared/game-types";
import { flightPose, onNextFrame } from "@/lib/game/card-motion";
import {
  mulliganPilePoint,
  planMulliganDeal,
  planMulliganReturn,
  type MulliganCardMove,
  type MulliganStageGeometry,
} from "@/lib/game/mulligan-motion";
import { cardTravel, mulliganMotion } from "@/lib/motion";
import { Card } from "../card";
import { CARD_SIZES } from "../card/sizes";
import { MulliganDeckPile } from "./mulligan-deck-pile";

/** The modal's hand row: `modal` cards, `gap-3` apart, with the deck pile
 *  `ml-12` to the right of a full row. */
export const MULLIGAN_STAGE_GEOMETRY: MulliganStageGeometry = {
  cardWidth: CARD_SIZES.modal.width,
  gap: 12,
  pileGap: 48,
};

type StagePhase = "return" | "shuffle" | "deal" | "hold";

interface MulliganRedrawStageProps {
  oldHand: readonly CardInstance[];
  /** The redrawn hand from the server; null until it arrives. */
  newHand: readonly CardInstance[] | null;
  cardDb: CardDb;
  sleeveUrl?: string | null;
  /** Called once the new hand has been dealt and held, or when the server's
   *  new hand never arrives. */
  onDone: () => void;
}

/**
 * The opening-hand redraw (OPT-1060), drawn over the Mulligan modal's hand
 * row: the hand flips face-down and flies into the deck, the deck shuffles,
 * then the new hand is dealt face-up. The deal waits for the server's new
 * hand, so the return and shuffle cover the round trip.
 *
 * Reduced motion never mounts this stage (see `useMulliganRedraw`).
 */
export function MulliganRedrawStage({
  oldHand,
  newHand,
  cardDb,
  sleeveUrl,
  onDone,
}: MulliganRedrawStageProps) {
  const [phase, setPhase] = React.useState<StagePhase>("return");
  const [shuffleNonce, setShuffleNonce] = React.useState<number | undefined>();
  const [landed, setLanded] = React.useState<ReadonlySet<number>>(new Set());
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const returnPlan = React.useMemo(
    () => planMulliganReturn(oldHand.length, MULLIGAN_STAGE_GEOMETRY),
    [oldHand.length]
  );
  const dealHand = React.useMemo(
    () => (newHand ? newHand.slice(0, 5) : null),
    [newHand]
  );
  const dealPlan = React.useMemo(
    () =>
      dealHand
        ? planMulliganDeal(dealHand.length, MULLIGAN_STAGE_GEOMETRY)
        : null,
    [dealHand]
  );

  // Return → shuffle once the last card lands in the pile.
  React.useEffect(() => {
    if (phase !== "return") return;
    const id = window.setTimeout(() => {
      setPhase("shuffle");
      setShuffleNonce((nonce) => (nonce ?? 0) + 1);
    }, returnPlan.endsAtMs);
    return () => window.clearTimeout(id);
  }, [phase, returnPlan.endsAtMs]);

  // Shuffle → deal once the riffle ends and the new hand is here. If the
  // server never sends one (a rejected action), stop waiting.
  const [shuffleDone, setShuffleDone] = React.useState(false);
  React.useEffect(() => {
    if (phase !== "shuffle") return;
    const id = window.setTimeout(
      () => setShuffleDone(true),
      mulliganMotion.shuffleMs
    );
    return () => window.clearTimeout(id);
  }, [phase]);
  React.useEffect(() => {
    if (phase !== "shuffle" || !shuffleDone) return;
    if (dealPlan) {
      setPhase("deal");
      return;
    }
    const id = window.setTimeout(
      () => onDoneRef.current(),
      mulliganMotion.newHandTimeoutMs
    );
    return () => window.clearTimeout(id);
  }, [phase, shuffleDone, dealPlan]);

  // Deal → hold → done.
  React.useEffect(() => {
    if (phase !== "deal" || !dealPlan) return;
    const id = window.setTimeout(() => setPhase("hold"), dealPlan.endsAtMs);
    return () => window.clearTimeout(id);
  }, [phase, dealPlan]);
  React.useEffect(() => {
    if (phase !== "hold") return;
    const id = window.setTimeout(
      () => onDoneRef.current(),
      mulliganMotion.holdMs
    );
    return () => window.clearTimeout(id);
  }, [phase]);

  const markLanded = React.useCallback((index: number) => {
    setLanded((current) => new Set(current).add(index));
  }, []);

  const pile = mulliganPilePoint(MULLIGAN_STAGE_GEOMETRY);

  return (
    <div
      aria-hidden
      data-mulligan-stage={phase}
      className="pointer-events-none absolute inset-0"
    >
      <motion.div className="absolute top-0 left-0" style={{ x: pile.x }}>
        <MulliganDeckPile sleeveUrl={sleeveUrl} shuffleNonce={shuffleNonce} />
      </motion.div>

      {phase === "return" &&
        oldHand.map((card, index) =>
          landed.has(index) ? null : (
            <StageCard
              key={`return:${card.instanceId}`}
              card={card}
              cardDb={cardDb}
              sleeveUrl={sleeveUrl}
              move={returnPlan.cards[index]}
              // The first card leaves first and stays over the rest.
              zIndex={60 - index}
              onLanded={() => markLanded(index)}
            />
          )
        )}

      {(phase === "deal" || phase === "hold") &&
        dealHand &&
        dealPlan &&
        dealHand.map((card, index) => (
          <StageCard
            key={`deal:${card.instanceId}`}
            card={card}
            cardDb={cardDb}
            sleeveUrl={sleeveUrl}
            move={dealPlan.cards[index]}
            // The top card (dealt first) sits over the cards under it.
            zIndex={60 - index}
          />
        ))}
    </div>
  );
}

function StageCard({
  card,
  cardDb,
  sleeveUrl,
  move,
  zIndex,
  onLanded,
}: {
  card: CardInstance;
  cardDb: CardDb;
  sleeveUrl?: string | null;
  move: MulliganCardMove;
  zIndex: number;
  onLanded?: () => void;
}) {
  const progress = useMotionValue(0);
  const x = useTransform(progress, (p) => flightPose(p, move.from, move.to).x);
  const y = useTransform(progress, (p) => flightPose(p, move.from, move.to).y);
  const rotate = useTransform(
    progress,
    (p) => flightPose(p, move.from, move.to).rotate
  );
  const scale = useTransform(
    progress,
    (p) => flightPose(p, move.from, move.to).scale
  );
  const onLandedRef = React.useRef(onLanded);
  React.useEffect(() => {
    onLandedRef.current = onLanded;
  }, [onLanded]);

  React.useEffect(() => {
    let controls: { stop: () => void } | null = null;
    const cancelStart = onNextFrame(() => {
      controls = animate(progress, 1, {
        duration: move.durationMs / 1000,
        delay: move.departAtMs / 1000,
        ease: cardTravel.ease,
        onComplete: () => onLandedRef.current?.(),
      });
    });
    return () => {
      cancelStart();
      controls?.stop();
    };
  }, [progress, move.durationMs, move.departAtMs]);

  return (
    <motion.div
      data-mulligan-card={card.instanceId}
      className="absolute top-0 left-0"
      style={{ x, y, rotate, scale, zIndex }}
    >
      <Card
        variant="modal"
        state="in-flight"
        data={{ card, cardId: card.cardId, cardDb }}
        faceDown={move.faceDown}
        flipFrom={
          move.flipAtMs === null
            ? undefined
            : {
                faceDown: move.initialFaceDown,
                delay: move.flipAtMs / 1000,
                instant: move.flipInstant,
              }
        }
        sleeveUrl={sleeveUrl}
        interaction={{ tooltipDisabled: true }}
      />
    </motion.div>
  );
}
