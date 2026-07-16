"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { useUserChannelEvents } from "@/components/realtime/user-channel-provider";
import {
  LobbyActionResponseSchema,
  LobbyRoomResponseSchema,
  StartLobbyResponseSchema,
} from "@/lib/validators/lobbies";
import type {
  LobbyRoomDeck,
  LobbyRoomMode,
  LobbyRoomState,
  LobbyRoomStatus,
} from "@/lib/lobbies/state";

export type { LobbyRoomDeck, LobbyRoomMode, LobbyRoomState, LobbyRoomStatus };

export const LOBBY_RECONCILIATION_INTERVAL_MS = 10_000;
export const LOBBY_RECONCILIATION_MAX_ATTEMPTS = 6;
export const LOBBY_REFRESH_TIMEOUT_MS = 9_000;
export const LOBBY_IN_GAME_CONFIRM_DELAY_MS = 250;

type SnapshotSource = "event" | "refresh";

interface RefreshLaunch {
  launched: boolean;
  promise: Promise<LobbyRoomState | null>;
}

export function useLobbyRoom(
  lobbyId: string,
  initialLobby: LobbyRoomState | null = null
) {
  const [lobby, setLobby] = useState<LobbyRoomState | null>(initialLobby);
  const [loading, setLoading] = useState(!initialLobby);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const cancelledRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const latestVersionRef = useRef<{
    lobbyId: string;
    version: number;
  } | null>(
    initialLobby
      ? { lobbyId: initialLobby.id, version: initialLobby.version }
      : null
  );
  const { connectionStatus, subscribe } = useUserChannelEvents();
  const previousConnectionStatusRef = useRef(connectionStatus);

  const applySnapshot = useCallback(
    (snapshot: LobbyRoomState, source: SnapshotSource) => {
      if (snapshot.id !== lobbyId) return false;

      const current = latestVersionRef.current;
      if (current?.lobbyId === lobbyId) {
        const isStale =
          source === "event"
            ? snapshot.version <= current.version
            : snapshot.version < current.version;
        if (isStale) return false;
      }

      latestVersionRef.current = {
        lobbyId: snapshot.id,
        version: snapshot.version,
      };
      setLobby(snapshot);
      return true;
    },
    [lobbyId]
  );

  const launchRefresh = useCallback((): RefreshLaunch => {
    if (refreshInFlightRef.current) {
      return { launched: false, promise: Promise.resolve(null) };
    }

    refreshInFlightRef.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      LOBBY_REFRESH_TIMEOUT_MS
    );

    const promise = (async () => {
      try {
        let json = await apiGet(
          `/api/lobbies/${lobbyId}`,
          LobbyRoomResponseSchema,
          { signal: controller.signal }
        );

        // Start persists IN_GAME before worker initialization. A GET can see
        // that transient row, so non-event delivery confirms it before the
        // snapshot reaches routing code. Successful realtime start events are
        // already emitted only after worker initialization and remain instant.
        if (json.data.status === "IN_GAME") {
          await new Promise((resolve) =>
            setTimeout(resolve, LOBBY_IN_GAME_CONFIRM_DELAY_MS)
          );
          json = await apiGet(
            `/api/lobbies/${lobbyId}`,
            LobbyRoomResponseSchema,
            { signal: controller.signal }
          );
        }

        if (cancelledRef.current) return null;
        applySnapshot(json.data, "refresh");
        setError(null);
        return json.data;
      } catch {
        if (!cancelledRef.current) setError("Lobby unavailable");
        return null;
      } finally {
        clearTimeout(timeout);
        refreshInFlightRef.current = false;
        if (!cancelledRef.current) setLoading(false);
      }
    })();

    return { launched: true, promise };
  }, [applySnapshot, lobbyId]);

  const refresh = useCallback(
    () => launchRefresh().promise,
    [launchRefresh]
  );

  useEffect(() => {
    cancelledRef.current = false;
    void refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  useEffect(() => {
    return subscribe("lobby:state_changed", (event) => {
      if (event.lobby.id !== lobbyId) return;
      applySnapshot(event.lobby, "event");
      // A successful push proves the lobby is reachable; clear any stale
      // "Lobby unavailable" left from a prior `refresh()` failure so the
      // banner doesn't linger after the room recovers.
      setError(null);
    });
  }, [applySnapshot, subscribe, lobbyId]);

  useEffect(() => {
    const previousStatus = previousConnectionStatusRef.current;
    previousConnectionStatusRef.current = connectionStatus;
    if (connectionStatus === "connected" && previousStatus !== "connected") {
      void refresh();
    }
  }, [connectionStatus, refresh]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  const isActivePreGameRoom =
    lobby?.status === "WAITING" || lobby?.status === "READY";

  useEffect(() => {
    if (!isActivePreGameRoom) return;

    let attempts = 0;
    const interval = setInterval(() => {
      const refreshLaunch = launchRefresh();
      if (!refreshLaunch.launched) return;

      attempts += 1;
      void refreshLaunch.promise;
      if (attempts >= LOBBY_RECONCILIATION_MAX_ATTEMPTS) {
        clearInterval(interval);
      }
    }, LOBBY_RECONCILIATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isActivePreGameRoom, lobbyId, launchRefresh]);

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
      const json = await apiPost(
        `/api/lobbies/${lobbyId}/start`,
        undefined,
        StartLobbyResponseSchema
      );
      return json.data.gameId;
    } finally {
      setStarting(false);
    }
  }, [lobbyId]);

  const leaveLobby = useCallback(async () => {
    setLeaving(true);
    try {
      await apiPost(
        `/api/lobbies/${lobbyId}/leave`,
        undefined,
        LobbyActionResponseSchema
      );
    } finally {
      setLeaving(false);
    }
  }, [lobbyId]);

  const closeLobby = useCallback(async () => {
    setClosing(true);
    try {
      await apiDelete(`/api/lobbies/${lobbyId}`, LobbyActionResponseSchema);
    } finally {
      setClosing(false);
    }
  }, [lobbyId]);

  return {
    lobby,
    loading,
    error,
    mutating,
    starting,
    leaving,
    closing,
    refresh,
    patchLobby,
    startLobby,
    leaveLobby,
    closeLobby,
  };
}
