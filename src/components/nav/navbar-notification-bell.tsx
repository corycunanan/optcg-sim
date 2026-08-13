"use client";

import { Bell } from "lucide-react";
import { forwardRef, type ComponentProps, type MouseEventHandler } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NavbarNotificationBellProps extends Omit<
  ComponentProps<"button">,
  "onClick"
> {
  unreadCount: number;
  onActivate?: () => void;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  popupOpen?: boolean;
  popupControls?: string;
}

/** Notification status indicator that becomes a popup trigger when activated. */
export const NavbarNotificationBell = forwardRef<
  HTMLButtonElement,
  NavbarNotificationBellProps
>(function NavbarNotificationBell(
  {
    unreadCount,
    onActivate,
    onClick,
    popupOpen = false,
    popupControls,
    ...triggerProps
  },
  ref
) {
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
          className="bg-error text-navy-900 absolute -top-1 -right-1 size-5 rounded p-0 font-semibold"
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
        className="text-content-secondary relative flex size-10 items-center justify-center rounded"
      >
        {content}
      </span>
    );
  }

  return (
    <Button
      {...triggerProps}
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      aria-label={accessibleName}
      aria-haspopup="dialog"
      aria-expanded={popupOpen}
      aria-controls={popupControls}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onActivate();
      }}
      className="text-content-secondary relative"
    >
      {content}
    </Button>
  );
});
