"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import { useUserChannelEvents } from "@/components/realtime/user-channel-provider";
import { UserAvatar } from "@/components/social/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ApiError, apiPut } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import type { SerializedNotification } from "@/types/realtime";
import { NavbarNotificationBell } from "./navbar-notification-bell";

const NOTIFICATION_LIMIT = 20;
type FriendRequestAction = "accept" | "decline";

function displayName(notification: SerializedNotification): string {
  return notification.actor?.username || notification.actor?.name || "A player";
}

function sortNewestFirst(
  notifications: SerializedNotification[]
): SerializedNotification[] {
  return [...notifications]
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
        right.id.localeCompare(left.id)
    )
    .slice(0, NOTIFICATION_LIMIT);
}

function isResolved(notification: SerializedNotification): boolean {
  return (
    notification.status === "ACCEPTED" ||
    notification.status === "DECLINED" ||
    notification.status === "DISMISSED"
  );
}

function outcomeDescription(
  notification: SerializedNotification,
  optimisticAction?: FriendRequestAction
): string {
  const name = displayName(notification);
  const status =
    optimisticAction === "accept"
      ? "ACCEPTED"
      : optimisticAction === "decline"
        ? "DECLINED"
        : notification.status;

  if (status === "ACCEPTED") return `You're now friends with ${name}`;
  if (status === "DECLINED") return `Friend request from ${name} declined`;
  if (status === "DISMISSED") return `Friend request from ${name} dismissed`;
  return `${name} sent you a friend request`;
}

export function NavbarNotificationPanel() {
  const { notificationInbox } = useUserChannelEvents();
  const { notifications, unreadCount, loadState, refresh } = notificationInbox;
  const panelId = useId();
  const titleId = `${panelId}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const authoritativeResolvedRef = useRef(new Set<string>());
  const readRequestsRef = useRef(new Set<string>());
  const actionRequestsRef = useRef(new Set<string>());
  const [open, setOpen] = useState(false);
  const [badgeSuppressed, setBadgeSuppressed] = useState(false);
  const [locallyReadIds, setLocallyReadIds] = useState<Set<string>>(
    () => new Set()
  );
  const [optimisticActions, setOptimisticActions] = useState<
    Map<string, FriendRequestAction>
  >(() => new Map());
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [announcement, setAnnouncement] = useState("");

  const visibleNotifications = useMemo(
    () => sortNewestFirst(notifications),
    [notifications]
  );

  useEffect(() => {
    authoritativeResolvedRef.current = new Set(
      notifications.filter(isResolved).map(({ id }) => id)
    );
  }, [notifications]);

  const markVisibleRead = useCallback(
    async (items: SerializedNotification[]) => {
      const pending = items.filter(
        ({ id, status }) =>
          status === "PENDING" &&
          !locallyReadIds.has(id) &&
          !readRequestsRef.current.has(id)
      );
      if (pending.length === 0) return;

      for (const { id } of pending) readRequestsRef.current.add(id);

      const results = await Promise.allSettled(
        pending.map(({ id }) =>
          apiPut(`/api/notifications/${id}`, { action: "read" })
        )
      );
      const failedIds = pending
        .filter((_, index) => results[index]?.status === "rejected")
        .map(({ id }) => id);
      const succeededIds = pending
        .filter((_, index) => results[index]?.status === "fulfilled")
        .map(({ id }) => id);
      for (const { id } of pending) readRequestsRef.current.delete(id);

      if (succeededIds.length > 0) {
        setLocallyReadIds((current) => {
          const next = new Set(current);
          for (const id of succeededIds) next.add(id);
          return next;
        });
      }
      if (failedIds.length > 0) {
        setBadgeSuppressed(false);
        toast.error("Some notifications could not be marked read.");
      }
      void refresh();
    },
    [locallyReadIds, refresh]
  );

  useEffect(() => {
    if (!open) return;
    void markVisibleRead(visibleNotifications);
  }, [markVisibleRead, open, visibleNotifications]);

  useEffect(() => {
    if (
      !open &&
      visibleNotifications.some(
        ({ id, status }) => status === "PENDING" && !locallyReadIds.has(id)
      )
    ) {
      setBadgeSuppressed(false);
    }
  }, [locallyReadIds, open, visibleNotifications]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        setBadgeSuppressed(true);
        void markVisibleRead(visibleNotifications);
      }
    },
    [markVisibleRead, visibleNotifications]
  );

  const markAllRead = useCallback(async () => {
    const previous = locallyReadIds;
    const allPendingIds = notifications
      .filter(({ status }) => status === "PENDING")
      .map(({ id }) => id);
    setLocallyReadIds((current) => new Set([...current, ...allPendingIds]));
    setBadgeSuppressed(true);
    try {
      await apiPut("/api/notifications", { action: "mark-all-read" });
      setAnnouncement("All notifications marked read");
      void refresh();
    } catch (error) {
      setLocallyReadIds((current) => {
        const next = new Set(current);
        for (const id of allPendingIds) {
          if (!previous.has(id)) next.delete(id);
        }
        return next;
      });
      setBadgeSuppressed(false);
      toast.error(
        error instanceof ApiError && error.status === 429
          ? "Too many requests. Try marking notifications read again shortly."
          : "Could not mark all notifications read."
      );
    }
  }, [locallyReadIds, notifications, refresh]);

  const resolveRequest = useCallback(
    async (
      notification: SerializedNotification,
      action: FriendRequestAction
    ) => {
      if (actionRequestsRef.current.has(notification.id)) return;
      actionRequestsRef.current.add(notification.id);
      const name = displayName(notification);
      const optimisticMessage =
        action === "accept"
          ? `You're now friends with ${name}`
          : `Friend request from ${name} declined`;

      setOptimisticActions((current) =>
        new Map(current).set(notification.id, action)
      );
      setResolvingIds((current) => new Set(current).add(notification.id));
      setAnnouncement(optimisticMessage);

      try {
        await apiPut(`/api/notifications/${notification.id}`, { action });
        void refresh();
      } catch (error) {
        const convergedElsewhere =
          authoritativeResolvedRef.current.has(notification.id) ||
          (error instanceof ApiError &&
            (error.status === 409 || error.status === 410));

        if (convergedElsewhere) {
          setAnnouncement(`${optimisticMessage}. Request already resolved.`);
          void refresh();
        } else {
          setOptimisticActions((current) => {
            const next = new Map(current);
            next.delete(notification.id);
            return next;
          });
          setAnnouncement(
            `Could not ${action} the request from ${name}. Request restored.`
          );
          toast.error(
            error instanceof ApiError && error.status === 429
              ? "Too many requests. Try again shortly."
              : `Could not ${action} this friend request. Please try again.`
          );
        }
      } finally {
        actionRequestsRef.current.delete(notification.id);
        setResolvingIds((current) => {
          const next = new Set(current);
          next.delete(notification.id);
          return next;
        });
      }
    },
    [refresh]
  );

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        "[data-notification-row]"
      ) ?? []
    );
    if (rows.length === 0) return;
    const currentRow = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-notification-row]"
    );
    const currentIndex = currentRow ? rows.indexOf(currentRow) : -1;
    const nextIndex =
      event.key === "ArrowDown"
        ? (currentIndex + 1) % rows.length
        : (currentIndex - 1 + rows.length) % rows.length;
    event.preventDefault();
    rows[nextIndex]?.focus();
  };

  const hasUnread =
    unreadCount > 0 ||
    visibleNotifications.some(
      ({ id, status }) => status === "PENDING" && !locallyReadIds.has(id)
    );
  const visibleUnreadCount = badgeSuppressed ? 0 : unreadCount;

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild>
        <NavbarNotificationBell
          unreadCount={visibleUnreadCount}
          onActivate={() => {
            if (!open) setBadgeSuppressed(true);
          }}
          popupOpen={open}
          popupControls={panelId}
        />
      </PopoverTrigger>
      <PopoverContent
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-labelledby={titleId}
        align="end"
        sideOffset={8}
        onKeyDown={handlePanelKeyDown}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          panelRef.current
            ?.querySelector<HTMLElement>(
              "[data-notification-row], [data-empty-state]"
            )
            ?.focus();
        }}
        className="border-border bg-popover text-popover-foreground w-96 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-lg border p-0 ring-0"
      >
        <div className="border-border flex items-center justify-between gap-4 border-b px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold">
            Notifications
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!hasUnread}
            onClick={() => void markAllRead()}
            className="text-accent-text hover:text-content-primary"
          >
            Mark all read
          </Button>
        </div>

        {visibleNotifications.length > 0 ? (
          <ul
            aria-label="Recent notifications"
            className="max-h-96 overflow-y-auto"
          >
            {visibleNotifications.map((notification) => {
              const optimisticAction = isResolved(notification)
                ? undefined
                : optimisticActions.get(notification.id);
              const resolved =
                isResolved(notification) || optimisticAction !== undefined;
              const unread =
                notification.status === "PENDING" &&
                !locallyReadIds.has(notification.id);
              const name = displayName(notification);
              const description = outcomeDescription(
                notification,
                optimisticAction
              );

              return (
                <li
                  key={notification.id}
                  data-notification-row
                  tabIndex={0}
                  aria-label={`${unread ? "Unread. " : ""}${description}, ${formatRelativeTime(notification.createdAt)}`}
                  className={cn(
                    "border-border focus-visible:ring-border-focus flex gap-3 border-b px-4 py-3 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset",
                    unread ? "bg-surface-raised" : "bg-popover"
                  )}
                >
                  <UserAvatar
                    user={{
                      username: notification.actor?.username ?? null,
                      name: notification.actor?.name ?? null,
                      image: notification.actor?.image ?? null,
                    }}
                    size="sm"
                    variant="dark"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-content-primary text-sm leading-5">
                      {resolved ? (
                        description
                      ) : (
                        <>
                          <strong className="font-semibold">{name}</strong> sent
                          you a friend request
                        </>
                      )}
                    </p>
                    <time
                      dateTime={notification.createdAt}
                      className="text-content-tertiary mt-1 block text-xs"
                    >
                      {formatRelativeTime(notification.createdAt)}
                    </time>
                    {!resolved && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          variant="gold"
                          size="sm"
                          disabled={resolvingIds.has(notification.id)}
                          aria-label={`Accept friend request from ${name}`}
                          onClick={() =>
                            void resolveRequest(notification, "accept")
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={resolvingIds.has(notification.id)}
                          aria-label={`Decline friend request from ${name}`}
                          onClick={() =>
                            void resolveRequest(notification, "decline")
                          }
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div
            data-empty-state
            role="status"
            aria-label={
              loadState === "loading"
                ? "Loading notifications"
                : loadState === "error"
                  ? "Notifications unavailable"
                  : "No notifications yet"
            }
            tabIndex={0}
            className="focus-visible:ring-border-focus m-4 rounded-md px-4 py-8 text-center outline-none focus-visible:ring-2"
          >
            <p className="text-content-primary text-sm font-medium">
              {loadState === "loading"
                ? "Loading notifications…"
                : loadState === "error"
                  ? "Notifications unavailable"
                  : "No notifications yet"}
            </p>
            {loadState === "error" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => void refresh()}
              >
                Try again
              </Button>
            )}
          </div>
        )}
        <p aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </p>
      </PopoverContent>
    </Popover>
  );
}
