import { useRef, useCallback } from "react";
import { useMotionValue, useSpring } from "motion/react";
import type { DragMoveEvent, DragStartEvent, DragEndEvent } from "@dnd-kit/core";

const MAX_TILT_DEG = 8;
const VELOCITY_SCALE = 0.08;

/**
 * Velocity-based tilt for drag overlays.
 * Tracks horizontal drag velocity and maps it to a spring-animated
 * rotation — dragging right tilts the card left (negative rotation),
 * simulating inertia as if the card's bottom has weight.
 */
export function useDragTilt() {
  const prevX = useRef(0);
  const prevTime = useRef(0);

  const rawTilt = useMotionValue(0);
  const tilt = useSpring(rawTilt, { stiffness: 200, damping: 18 });

  const handleDragStart = useCallback(
    (_event: DragStartEvent) => {
      prevX.current = 0;
      prevTime.current = performance.now();
      rawTilt.set(0);
    },
    [rawTilt],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const x = event.delta.x;
      const now = performance.now();
      const dt = now - prevTime.current;

      if (dt > 0) {
        const velocity = ((x - prevX.current) / dt) * 1000; // px/s
        const deg = Math.max(
          -MAX_TILT_DEG,
          Math.min(MAX_TILT_DEG, velocity * VELOCITY_SCALE),
        );
        rawTilt.set(deg);
      }

      prevX.current = x;
      prevTime.current = now;
    },
    [rawTilt],
  );

  const handleDragEnd = useCallback(
    (_event: DragEndEvent) => {
      rawTilt.set(0);
    },
    [rawTilt],
  );

  return { tilt, handleDragStart, handleDragMove, handleDragEnd };
}
