"use client";

import Image from "next/image";
import { motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";

// Seeded pseudo-random shuffle so the order is consistent across renders
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const shuffled = [...arr];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const TOTAL_CARDS = 48;
const ALL_CARDS = Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1);

// Just define radii — card size, count, and speed are derived
const RADII = [55, 160, 300, 470];
const CARD_ASPECT = 838 / 600; // ~1.4

const RINGS = RADII.map((radius) => {
  const w = Math.round(55 + ((radius - RADII[0]) / (RADII[RADII.length - 1] - RADII[0])) * 105);
  const h = Math.round(w * CARD_ASPECT);
  const count = Math.ceil((2 * Math.PI * radius) / (w * 0.6));
  const duration = Math.round(40 + radius * 0.25);
  return { radius, count, w, h, duration };
});

function Ring({
  ring,
  ringIdx,
  cards,
}: {
  ring: (typeof RINGS)[number];
  ringIdx: number;
  cards: number[];
}) {
  const direction = ringIdx % 2 === 0 ? 1 : -1;
  const saturation = 1 - (ringIdx / (RINGS.length - 1)) * 0.7;
  const degreesPerMs = (direction * 360) / (ring.duration * 1000);

  const baseRotation = useMotionValue(0);
  const rotate = useTransform(baseRotation, (r) => `rotate(${r}deg)`);

  useEffect(() => {
    let frameId: number;
    let last = performance.now();

    function tick(now: number) {
      const dt = now - last;
      last = now;
      baseRotation.set(baseRotation.get() + degreesPerMs * dt);
      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [baseRotation, degreesPerMs]);

  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{
        zIndex: RINGS.length - ringIdx,
        filter: `saturate(${saturation})`,
        transform: rotate,
      }}
    >
      {cards.map((cardNum, i) => {
        const angle = (360 / ring.count) * i;
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * ring.radius;
        const y = Math.sin(rad) * ring.radius;
        const rotation = angle + 270;

        return (
          <motion.div
            key={`${ringIdx}-${i}`}
            className="absolute overflow-hidden"
            style={{
              width: ring.w,
              height: ring.h,
              left: x - ring.w / 2,
              top: y - ring.h / 2,
              rotate: rotation,
              borderRadius: 4,
            }}
            whileHover={{ scale: 1.15 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <Image
              src={`/images/cards/image ${cardNum}.png`}
              alt=""
              width={ring.w}
              height={ring.h}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export function CardRings() {
  const shuffled = seededShuffle(ALL_CARDS, 42);

  let cardIndex = 0;
  const ringData = RINGS.map((ring) => {
    const cards = Array.from({ length: ring.count }, (_, i) => {
      return shuffled[(cardIndex + i) % shuffled.length];
    });
    cardIndex += ring.count;
    return cards;
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-[740px] -right-[740px] h-[1280px] w-[1280px]">
        <div
          className="absolute inset-0"
          style={{
            maskImage:
              "radial-gradient(circle at center, black 30%, transparent 85%)",
            WebkitMaskImage:
              "radial-gradient(circle at center, black 30%, transparent 85%)",
          }}
        >
          {RINGS.map((ring, ringIdx) => (
            <Ring
              key={ringIdx}
              ring={ring}
              ringIdx={ringIdx}
              cards={ringData[ringIdx]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
