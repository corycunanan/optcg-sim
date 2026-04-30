"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

export interface RemoteGameStatus {
  id: string;
  status: "IN_PROGRESS" | "FINISHED" | "ABANDONED";
  winnerId: string | null;
  winReason: string | null;
  winnerPerspective: "SELF" | "OPPONENT" | "NONE";
  canFallbackConcede: boolean;
  playerIndex?: 0 | 1;
}

export interface UseRemoteGameStatusReturn {
  remoteGameStatus: RemoteGameStatus | null;
  remoteGameNotFound: boolean;
  setRemoteGameStatus: Dispatch<SetStateAction<RemoteGameStatus | null>>;
}

export function useRemoteGameStatus(gameId: string): UseRemoteGameStatusReturn {
  const [remoteGameStatus, setRemoteGameStatus] =
    useState<RemoteGameStatus | null>(null);
  const [remoteGameNotFound, setRemoteGameNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadGameStatus = async () => {
      const response = await fetch(`/api/game/${gameId}`, {
        cache: "no-store",
      }).catch(() => null);
      if (cancelled || !response) return;
      if (response.status === 404) {
        setRemoteGameStatus(null);
        setRemoteGameNotFound(true);
        return;
      }
      if (!response.ok) return;

      const json = (await response.json().catch(() => null)) as {
        data?: RemoteGameStatus;
      } | null;
      if (!cancelled && json?.data) {
        setRemoteGameStatus(json.data);
        setRemoteGameNotFound(false);
      }
    };

    void loadGameStatus();
    const interval = setInterval(() => {
      if (remoteGameNotFound) return;
      void loadGameStatus();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gameId, remoteGameNotFound]);

  return { remoteGameStatus, remoteGameNotFound, setRemoteGameStatus };
}
