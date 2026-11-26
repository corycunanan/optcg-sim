"use client";

import { motion, useReducedMotion } from "motion/react";
import { mulliganMotion } from "@/lib/motion";
import { Card } from "../card";

/**
 * The viewer's deck as a face-down pile beside the Mulligan modal's hand
 * (OPT-1060). Two backing cards peek out under the top one so it reads as a
 * stack. Each new `shuffleNonce` shuffles it in place.
 *
 * TODO(OPT-1055): replace the placeholder shuffle with the shared
 * `DeckRiffle` once it lands.
 */
export function MulliganDeckPile({
  sleeveUrl,
  shuffleNonce,
}: {
  sleeveUrl?: string | null;
  shuffleNonce?: number;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const shuffling = shuffleNonce !== undefined && !reducedMotion;
  return (
    <div data-mulligan-pile="" className="relative">
      <motion.div
        aria-hidden
        className="absolute top-0 left-0"
        style={{ x: 4, y: 4 }}
      >
        <Card variant="modal" state="in-flight" faceDown sleeveUrl={sleeveUrl} interaction={{ tooltipDisabled: true }} />
      </motion.div>
      <motion.div
        aria-hidden
        className="absolute top-0 left-0"
        style={{ x: 2, y: 2 }}
      >
        <Card variant="modal" state="in-flight" faceDown sleeveUrl={sleeveUrl} interaction={{ tooltipDisabled: true }} />
      </motion.div>
      <motion.div
        key={shuffleNonce ?? "idle"}
        className="relative"
        animate={shuffling ? { x: [0, -14, 14, -8, 0] } : undefined}
        transition={{ duration: mulliganMotion.shuffleMs / 1000, ease: "easeInOut" }}
      >
        <Card variant="modal" state="in-flight" faceDown sleeveUrl={sleeveUrl} interaction={{ tooltipDisabled: true }} />
      </motion.div>
    </div>
  );
}
