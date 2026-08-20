"use client";

import { Bell } from "lucide-react";
import { forwardRef, type ComponentProps, type MouseEventHandler } from "react";
import {
  navSlabIconBoxStyles,
  navSlabOpenStyles,
  navSlabStyles,
} from "@/components/nav/navbar-slab";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
    className,
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
      {/* Sized here rather than inherited: the trigger is no longer a `Button`,
          so nothing upstream normalizes a bare lucide glyph to 16px. */}
      <Bell className="size-4" data-icon="icon-only" aria-hidden="true" />
      {normalizedUnreadCount > 0 && (
        <Badge
          data-slot="notification-unread-badge"
          aria-hidden="true"
          className="border-error-fill-border bg-error text-navy-900 absolute -top-1 -right-1 size-5 rounded p-0 font-semibold"
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

  // A bare `<button>` rather than `Button variant="ghost" size="icon"`
  // (OPT-712): the slab overrode that recipe's radius, height, width, padding,
  // transition, and every hover color, leaving the shared primitive as a source
  // of dead CSS. It shares one string with the nav links instead.
  //
  // Rest color stays `content-secondary` while the links rest at
  // `content-primary` — the bell is a secondary control and should not compete
  // with wayfinding — and both converge on `content-inverse` on hover, focus,
  // and open, so the bar reads as one family the moment it is touched.
  return (
    <button
      {...triggerProps}
      ref={ref}
      type="button"
      aria-label={accessibleName}
      aria-haspopup="dialog"
      aria-expanded={popupOpen}
      aria-controls={popupControls}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onActivate();
      }}
      className={cn(
        navSlabStyles,
        "text-content-secondary",
        // Held for as long as the panel is on screen, the way an active link
        // holds its section. Driven by the prop that already owns the open
        // state, so the paint cannot drift from the behavior.
        popupOpen && navSlabOpenStyles,
        className
      )}
    >
      <span className={navSlabIconBoxStyles}>{content}</span>
    </button>
  );
});
