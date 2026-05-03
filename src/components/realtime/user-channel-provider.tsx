"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUserChannel } from "@/hooks/use-user-channel";
import type { ConnectionStatus } from "@/hooks/use-authed-websocket";
import type { EventDispatcher } from "@/lib/realtime/event-dispatcher";
import { apiGet } from "@/lib/api-client";
import {
  EMPTY_PRESENCE,
  applyOfflineEvent,
  applyOnlineEvent,
  applyPresenceSeed,
  type PresenceEntry,
  type PresenceMap,
} from "./presence-state";

export type { PresenceEntry, PresenceMap } from "./presence-state";

interface UserChannelContextValue {
  subscribe: EventDispatcher["subscribe"];
  connectionStatus: ConnectionStatus;
  presence: PresenceMap;
  /**
   * Register a set of user ids to track presence for. New ids trigger a
   * single `GET /api/users/presence?ids=...` to seed `online` + `lastSeen`;
   * already-tracked ids are no-ops. Call from `useEffect` in any component
   * that renders user presence.
   */
  trackPresence: (ids: readonly string[]) => void;
}

const UserChannelContext = createContext<UserChannelContextValue | null>(null);

/**
 * Mounts a single `useUserChannel()` instance at the authenticated app
 * boundary and exposes `subscribe` + `connectionStatus` + the presence map
 * via React Context. Mount once in the root layout — multiple providers
 * would each open a socket, breaking single-socket-per-tab.
 */
export function UserChannelProvider({ children }: { children: ReactNode }) {
  const { subscribe, connectionStatus } = useUserChannel();
  const [presence, setPresence] = useState<PresenceMap>(EMPTY_PRESENCE);
  const trackedRef = useRef<Set<string>>(new Set());

  const trackPresence = useCallback((ids: readonly string[]) => {
    const tracked = trackedRef.current;
    const fresh: string[] = [];
    for (const id of ids) {
      if (!id || tracked.has(id)) continue;
      tracked.add(id);
      fresh.push(id);
    }
    if (fresh.length === 0) return;
    void seedPresence(fresh).then((seed) => {
      if (!seed) return;
      setPresence((prev) => applyPresenceSeed(prev, seed));
    });
  }, []);

  useEffect(() => {
    const unsubOnline = subscribe("presence:friend_online", (event) => {
      setPresence((prev) => applyOnlineEvent(prev, event.userId));
    });
    const unsubOffline = subscribe("presence:friend_offline", (event) => {
      setPresence((prev) => applyOfflineEvent(prev, event.userId, event.lastSeen));
    });
    return () => {
      unsubOnline();
      unsubOffline();
    };
  }, [subscribe]);

  const value = useMemo<UserChannelContextValue>(
    () => ({ subscribe, connectionStatus, presence, trackPresence }),
    [subscribe, connectionStatus, presence, trackPresence],
  );

  return (
    <UserChannelContext.Provider value={value}>
      {children}
    </UserChannelContext.Provider>
  );
}

/**
 * Subscribe to `UserChannel` events from anywhere inside the provider tree.
 * Throws if the caller is rendered outside `<UserChannelProvider>` — it
 * indicates a layout misconfiguration, not a recoverable runtime condition.
 */
export function useUserChannelEvents(): UserChannelContextValue {
  const ctx = useContext(UserChannelContext);
  if (!ctx) {
    throw new Error(
      "useUserChannelEvents must be used inside <UserChannelProvider>",
    );
  }
  return ctx;
}

async function seedPresence(
  ids: string[],
): Promise<Record<string, PresenceEntry> | null> {
  if (ids.length === 0) return null;
  try {
    const qs = `?ids=${encodeURIComponent(ids.join(","))}`;
    const res = await apiGet<{ data: Record<string, PresenceEntry> }>(
      `/api/users/presence${qs}`,
    );
    return res.data ?? {};
  } catch (err) {
    console.warn("[UserChannel] presence seed failed", { ids, error: err });
    return null;
  }
}
