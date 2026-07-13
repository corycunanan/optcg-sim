"use client";

import { useEffect, type ReactNode } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { usePileReceipt } from "@/hooks/use-pile-receipt";
import { pileDelta, pileDeltaReduced, pilePop } from "@/lib/motion";

/** Top-of-pile receipt shared by deck, trash, and life. */
export function PileReceipt({
  visibleCount,
  children,
}: {
  visibleCount: number;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const popControls = useAnimationControls();
  const { receipt, clearReceipt } = usePileReceipt(visibleCount);
  const deltaMotion = reducedMotion ? pileDeltaReduced : pileDelta;

  useEffect(() => {
    if (!receipt || reducedMotion) {
      popControls.set(pilePop.settled);
      return;
    }

    let cancelled = false;
    void popControls.start(pilePop.peak, pilePop.peakTransition).then(() => {
      if (!cancelled) {
        return popControls.start(pilePop.settled, pilePop.settleTransition);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [receipt, reducedMotion, popControls]);

  return (
    <div className="relative">
      <motion.div initial={false} animate={popControls}>
        {children}
      </motion.div>

      {receipt && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2">
          <motion.span
            key={receipt.id}
            aria-hidden="true"
            className="text-gb-text-bright block text-base font-bold tabular-nums"
            initial={deltaMotion.initial}
            animate={deltaMotion.animate}
            transition={deltaMotion.transition}
            onAnimationComplete={() => clearReceipt(receipt.id)}
          >
            +{receipt.count}
          </motion.span>
        </div>
      )}
    </div>
  );
}
