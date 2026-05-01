"use client";

import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  BoardScaleContext,
  type BoardScaleContextValue,
} from "./board-scale-context";

export interface ScaledBoardProps {
  /** Fallback dimensions used during the first paint before the wrapper is
   *  measured. Once measurement resolves, the design canvas tracks the
   *  wrapper's live size, so the outer transform collapses to scale(1) and
   *  the inner `BoardLayout` `boardScale` does all of the fitting. */
  designWidth: number;
  designHeight: number;
  children: ReactNode;
  className?: string;
}

/**
 * EXPERIMENT (OPT-349 option 2): viewport-as-canvas mode.
 *
 * Previously this primitive ran a `Math.min(W/dW, H/dH)` aspect-fit on a fixed
 * 1920×1080 design canvas, producing the "letterbox on the longer axis" look.
 * The trade-off is that the green design canvas could never reach all four
 * viewport edges — by definition, an aspect-fit preserves the canvas's 16:9
 * shape and the off-axis is letterboxed.
 *
 * In this mode the design canvas IS the wrapper. There is no outer transform
 * (`scale: 1`), so:
 *   - The motion.div fills the wrapper edge-to-edge.
 *   - `useBoardScale()` reports the wrapper's live width/height as the design
 *     canvas, so consumers (notably `<Board>` → `<BoardLayout>`) author against
 *     real viewport pixels.
 *   - `BoardLayout`'s inner `boardScale` (post-OPT-349 unlocked) does all the
 *     fitting of the board's intrinsic ~888×788 content into the live canvas.
 *
 * Inside-design-canvas chrome (e.g. `BoardLayout`'s OPTCG SIM navbar) renders
 * at native pixel sizes regardless of viewport — which matches scope-doc
 * decision #3 (navbar is chrome, not part of the scaled subtree).
 */
export function ScaledBoard({
  designWidth,
  designHeight,
  children,
  className,
}: ScaledBoardProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const reducedMotion = useReducedMotion() ?? false;

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const measure = () => {
      const { width, height } = wrapper.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setSize({ w: width, h: height });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  const liveWidth = size?.w ?? designWidth;
  const liveHeight = size?.h ?? designHeight;

  const contextValue = useMemo<BoardScaleContextValue>(
    () => ({ scale: 1, designWidth: liveWidth, designHeight: liveHeight }),
    [liveWidth, liveHeight],
  );

  const ready = size !== null;

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "relative h-full w-full overflow-hidden",
        className,
      )}
    >
      <BoardScaleContext.Provider value={contextValue}>
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: ready ? 1 : 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { duration: 0.15, ease: "easeOut" }
          }
        >
          {children}
        </motion.div>
      </BoardScaleContext.Provider>
    </div>
  );
}
