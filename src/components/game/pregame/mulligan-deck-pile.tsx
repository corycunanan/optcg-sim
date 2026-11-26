"use client";

import { motion } from "motion/react";
import { Card } from "../card";
import { DeckRiffle } from "../deck-riffle";

/**
 * The viewer's deck as a face-down pile beside the Mulligan modal's hand
 * (OPT-1060). Two backing cards peek out under the top one so it reads as a
 * stack. Each new `shuffleNonce` plays the shared deck riffle (OPT-1055) in
 * place.
 */
export function MulliganDeckPile({
  sleeveUrl,
  shuffleNonce,
}: {
  sleeveUrl?: string | null;
  shuffleNonce?: number;
}) {
  const back = (
    <Card
      variant="modal"
      state="in-flight"
      faceDown
      sleeveUrl={sleeveUrl}
      interaction={{ tooltipDisabled: true }}
    />
  );
  return (
    <DeckRiffle nonce={shuffleNonce} slice={back} className="relative">
      <div data-mulligan-pile="" className="relative">
        <motion.div
          aria-hidden
          className="absolute top-0 left-0"
          style={{ x: 4, y: 4 }}
        >
          {back}
        </motion.div>
        <motion.div
          aria-hidden
          className="absolute top-0 left-0"
          style={{ x: 2, y: 2 }}
        >
          {back}
        </motion.div>
        <div className="relative">{back}</div>
      </div>
    </DeckRiffle>
  );
}
