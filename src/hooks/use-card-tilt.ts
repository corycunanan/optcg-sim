"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

interface UseCardTiltOptions {
  enabled?: boolean;
  maxTiltDeg?: number;
}

/**
 * Pointer-driven 3D tilt + glare hook for "premium" card surfaces.
 *
 * Writes runtime CSS custom properties (`--pointer-x`, `--tilt-x`, etc.) to the
 * container ref so styling stays in CSS — JS only carries the live pointer
 * position. RAF-batched so multi-event-per-frame doesn't thrash the style
 * recalc.
 *
 * Mirrors the convention from `useDragTilt`: tilt-x rotates around X (top/bottom
 * tip toward viewer), tilt-y rotates around Y (left/right tip toward viewer).
 * Honors `prefers-reduced-motion`: pointer tracking still runs (so the static
 * shine still slides), but the 3D rotation is held at 0.
 */
export function useCardTilt({ enabled = true, maxTiltDeg = 9 }: UseCardTiltOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotionRef.current = mq.matches;
    const handler = (event: MediaQueryListEvent) => {
      reduceMotionRef.current = event.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const apply = useCallback(() => {
    rafRef.current = null;
    const el = containerRef.current;
    const pending = pendingRef.current;
    if (!el || !pending) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const px = ((pending.x - rect.left) / rect.width) * 100;
    const py = ((pending.y - rect.top) / rect.height) * 100;
    const cx = px - 50;
    const cy = py - 50;
    const distance = Math.min(50, Math.hypot(cx, cy)) / 50;

    const reduceMotion = reduceMotionRef.current;
    const tiltY = reduceMotion ? 0 : (cx / 50) * maxTiltDeg;
    const tiltX = reduceMotion ? 0 : (-cy / 50) * maxTiltDeg;

    el.style.setProperty("--pointer-x", `${px.toFixed(2)}%`);
    el.style.setProperty("--pointer-y", `${py.toFixed(2)}%`);
    el.style.setProperty("--pointer-from-center", distance.toFixed(3));
    el.style.setProperty("--pointer-from-center-x", cx.toFixed(2));
    el.style.setProperty("--pointer-from-center-y", cy.toFixed(2));
    el.style.setProperty("--tilt-x", `${tiltX.toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${tiltY.toFixed(2)}deg`);
  }, [maxTiltDeg]);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      pendingRef.current = { x: event.clientX, y: event.clientY };
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(apply);
      }
    },
    [enabled, apply],
  );

  const onPointerEnter = useCallback(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;
    el.dataset.active = "true";
    el.style.setProperty("--active", "1");
  }, [enabled]);

  const onPointerLeave = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.dataset.active = "false";
      el.style.setProperty("--active", "0");
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    containerRef,
    handlers: { onPointerMove, onPointerEnter, onPointerLeave },
  };
}
