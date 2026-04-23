"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardDb } from "@shared/game-types";

export interface UseCardDatabaseReturn {
  cardDb: CardDb;
  cardDbReady: boolean;
  cardDbError: string | null;
  retryFetchCards: () => void;
}

const MAX_ATTEMPTS = 3;

export function useCardDatabase(
  gameId: string,
  workerUrl: string,
  getToken: () => Promise<string>,
): UseCardDatabaseReturn {
  const [cardDb, setCardDb] = useState<CardDb>({});
  const [cardDbError, setCardDbError] = useState<string | null>(null);
  // Bump to force the effect to re-run after a manual retry.
  const [retryNonce, setRetryNonce] = useState(0);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;

    let cancelled = false;
    let attempt = 0;

    async function fetchCards() {
      while (attempt < MAX_ATTEMPTS && !cancelled) {
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
          if (attempt < MAX_ATTEMPTS && !cancelled) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
      }
      if (!cancelled) {
        setCardDbError("Failed to load card data.");
      }
    }

    fetchCards();
    return () => { cancelled = true; };
  }, [gameId, workerUrl, getToken, retryNonce]);

  const retryFetchCards = useCallback(() => {
    fetchedRef.current = false;
    setCardDbError(null);
    setRetryNonce((n) => n + 1);
  }, []);

  const cardDbReady = Object.keys(cardDb).length > 0;

  return { cardDb, cardDbReady, cardDbError, retryFetchCards };
}
