"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useSession } from "next-auth/react";
import { useUserChannelEvents } from "@/components/realtime/user-channel-provider";
import { ApiError, apiGet } from "@/lib/api-client";
import {
  RemoteGameStatusResponseSchema,
  type RemoteGameStatus,
} from "@/lib/validators/game";
import type { RealtimeServerEvent } from "@/types/realtime";

export type { RemoteGameStatus } from "@/lib/validators/game";

export interface UseRemoteGameStatusReturn {
  remoteGameStatus: RemoteGameStatus | null;
  remoteGameNotFound: boolean;
  setRemoteGameStatus: Dispatch<SetStateAction<RemoteGameStatus | null>>;
}

type SpectatorRemovalEvent = Extract<
  RealtimeServerEvent,
  { type: "lobby:spectator_removed" }
>;

type GameStatusLoadResult = "admitted" | "not_found" | "error";

export function spectatorRemovalRedirect(
  reason: SpectatorRemovalEvent["reason"]
): string {
  const message =
    reason === "SPECTATING_DISABLED"
      ? "Spectating was disabled for this party"
      : "You were removed from this party";
  return `/lobbies?joinError=${encodeURIComponent(message)}`;
}

function deriveWinnerPerspective(
  winnerId: string | null,
  userId: string
): RemoteGameStatus["winnerPerspective"] {
  if (!winnerId) return "NONE";
  return winnerId === userId ? "SELF" : "OPPONENT";
}

export function useRemoteGameStatus(
  gameId: string,
  revalidateSpectatorAccess = false
): UseRemoteGameStatusReturn {
  const [remoteGameStatus, setRemoteGameStatus] =
    useState<RemoteGameStatus | null>(null);
  const [remoteGameNotFound, setRemoteGameNotFound] = useState(false);
  const { subscribe } = useUserChannelEvents();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  const loadGameStatus = useCallback(
    async (signal?: AbortSignal): Promise<GameStatusLoadResult> => {
      try {
        const json = await apiGet(
          `/api/game/${gameId}`,
          RemoteGameStatusResponseSchema,
          { cache: "no-store", signal }
        );
        if (signal?.aborted) return "error";
        setRemoteGameStatus(json.data);
        setRemoteGameNotFound(false);
        return "admitted";
      } catch (error) {
        if (signal?.aborted) return "error";
        if (error instanceof ApiError && error.status === 404) {
          setRemoteGameStatus(null);
          setRemoteGameNotFound(true);
          return "not_found";
        }
        return "error";
      }
    },
    [gameId]
  );

  useEffect(() => {
    const controller = new AbortController();
    const loadInitialStatus = async () => {
      await loadGameStatus(controller.signal);
    };
    void loadInitialStatus();
    return () => controller.abort();
  }, [loadGameStatus]);

  useEffect(() => {
    if (!revalidateSpectatorAccess) return;

    let active = true;
    const unsubscribe = subscribe("lobby:spectator_removed", async (event) => {
      const result = await loadGameStatus();
      if (!active || result !== "not_found") return;
      window.location.href = spectatorRemovalRedirect(event.reason);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadGameStatus, revalidateSpectatorAccess, subscribe]);

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
