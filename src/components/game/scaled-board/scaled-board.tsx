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
import { computeBoardScale } from "./compute-scale";

export interface ScaledBoardProps {
  designWidth: number;
  designHeight: number;
  children: ReactNode;
  className?: string;
}

export function ScaledBoard({
  designWidth,
  designHeight,
  children,
  className,
}: ScaledBoardProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const reducedMotion = useReducedMotion() ?? false;

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const measure = () => {
      const { width, height } = wrapper.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setScale(computeBoardScale(width, height, designWidth, designHeight));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [designWidth, designHeight]);

  const contextValue = useMemo<BoardScaleContextValue>(
    () => ({ scale: scale ?? 1, designWidth, designHeight }),
    [scale, designWidth, designHeight],
  );

  const ready = scale !== null;

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden",
        className,
      )}
    >
      <BoardScaleContext.Provider value={contextValue}>
        <motion.div
          style={{
            width: designWidth,
            height: designHeight,
            transform: ready ? `scale(${scale})` : undefined,
            transformOrigin: "center",
            willChange: "transform",
          }}
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
