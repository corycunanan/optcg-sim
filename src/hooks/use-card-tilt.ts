"use client";

import { useCallback, useRef } from "react";
import { useMotionValue, useSpring, useReducedMotion } from "motion/react";

/** Maximum tilt angle in degrees — intentionally subtle. */
const MAX_TILT_DEG = 8;

const SPRING_CONFIG = { stiffness: 300, damping: 25 };

/**
 * Returns motion-compatible style values for a subtle 3D perspective
 * tilt that follows the cursor position over a card.
 *
 * Usage:
 *   const tilt = useCardTilt({ enabled });
 *   <motion.div ref={tilt.ref} style={{ ...tilt.style }} />
 */
export function useCardTilt({ enabled = true }: { enabled?: boolean } = {}) {
  const reducedMotion = useReducedMotion();

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);

  const springX = useSpring(rotateX, SPRING_CONFIG);
  const springY = useSpring(rotateY, SPRING_CONFIG);

  const ref = useRef<HTMLElement | null>(null);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled || reducedMotion) return;
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      // -1 to 1 range from center
      const xRatio = (e.clientX - rect.left) / rect.width * 2 - 1;
      const yRatio = (e.clientY - rect.top) / rect.height * 2 - 1;

      // rotateY follows horizontal cursor, rotateX inverts vertical
      rotateY.set(xRatio * MAX_TILT_DEG);
      rotateX.set(-yRatio * MAX_TILT_DEG);
    },
    [enabled, reducedMotion, rotateX, rotateY],
  );

  const onMouseLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
  }, [rotateX, rotateY]);

  return {
    ref,
    handlers: { onMouseMove, onMouseLeave },
    style: {
      rotateX: springX,
      rotateY: springY,
      transformPerspective: 600,
    },
  } as const;
}
