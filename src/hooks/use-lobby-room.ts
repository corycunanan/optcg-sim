"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";

export type LobbyRoomMode = "PVP" | "SOLITAIRE" | "PVCOMPUTER";
export type LobbyRoomStatus =
  | "WAITING"
  | "READY"
  | "IN_GAME"
  | "CLOSED"
  | "EVICTED";

export interface LobbyRoomDeck {
  id: string;
  name: string;
  leaderId: string;
  leaderName: string | null;
  leaderImageUrl: string | null;
}

export interface LobbyRoomState {
  id: string;
  status: LobbyRoomStatus;
  joinCode: string;
  format: string;
  mode: LobbyRoomMode;
  hostReady: boolean;
  hostUserId: string;
  host: {
    username: string | null;
    name: string | null;
    image: string | null;
  } | null;
  hostDeck: LobbyRoomDeck | null;
  guest: {
    guestReady: boolean;
    user: {
      id: string;
      username: string | null;
      name: string | null;
      image: string | null;
    };
    deck: LobbyRoomDeck | null;
  } | null;
  gameId: string | null;
}

type LobbyRoomResponse = {
  data: LobbyRoomState;
};

type StartLobbyResponse = {
  data: {
    gameId: string;
  };
};

export function useLobbyRoom(
  lobbyId: string,
  initialLobby: LobbyRoomState | null = null
) {
  const [lobby, setLobby] = useState<LobbyRoomState | null>(initialLobby);
  const [loading, setLoading] = useState(!initialLobby);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [starting, setStarting] = useState(false);
  const cancelledRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return null;
    refreshInFlightRef.current = true;
    try {
      const json = await apiGet<LobbyRoomResponse>(`/api/lobbies/${lobbyId}`);
      if (cancelledRef.current) return null;
      setLobby(json.data);
      setError(null);
      return json.data;
    } catch {
      if (!cancelledRef.current) setError("Lobby unavailable");
      return null;
    } finally {
      refreshInFlightRef.current = false;
      if (!cancelledRef.current) setLoading(false);
    }
  }, [lobbyId]);

  useEffect(() => {
    cancelledRef.current = false;
    void refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    const start = () => {
      if (!timer) timer = setInterval(tick, 1500);
    };

    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const syncVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    // OPT-88 can replace this polling loop with push updates while preserving
    // the hook's state/action surface for the room UI.
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      stop();
    };
  }, [refresh]);

  const patchLobby = useCallback(
    async (
      body: Record<string, unknown>,
      options: { force?: boolean } = {}
    ) => {
      setMutating(true);
      try {
        const suffix = options.force ? "?force=true" : "";
        await apiPatch(`/api/lobbies/${lobbyId}${suffix}`, body);
        return await refresh();
      } finally {
        setMutating(false);
      }
    },
    [lobbyId, refresh]
  );

  const startLobby = useCallback(async () => {
    setStarting(true);
    try {
      const json = await apiPost<StartLobbyResponse>(
        `/api/lobbies/${lobbyId}/start`
      );
      return json.data.gameId;
    } finally {
      setStarting(false);
    }
  }, [lobbyId]);

  return {
    lobby,
    loading,
    error,
    mutating,
    starting,
    refresh,
    patchLobby,
    startLobby,
  };
}
