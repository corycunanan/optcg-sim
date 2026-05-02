"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useSession } from "next-auth/react";
import { useUserChannelEvents } from "@/components/realtime/user-channel-provider";

export interface RemoteGameStatus {
  id: string;
  mode: "PVP" | "SOLITAIRE" | "PVCOMPUTER";
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

function deriveWinnerPerspective(
  winnerId: string | null,
  userId: string,
): RemoteGameStatus["winnerPerspective"] {
  if (!winnerId) return "NONE";
  return winnerId === userId ? "SELF" : "OPPONENT";
}

export function useRemoteGameStatus(gameId: string): UseRemoteGameStatusReturn {
  const [remoteGameStatus, setRemoteGameStatus] =
    useState<RemoteGameStatus | null>(null);
  const [remoteGameNotFound, setRemoteGameNotFound] = useState(false);
  const { subscribe } = useUserChannelEvents();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

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

    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // Push-based status updates from the UserChannel. Replaces the 2s poll —
  // status only transitions to terminal (FINISHED/ABANDONED) at game end, so
  // there's no backstop. A missed push is recovered by the one-shot fetch on
  // the next mount.
  useEffect(() => {
    return subscribe("game:status", (event) => {
      if (event.gameId !== gameId) return;
      setRemoteGameStatus((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: event.status,
          winnerId: event.winnerId,
          winReason: event.winReason,
          // Preserve the prior perspective if the session hasn't hydrated yet —
          // an empty `userId` would misclassify a SELF win as OPPONENT.
          winnerPerspective: userId
            ? deriveWinnerPerspective(event.winnerId, userId)
            : prev.winnerPerspective,
          canFallbackConcede: event.status === "IN_PROGRESS",
        };
      });
    });
  }, [subscribe, gameId, userId]);

  return { remoteGameStatus, remoteGameNotFound, setRemoteGameStatus };
}
