"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
} from "react";
import { useMotionValue, type MotionValue } from "motion/react";
import { scaleDragDelta } from "./scale-drag-delta";
import { useBoardScale } from "./use-board-scale";

/**
 * Drag info passed to consumer callbacks. Shape mirrors motion.dev's `PanInfo`
 * so this hook reads as a drop-in replacement for `<motion.div drag />`. All
 * vector values are in DESIGN pixels (post scale-correction) except `point`,
 * which stays in viewport pixels for hit-testing against zones laid out in
 * the same coordinate space (`Element.getBoundingClientRect()`).
 */
export interface ScaledDragInfo {
  /** Per-event delta in design pixels. */
  delta: { x: number; y: number };
  /** Cumulative offset from drag start in design pixels. */
  offset: { x: number; y: number };
  /** Pointer position in viewport pixels — for `getBoundingClientRect` hit-tests. */
  point: { x: number; y: number };
}

export interface UseScaledDragOptions {
  onDragStart?: (event: ReactPointerEvent<HTMLElement>, info: ScaledDragInfo) => void;
  onDrag?: (event: ReactPointerEvent<HTMLElement>, info: ScaledDragInfo) => void;
  onDragEnd?: (event: ReactPointerEvent<HTMLElement>, info: ScaledDragInfo) => void;
}

export interface UseScaledDragResult {
  /** MotionValue holding the design-pixel x offset. Pass to `style.x`. */
  x: MotionValue<number>;
  /** MotionValue holding the design-pixel y offset. Pass to `style.y`. */
  y: MotionValue<number>;
  /** True between pointerdown and pointerup/cancel. */
  isDragging: boolean;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
}

interface DragState {
  pointerId: number;
  startPoint: { x: number; y: number };
  lastPoint: { x: number; y: number };
}

/**
 * Pointer-driven drag hook that produces design-pixel motion values inside a
 * `<ScaledBoard>` subtree. Wraps the scale math via `scaleDragDelta` so the
 * dragged element tracks the pointer at any board scale.
 *
 *   const drag = useScaledDrag({ onDragEnd: (_, info) => commitMove(info.point) });
 *   return (
 *     <motion.div
 *       style={{ x: drag.x, y: drag.y }}
 *       onPointerDown={drag.onPointerDown}
 *       onPointerMove={drag.onPointerMove}
 *       onPointerUp={drag.onPointerUp}
 *       onPointerCancel={drag.onPointerCancel}
 *     />
 *   );
 *
 * Must be called inside a `<ScaledBoard>` — `useBoardScale()` throws otherwise.
 */
export function useScaledDrag(
  options: UseScaledDragOptions = {},
): UseScaledDragResult {
  const { onDragStart, onDrag, onDragEnd } = options;
  const { scale } = useBoardScale();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const stateRef = useRef<DragState | null>(null);

  const onPointerDown = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      // Mouse: only primary button. Touch/pen: any.
      if (event.pointerType === "mouse" && event.button !== 0) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      stateRef.current = {
        pointerId: event.pointerId,
        startPoint: { x: event.clientX, y: event.clientY },
        lastPoint: { x: event.clientX, y: event.clientY },
      };
      setIsDragging(true);

      onDragStart?.(event, {
        delta: { x: 0, y: 0 },
        offset: { x: 0, y: 0 },
        point: { x: event.clientX, y: event.clientY },
      });
    },
    [onDragStart],
  );

  const onPointerMove = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;

      const delta = scaleDragDelta(
        {
          x: event.clientX - state.lastPoint.x,
          y: event.clientY - state.lastPoint.y,
        },
        scale,
      );
      const offset = scaleDragDelta(
        {
          x: event.clientX - state.startPoint.x,
          y: event.clientY - state.startPoint.y,
        },
        scale,
      );

      x.set(x.get() + delta.x);
      y.set(y.get() + delta.y);
      state.lastPoint = { x: event.clientX, y: event.clientY };

      onDrag?.(event, {
        delta,
        offset,
        point: { x: event.clientX, y: event.clientY },
      });
    },
    [onDrag, scale, x, y],
  );

  const endDrag = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;

      const offset = scaleDragDelta(
        {
          x: event.clientX - state.startPoint.x,
          y: event.clientY - state.startPoint.y,
        },
        scale,
      );

      onDragEnd?.(event, {
        delta: { x: 0, y: 0 },
        offset,
        point: { x: event.clientX, y: event.clientY },
      });

      // releasePointerCapture can throw if the pointer was already lost
      // (e.g. element unmounted mid-drag); ignore.
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
      stateRef.current = null;
      setIsDragging(false);
    },
    [onDragEnd, scale],
  );

  return {
    x,
    y,
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}
