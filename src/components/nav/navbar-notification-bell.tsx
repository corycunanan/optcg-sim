"use client";

import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavbarNotificationBellProps {
  unreadCount: number;
  onActivate?: () => void;
}

/**
 * Activation seam for the notification panel owned by OPT-528. That ticket
 * will supply the handler and add popup ARIA only when a real panel exists.
 */
export function NavbarNotificationBell({
  unreadCount,
  onActivate,
}: NavbarNotificationBellProps) {
  const normalizedUnreadCount = Math.max(0, unreadCount);
  const badgeLabel =
    normalizedUnreadCount > 9 ? "9+" : String(normalizedUnreadCount);
  const unreadAnnouncement =
    normalizedUnreadCount === 0
      ? "No unread notifications"
      : `${normalizedUnreadCount} unread ${
          normalizedUnreadCount === 1 ? "notification" : "notifications"
        }`;
  const accessibleName = `Notifications, ${unreadAnnouncement}`;
  const content = (
    <>
      <Bell data-icon="icon-only" aria-hidden="true" />
      {normalizedUnreadCount > 0 && (
        <Badge
          data-slot="notification-unread-badge"
          aria-hidden="true"
          className="bg-error text-navy-900 absolute -top-1 -right-1 size-5 rounded-full p-0 text-xs font-bold"
        >
          {badgeLabel}
        </Badge>
      )}
    </>
  );

  if (!onActivate) {
    return (
      <span
        role="status"
        aria-label={accessibleName}
        className="text-content-secondary relative flex size-10 items-center justify-center rounded-full"
      >
        {content}
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={accessibleName}
      onClick={onActivate}
      className={cn(
        "text-content-secondary hover:bg-surface-2 hover:text-content-primary relative rounded-full",
        "focus-visible:ring-border-focus focus-visible:ring-2 focus-visible:outline-none"
      )}
    >
      {content}
    </Button>
  );
}
