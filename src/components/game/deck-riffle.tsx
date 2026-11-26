"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { deckRiffle, pilePop } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * OPT-1055: the deck shuffle riffle, played in place on a face-down pile.
 *
 * Wrap a pile and pass a face-down card back as `slice`. Each new `nonce`
 * hides the pile, riffles three copies of `slice` over it (two passes,
 * `deckRiffle.totalMs`), shows the pile again and pops it. The slices fill
 * the wrapper, so the riffle takes the pile's own size. Reduced motion plays
 * the pop only.
 *
 * `nonce` is a restart token: any number different from the last one seen
 * starts a shuffle; `undefined` means idle.
 */
export function DeckRiffle({
  nonce,
  slice,
  children,
  className,
  onDone,
}: {
  nonce: number | undefined;
  slice: ReactNode;
  children: ReactNode;
  className?: string;
  onDone?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const popControls = useAnimationControls();
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // A new nonce starts a run. Reduced motion is read once at the start, so a
  // preference change cannot cut a riffle short, and the nonce going back to
  // undefined does not either.
  const [run, setRun] = useState<{ nonce: number; reduced: boolean } | null>(
    null
  );
  const [doneNonce, setDoneNonce] = useState<number | null>(null);
  if (nonce !== undefined && nonce !== run?.nonce) {
    setRun({ nonce, reduced: !!reducedMotion });
  }
  const riffling =
    run !== null && !run.reduced && doneNonce !== run.nonce ? run.nonce : null;

  useEffect(() => {
    if (!run) return;
    let cancelled = false;
    popControls.set(pilePop.settled);

    const pop = () => {
      void popControls
        .start(pilePop.peak, pilePop.peakTransition)
        .then(() => {
          if (!cancelled) {
            return popControls.start(pilePop.settled, pilePop.settleTransition);
          }
        })
        .then(() => {
          if (!cancelled) onDoneRef.current?.();
        });
    };

    if (run.reduced) {
      pop();
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(() => {
      if (cancelled) return;
      setDoneNonce(run.nonce);
      pop();
    }, deckRiffle.totalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [run, popControls]);

  return (
    <div className={cn("relative", className)} data-riffling={riffling !== null || undefined}>
      <motion.div
        initial={false}
        animate={popControls}
        className={cn(riffling !== null && "opacity-0")}
      >
        {children}
      </motion.div>

      {riffling !== null && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {deckRiffle.slices.map((frames, index) => (
            <motion.div
              key={`${riffling}-${index}`}
              data-riffle-slice={index}
              className="absolute inset-0"
              initial={{ x: "0%", y: "0%", rotate: 0 }}
              animate={{
                x: [...frames.x],
                y: [...frames.y],
                rotate: [...frames.rotate],
              }}
              transition={{
                duration: deckRiffle.sliceMs / 1000,
                delay: (index * deckRiffle.sliceStaggerMs) / 1000,
                ease: [...deckRiffle.ease],
              }}
            >
              {slice}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
