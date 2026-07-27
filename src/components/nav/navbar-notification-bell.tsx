"use client";

import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavbarNotificationBellProps {
  unreadCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Controlled trigger seam for the notification panel owned by OPT-528.
 * Keeping panel state outside the button lets that panel attach without
 * changing the realtime badge or trigger contract.
 */
export function NavbarNotificationBell({
  unreadCount,
  open,
  onOpenChange,
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

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Notifications"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
      className={cn(
        "text-content-secondary hover:bg-surface-2 hover:text-content-primary relative rounded-full",
        "focus-visible:ring-border-focus focus-visible:ring-2 focus-visible:outline-none"
      )}
    >
      <Bell data-icon="icon-only" aria-hidden="true" />
      <span className="sr-only" aria-live="polite">
        {unreadAnnouncement}
      </span>
      {normalizedUnreadCount > 0 && (
        <Badge
          data-slot="notification-unread-badge"
          aria-hidden="true"
          className="bg-error text-navy-900 absolute -top-1 -right-1 size-5 rounded-full p-0 text-xs font-bold"
        >
          {badgeLabel}
        </Badge>
      )}
    </Button>
  );
}
