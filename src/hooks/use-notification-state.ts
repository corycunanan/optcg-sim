"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api-client";
import type { EventDispatcher } from "@/lib/realtime/event-dispatcher";
import { NotificationsResponseSchema } from "@/lib/validators/notifications";
import type {
  RealtimeServerEvent,
  SerializedNotification,
} from "@/types/realtime";

const NOTIFICATION_PAGE_SIZE = 20;
const NOTIFICATIONS_URL = `/api/notifications?page=1&limit=${NOTIFICATION_PAGE_SIZE}`;

type NotificationEvent = Extract<
  RealtimeServerEvent,
  { type: "notification:created" | "notification:resolved" }
>;

export type NotificationLoadState = "idle" | "loading" | "success" | "error";

export interface NotificationInboxState {
  notifications: SerializedNotification[];
  unreadCount: number;
  loadState: NotificationLoadState;
  refresh: () => Promise<void>;
}

interface NotificationSnapshot {
  notifications: SerializedNotification[];
  unreadCount: number;
}

const EMPTY_SNAPSHOT: NotificationSnapshot = {
  notifications: [],
  unreadCount: 0,
};

/** Apply one UserChannel event without issuing a follow-up request. */
export function applyNotificationEvent(
  snapshot: NotificationSnapshot,
  event: NotificationEvent
): NotificationSnapshot {
  const existingIndex = snapshot.notifications.findIndex(
    ({ id }) => id === event.notification.id
  );

  if (event.type === "notification:created") {
    const withoutDuplicate =
      existingIndex === -1
        ? snapshot.notifications
        : snapshot.notifications.filter(
            ({ id }) => id !== event.notification.id
          );
    return {
      notifications: [event.notification, ...withoutDuplicate].slice(
        0,
        NOTIFICATION_PAGE_SIZE
      ),
      unreadCount: event.unreadCount,
    };
  }

  if (existingIndex === -1) {
    return { ...snapshot, unreadCount: event.unreadCount };
  }

  const notifications = [...snapshot.notifications];
  notifications[existingIndex] = event.notification;
  return { notifications, unreadCount: event.unreadCount };
}

/**
 * Shared notification inbox state for the app-shell UserChannel provider.
 * Push events update the first page and badge count immediately. A mount and
 * visibility reconciliation heals events missed while the socket was down.
 */
export function useNotificationState(
  subscribe: EventDispatcher["subscribe"],
  enabled: boolean
): NotificationInboxState {
  const [snapshot, setSnapshot] =
    useState<NotificationSnapshot>(EMPTY_SNAPSHOT);
  const [loadState, setLoadState] = useState<NotificationLoadState>("idle");
  const requestIdRef = useRef(0);
  const eventSequenceRef = useRef(0);
  const eventJournalRef = useRef<
    Array<{ sequence: number; event: NotificationEvent }>
  >([]);

  const applyRealtimeEvent = useCallback((event: NotificationEvent) => {
    const sequence = ++eventSequenceRef.current;
    eventJournalRef.current.push({ sequence, event });
    setSnapshot((current) => applyNotificationEvent(current, event));
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    const requestId = ++requestIdRef.current;
    const startSequence = eventSequenceRef.current;
    setLoadState("loading");

    try {
      const response = await apiGet(
        NOTIFICATIONS_URL,
        NotificationsResponseSchema
      );
      if (requestId !== requestIdRef.current) return;

      let reconciled: NotificationSnapshot = {
        notifications: response.data.notifications,
        unreadCount: response.data.unreadCount,
      };
      const appliedThrough = eventSequenceRef.current;
      for (const entry of eventJournalRef.current) {
        if (entry.sequence > startSequence) {
          reconciled = applyNotificationEvent(reconciled, entry.event);
        }
      }
      eventJournalRef.current = eventJournalRef.current.filter(
        ({ sequence }) => sequence > appliedThrough
      );
      setSnapshot(reconciled);
      setLoadState("success");
    } catch {
      if (requestId === requestIdRef.current) setLoadState("error");
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      eventSequenceRef.current = 0;
      eventJournalRef.current = [];
      queueMicrotask(() => {
        setSnapshot(EMPTY_SNAPSHOT);
        setLoadState("idle");
      });
      return;
    }

    queueMicrotask(() => {
      void refresh();
    });
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribeCreated = subscribe(
      "notification:created",
      applyRealtimeEvent
    );
    const unsubscribeResolved = subscribe(
      "notification:resolved",
      applyRealtimeEvent
    );
    return () => {
      unsubscribeCreated();
      unsubscribeResolved();
    };
  }, [applyRealtimeEvent, enabled, subscribe]);

  useEffect(() => {
    if (!enabled) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [enabled, refresh]);

  return { ...snapshot, loadState, refresh };
}
