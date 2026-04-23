import { useCallback, useRef } from "react";
import { useMotionValue, useSpring } from "motion/react";
import type { DragMoveEvent, DragStartEvent, DragEndEvent } from "@dnd-kit/core";

/**
 * Max tilt per axis. Matches the pointer-tilt ceiling from OPT-275 so drag
 * and hover share a consistent motion language.
 */
export const DRAG_TILT_MAX_DEG = 12;

/**
 * Velocity-to-degrees multiplier. A fast flick saturates to the ceiling;
 * slower drags fall under it smoothly.
 */
export const DRAG_TILT_VELOCITY_SCALE = 0.08;

/**
 * Spring applied to the raw velocity samples. Gentle enough to smooth
 * frame-rate noise, stiff enough that release reads as snappy.
 */
export const DRAG_TILT_SPRING = {
  stiffness: 220,
  damping: 22,
  mass: 0.6,
} as const;

/**
 * Pure velocity → tilt mapping. Exposed for unit tests — mirrors the
 * convention in `<Card>`'s pointer tilt (OPT-275) so the card leans in the
 * direction of motion under a perspective parent.
 *
 * Given the 2D velocity vector (px/s) the card is being dragged with, return
 * the `(rotateX, rotateY)` degrees that make it appear to tip in that
 * direction in 3D space (perspective parent required).
 *
 * - `rotateY = -vx * scale` — dragging right tips the right edge toward viewer
 * - `rotateX =  vy * scale` — dragging down tips the bottom edge toward viewer
 *   (dragging up → top toward viewer, matching the hover-tilt convention)
 */
export function velocityToTilt(
  vx: number,
  vy: number,
  maxDeg = DRAG_TILT_MAX_DEG,
  scale = DRAG_TILT_VELOCITY_SCALE,
): { rotateX: number; rotateY: number } {
  const clamp = (v: number) => Math.max(-maxDeg, Math.min(maxDeg, v));
  return {
    rotateX: clamp(vy * scale),
    rotateY: clamp(-vx * scale),
  };
}

/**
 * Velocity-based 3D drag tilt for dnd-kit drag overlays. Tracks drag-delta
 * velocity, maps it to spring-smoothed `rotateX` / `rotateY` motion values,
 * and snaps back to rest on drag end.
 *
 * Pairs with a perspective parent on the overlay element so the rotations
 * render as depth, not as orthographic skew. Apply as:
 *
 *   <motion.div style={{ transformPerspective: 1000, rotateX: tiltX, rotateY: tiltY }}>
 *
 * Pass `disabled: true` when `prefers-reduced-motion` is set — the hook
 * keeps wiring the dnd-kit handlers (so the consumer can still compose them)
 * but holds both motion values at zero.
 */
export function useDragTilt(options?: { disabled?: boolean }) {
  const disabled = options?.disabled ?? false;
  const prev = useRef({ x: 0, y: 0, t: 0 });

  const rawTiltX = useMotionValue(0);
  const rawTiltY = useMotionValue(0);
  const tiltX = useSpring(rawTiltX, DRAG_TILT_SPRING);
  const tiltY = useSpring(rawTiltY, DRAG_TILT_SPRING);

  const handleDragStart = useCallback(
    (_event: DragStartEvent) => {
      prev.current = { x: 0, y: 0, t: performance.now() };
      rawTiltX.set(0);
      rawTiltY.set(0);
    },
    [rawTiltX, rawTiltY],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (disabled) return;
      const { x, y } = event.delta;
      const now = performance.now();
      const dt = now - prev.current.t;
      if (dt > 0) {
        const vx = ((x - prev.current.x) / dt) * 1000;
        const vy = ((y - prev.current.y) / dt) * 1000;
        const tilt = velocityToTilt(vx, vy);
        rawTiltX.set(tilt.rotateX);
        rawTiltY.set(tilt.rotateY);
      }
      prev.current = { x, y, t: now };
    },
    [disabled, rawTiltX, rawTiltY],
  );

  const handleDragEnd = useCallback(
    (_event: DragEndEvent) => {
      rawTiltX.set(0);
      rawTiltY.set(0);
    },
    [rawTiltX, rawTiltY],
  );

  return { tiltX, tiltY, handleDragStart, handleDragMove, handleDragEnd };
}
