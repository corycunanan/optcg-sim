"use client";

import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";

const TOTAL_CARDS = 48;
const FLIP_INTERVAL = 4000; // ms between flips
const FLIP_DURATION = 0.8; // seconds for the flip animation

// Fisher-Yates shuffle
function shuffle(arr: number[]): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function CardFlip() {
  const [currentCard, setCurrentCard] = useState(1);
  const [nextCard, setNextCard] = useState(2);
  const [isFlipped, setIsFlipped] = useState(false);
  const queueRef = useRef<number[]>([]);

  const getNextCard = useCallback((exclude: number) => {
    if (queueRef.current.length === 0) {
      const all = Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1);
      queueRef.current = shuffle(all);
    }
    let card = queueRef.current.pop()!;
    // Avoid showing the same card twice in a row
    if (card === exclude && queueRef.current.length > 0) {
      queueRef.current.unshift(card);
      card = queueRef.current.pop()!;
    }
    return card;
  }, []);

  useEffect(() => {
    // Initialize with random cards
    const first = getNextCard(0);
    const second = getNextCard(first);
    setCurrentCard(first);
    setNextCard(second);
  }, [getNextCard]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsFlipped(true);

      // After flip completes, swap cards and reset
      setTimeout(() => {
        setCurrentCard(nextCard);
        const upcoming = getNextCard(nextCard);
        setNextCard(upcoming);
        setIsFlipped(false);
      }, FLIP_DURATION * 1000);
    }, FLIP_INTERVAL);

    return () => clearInterval(interval);
  }, [nextCard, getNextCard]);

  return (
    <div className="relative" style={{ perspective: "1200px" }}>
      {/* Ambient glow behind the card */}
      <div
        className="absolute -inset-12 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--gold-500), transparent 70%)",
        }}
        aria-hidden="true"
      />

      <motion.div
        className="relative"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{
          duration: FLIP_DURATION,
          ease: [0.4, 0, 0.2, 1],
        }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front face — current card */}
        <div
          className="relative overflow-hidden rounded-lg shadow-lg"
          style={{ backfaceVisibility: "hidden" }}
        >
          <Image
            src={`/images/cards/image ${currentCard}.png`}
            alt="One Piece TCG Card"
            width={400}
            height={560}
            className="block h-auto w-full"
            priority
            draggable={false}
          />
        </div>

        {/* Back face — next card (pre-rotated 180deg) */}
        <div
          className="absolute inset-0 overflow-hidden rounded-lg shadow-lg"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <Image
            src={`/images/cards/image ${nextCard}.png`}
            alt="One Piece TCG Card"
            width={400}
            height={560}
            className="block h-auto w-full"
            draggable={false}
          />
        </div>
      </motion.div>
    </div>
  );
}
