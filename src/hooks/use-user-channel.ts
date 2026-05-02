"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  useAuthedWebSocket,
  type ConnectionStatus,
} from "@/hooks/use-authed-websocket";
import {
  createEventDispatcher,
  type EventDispatcher,
} from "@/lib/realtime/event-dispatcher";

export interface UseUserChannelResult {
  connectionStatus: ConnectionStatus;
  /**
   * Subscribe to a single event type. Returns an unsubscribe function the
   * caller is expected to call on cleanup. Safe to call from `useEffect`.
   */
  subscribe: EventDispatcher["subscribe"];
}

const WORKER_URL = process.env.NEXT_PUBLIC_GAME_WORKER_URL ?? "";

/**
 * Authenticated client-side connection to the per-user `UserChannel` Durable
 * Object. Built on top of `useAuthedWebSocket` (OPT-351); owns:
 *
 *   - Mounting/unmounting around the `useSession()` userId. Signed-out is a
 *     no-op (no socket opened, status = "disconnected").
 *   - Token mint via `POST /api/realtime/token` — refetched on every reconnect.
 *   - A typed event dispatcher so feature subscribers get pinpoint delivery
 *     without each one parsing JSON.
 *
 * Mount once at the app shell — see `<UserChannelProvider>`. Multiple direct
 * callers would each open their own socket; the provider exists to enforce
 * single-socket-per-tab.
 *
 * No client→server vocabulary in OPT-353; T9 is the first ticket to add a
 * typed message handler on the worker side.
 */
export function useUserChannel(): UseUserChannelResult {
  const { data: session, status: sessionStatus } = useSession();
  const userId = session?.user?.id ?? null;

  // One dispatcher per hook instance. Memoized so the subscribe function
  // identity is stable across re-renders — important for downstream
  // `useEffect` deps in feature subscribers (OPT-354+).
  const dispatcher = useMemo(() => createEventDispatcher(), []);

  const url = useMemo(() => {
    if (!userId || !WORKER_URL) return null;
    return `${WORKER_URL}/user/${userId}/ws`;
  }, [userId]);

  const getToken = useCallback(async () => {
    const res = await fetch("/api/realtime/token", { method: "POST" });
    if (!res.ok) {
      throw new Error(`token mint failed: ${res.status}`);
    }
    const body = (await res.json()) as { data?: { token?: string } };
    const token = body.data?.token;
    if (!token) {
      throw new Error("token mint returned no token");
    }
    return token;
  }, []);

  const onMessage = useCallback((msg: unknown) => {
    if (
      msg
      && typeof msg === "object"
      && "type" in msg
      && typeof (msg as { type: unknown }).type === "string"
    ) {
      dispatcher.dispatch(msg as { type: string } & Record<string, unknown>);
    }
  }, [dispatcher]);

  const { connectionStatus, close } = useAuthedWebSocket<unknown>({
    url,
    getToken,
    onMessage,
  });

  // Tear the socket down on session loss without waiting for `url` to flip
  // to `null` on the next render. `useAuthedWebSocket`'s effect already
  // disposes when `url` changes, so this is mostly a belt-and-suspenders
  // close for "logged in → logged out" — and a guard for the
  // `unauthenticated` session-status returning `null` user before `url`
  // recomputes.
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      void close();
    }
  }, [sessionStatus, close]);

  const subscribe = useCallback<EventDispatcher["subscribe"]>(
    (type, handler) => dispatcher.subscribe(type, handler),
    [dispatcher],
  );

  // When signed out we never open the socket; `useAuthedWebSocket` reports
  // `connecting` on first render even with `url=null`, which is misleading.
  // Surface a stable `disconnected` for signed-out callers.
  const reportedStatus: ConnectionStatus = userId ? connectionStatus : "disconnected";

  return { connectionStatus: reportedStatus, subscribe };
}
