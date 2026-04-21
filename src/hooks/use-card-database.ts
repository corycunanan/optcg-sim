"use client";

import { useEffect, useRef, useState } from "react";
import type { CardDb } from "@shared/game-types";

export interface UseCardDatabaseReturn {
  cardDb: CardDb;
  cardDbReady: boolean;
  cardDbError: string | null;
}

export function useCardDatabase(
  gameId: string,
  workerUrl: string,
  getToken: () => Promise<string>,
): UseCardDatabaseReturn {
  const [cardDb, setCardDb] = useState<CardDb>({});
  const [cardDbError, setCardDbError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;

    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 3;

    async function fetchCards() {
      while (attempt < maxAttempts && !cancelled) {
        try {
          const token = await getToken();
          const r = await fetch(
            `${workerUrl}/game/${gameId}/cards?token=${encodeURIComponent(token)}`,
          );
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data: CardDb = await r.json();
          if (!cancelled) {
            fetchedRef.current = true;
            setCardDb(data);
            setCardDbError(null);
          }
          return;
        } catch {
          attempt++;
          if (attempt < maxAttempts && !cancelled) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
      }
      if (!cancelled) {
        setCardDbError("Failed to load card data. Please refresh to try again.");
      }
    }

    fetchCards();
    return () => { cancelled = true; };
  }, [gameId, workerUrl, getToken]);

  const cardDbReady = Object.keys(cardDb).length > 0;

  return { cardDb, cardDbReady, cardDbError };
}
