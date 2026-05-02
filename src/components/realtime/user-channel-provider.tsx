"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useUserChannel } from "@/hooks/use-user-channel";
import type { ConnectionStatus } from "@/hooks/use-authed-websocket";
import type { EventDispatcher } from "@/lib/realtime/event-dispatcher";

interface UserChannelContextValue {
  subscribe: EventDispatcher["subscribe"];
  connectionStatus: ConnectionStatus;
}

const UserChannelContext = createContext<UserChannelContextValue | null>(null);

/**
 * Mounts a single `useUserChannel()` instance at the authenticated app
 * boundary and exposes `subscribe` + `connectionStatus` via React Context.
 * Mount once in the root layout — multiple providers would each open a
 * socket, breaking single-socket-per-tab.
 */
export function UserChannelProvider({ children }: { children: ReactNode }) {
  const { subscribe, connectionStatus } = useUserChannel();

  const value = useMemo<UserChannelContextValue>(
    () => ({ subscribe, connectionStatus }),
    [subscribe, connectionStatus],
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
