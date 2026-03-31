"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";

const TOTAL_CARDS = 48;
const CARD_W = 100;
const CARD_H = 140;
const GAP = 12;
const CARDS_PER_COL = 8;
const SCROLL_DURATION = 40; // seconds for full scroll cycle
const FLIP_INTERVAL_MIN = 10000;
const FLIP_INTERVAL_MAX = 25000;
const FLIP_DURATION = 0.6;

const COLUMNS = [
  { offset: -40, speed: 0.95 },
  { offset: 0, speed: 1 },
  { offset: -60, speed: 0.85 },
  { offset: -30, speed: 1.15 },
];

function getRandomCard(exclude?: number): number {
  let card: number;
  do {
    card = Math.floor(Math.random() * TOTAL_CARDS) + 1;
  } while (card === exclude);
  return card;
}

function FlippingCard({ initialCard }: { initialCard: number }) {
  const [cardA, setCardA] = useState(initialCard);
  const [cardB, setCardB] = useState(() => getRandomCard(initialCard));
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const cardARef = useRef(initialCard);
  const cardBRef = useRef(getRandomCard(initialCard));
  const delayTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flipTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    function scheduleFlip() {
      const delay =
        FLIP_INTERVAL_MIN +
        Math.random() * (FLIP_INTERVAL_MAX - FLIP_INTERVAL_MIN);
      delayTimerRef.current = setTimeout(() => {
        if (cancelledRef.current) return;
        // Flip 180 more degrees
        rotationRef.current += 180;
        setRotation(rotationRef.current);

        // After flip lands, replace the now-hidden face with a new card
        flipTimerRef.current = setTimeout(() => {
          if (cancelledRef.current) return;
          const flips = rotationRef.current / 180;
          if (flips % 2 === 1) {
            // A is now hidden, replace it
            const next = getRandomCard(cardBRef.current);
            cardARef.current = next;
            setCardA(next);
          } else {
            // B is now hidden, replace it
            const next = getRandomCard(cardARef.current);
            cardBRef.current = next;
            setCardB(next);
          }
          scheduleFlip();
        }, FLIP_DURATION * 1000);
      }, delay);
    }

    scheduleFlip();
    return () => {
      cancelledRef.current = true;
      clearTimeout(delayTimerRef.current);
      clearTimeout(flipTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="relative shrink-0"
      style={{
        width: CARD_W,
        height: CARD_H,
        perspective: "600px",
      }}
    >
      <motion.div
        className="relative h-full w-full"
        animate={{ rotateY: rotation }}
        transition={{ duration: FLIP_DURATION, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          className="absolute inset-0 overflow-hidden rounded"
          style={{ backfaceVisibility: "hidden" }}
        >
          <Image
            src={`/images/cards/image ${cardA}.png`}
            alt=""
            width={CARD_W}
            height={CARD_H}
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>
        <div
          className="absolute inset-0 overflow-hidden rounded"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <Image
            src={`/images/cards/image ${cardB}.png`}
            alt=""
            width={CARD_W}
            height={CARD_H}
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>
      </motion.div>
    </div>
  );
}

function Column({
  speed,
  offsetY,
  cards,
}: {
  speed: number;
  offsetY: number;
  cards: number[];
}) {
  const colHeight = CARDS_PER_COL * (CARD_H + GAP);
  const duration = SCROLL_DURATION / speed;

  return (
    <div
      className="relative overflow-hidden"
      style={{ width: CARD_W, height: "100%" }}
    >
      <motion.div
        className="absolute flex flex-col"
        style={{ gap: GAP, top: offsetY }}
        animate={{ y: [0, -colHeight] }}
        transition={{
          y: {
            duration,
            repeat: Infinity,
            ease: "linear",
          },
        }}
      >
        {/* Double the cards for seamless loop */}
        {[...cards, ...cards].map((card, i) => (
          <FlippingCard key={i} initialCard={card} />
        ))}
      </motion.div>
    </div>
  );
}

export function CardColumns() {
  const [columns, setColumns] = useState<number[][]>([]);

  useEffect(() => {
    setColumns(
      COLUMNS.map(() =>
        Array.from({ length: CARDS_PER_COL }, () => getRandomCard())
      )
    );
  }, []);

  if (columns.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div
        className="absolute flex h-[1400px] items-start gap-3"
        style={{
          top: "-400px",
          right: "-150px",
          transform: "rotate(-30deg)",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 75%)",
        }}
      >
        {columns.map((cards, i) => (
          <Column
            key={i}
            speed={COLUMNS[i].speed}
            offsetY={COLUMNS[i].offset}
            cards={cards}
          />
        ))}
      </div>
    </div>
  );
}
