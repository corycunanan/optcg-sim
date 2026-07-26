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
  const [kicking, setKicking] = useState(false);
  const [spectatorToggling, setSpectatorToggling] = useState(false);
  const [removedByHost, setRemovedByHost] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const authoritativeLobbyRef = useRef<LobbyRoomState | null>(initialLobby);
  const spectatorToggleRef = useRef<{
    requestId: number;
    desired: boolean;
  } | null>(null);
  const spectatorToggleRequestIdRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const latestVersionRef = useRef<{
    lobbyId: string;
    version: number;
  } | null>(
    initialLobby?.version !== undefined
      ? { lobbyId: initialLobby.id, version: initialLobby.version }
      : null
  );
  const { connectionStatus, subscribe } = useUserChannelEvents();
  const previousConnectionStatusRef = useRef(connectionStatus);

  const applySnapshot = useCallback(
    (snapshot: LobbyRoomState, source: SnapshotSource) => {
      if (snapshot.id !== lobbyId) return false;

      if (snapshot.version !== undefined) {
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
      }

      authoritativeLobbyRef.current = snapshot;
      const pendingToggle = spectatorToggleRef.current;
      if (pendingToggle && snapshot.allowSpectators !== pendingToggle.desired) {
        setLobby({ ...snapshot, allowSpectators: pendingToggle.desired });
        return true;
      }

      if (pendingToggle) {
        spectatorToggleRef.current = null;
        setSpectatorToggling(false);
      }
      setLobby(snapshot);
      return true;
    },
    [lobbyId]
  );

  const launchRefresh = useCallback(
    (queueIfBusy = false): RefreshLaunch => {
      if (refreshInFlightRef.current) {
        if (queueIfBusy) queuedRefreshRef.current = true;
        return { launched: false, promise: Promise.resolve(null) };
      }

      refreshInFlightRef.current = true;
      const promise = (async () => {
        let latestSnapshot: LobbyRoomState | null = null;
        try {
          do {
            queuedRefreshRef.current = false;
            const controller = new AbortController();
            const timeout = setTimeout(
              () => controller.abort(),
              LOBBY_REFRESH_TIMEOUT_MS
            );

            try {
              const json = await apiGet(
                `/api/lobbies/${lobbyId}`,
                LobbyRoomResponseSchema,
                { signal: controller.signal }
              );
              latestSnapshot = json.data;
              if (cancelledRef.current) return null;
              applySnapshot(json.data, "refresh");
              setError(null);
            } catch {
              latestSnapshot = null;
              if (!cancelledRef.current) setError("Lobby unavailable");
            } finally {
              clearTimeout(timeout);
            }
          } while (queuedRefreshRef.current && !cancelledRef.current);

          return latestSnapshot;
        } finally {
          refreshInFlightRef.current = false;
          if (!cancelledRef.current) setLoading(false);
        }
      })();

      return { launched: true, promise };
    },
    [applySnapshot, lobbyId]
  );

  const refresh = useCallback(
    () => launchRefresh(true).promise,
    [launchRefresh]
  );

  useEffect(() => {
    cancelledRef.current = false;
    void refresh();
    return () => {
      cancelledRef.current = true;
      queuedRefreshRef.current = false;
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
    return subscribe("lobby:guest_removed", (event) => {
      if (event.lobbyId !== lobbyId) return;
      setRemovedByHost(event.hostName);
    });
  }, [subscribe, lobbyId]);

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
        await apiPatch(
          `/api/lobbies/${lobbyId}${suffix}`,
          body,
          LobbyActionResponseSchema
        );
        return await refresh();
      } finally {
        setMutating(false);
      }
    },
    [lobbyId, refresh]
  );

  const setAllowSpectators = useCallback(
    async (allowSpectators: boolean) => {
      const currentLobby = authoritativeLobbyRef.current;
      if (
        !currentLobby ||
        currentLobby.viewerRole !== "host" ||
        spectatorToggleRef.current ||
        currentLobby.allowSpectators === allowSpectators
      ) {
        return;
      }

      const requestId = spectatorToggleRequestIdRef.current + 1;
      spectatorToggleRequestIdRef.current = requestId;
      spectatorToggleRef.current = { requestId, desired: allowSpectators };
      setSpectatorToggling(true);
      setLobby((current) =>
        current ? { ...current, allowSpectators } : current
      );

      try {
        await apiPatch(
          `/api/lobbies/${lobbyId}`,
          { allowSpectators },
          LobbyActionResponseSchema
        );
        if (spectatorToggleRef.current?.requestId === requestId) {
          const authoritativeLobby = authoritativeLobbyRef.current;
          if (authoritativeLobby) {
            authoritativeLobbyRef.current = {
              ...authoritativeLobby,
              allowSpectators,
            };
          }
          spectatorToggleRef.current = null;
          setSpectatorToggling(false);
        }
      } catch (error) {
        if (spectatorToggleRef.current?.requestId === requestId) {
          spectatorToggleRef.current = null;
          setSpectatorToggling(false);
          setLobby(authoritativeLobbyRef.current);
        }
        throw error;
      }
    },
    [lobbyId]
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

  const kickGuest = useCallback(async () => {
    setKicking(true);
    try {
      await apiDelete(
        `/api/lobbies/${lobbyId}/guest`,
        LobbyActionResponseSchema
      );
      return await refresh();
    } finally {
      setKicking(false);
    }
  }, [lobbyId, refresh]);

  return {
    lobby,
    loading,
    error,
    mutating,
    starting,
    leaving,
    closing,
    kicking,
    spectatorToggling,
    removedByHost,
    refresh,
    patchLobby,
    setAllowSpectators,
    startLobby,
    leaveLobby,
    closeLobby,
    kickGuest,
  };
}
