"use client";

import { Avatar, AvatarImage, AvatarFallback, AvatarBadge } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/relative-time";

interface User {
  username: string | null;
  name: string | null;
  image: string | null;
}

interface UserAvatarProps {
  user: User;
  size?: "sm" | "md";
  variant?: "light" | "dark";
  /** `true` shows the green "online" dot. `false` is offline (no dot). */
  showOnline?: boolean;
  /**
   * When `showOnline === false` and `lastSeen` is non-null, the avatar wraps
   * in a `<Tooltip>` showing "Active {relative}". Pure presentation — the
   * caller decides which value to pass.
   */
  lastSeen?: string | null;
  className?: string;
}

export function UserAvatar({
  user,
  size = "md",
  variant = "light",
  showOnline,
  lastSeen,
  className,
}: UserAvatarProps) {
  const initials = (user.username || user.name || "?").charAt(0).toUpperCase();
  const isOnline = showOnline === true;
  const offlineLabel = !isOnline && lastSeen ? `Active ${formatRelativeTime(lastSeen)}` : null;
  const ariaLabel = isOnline ? "Online" : (offlineLabel ?? undefined);

  const avatar = (
    <Avatar
      size={size === "sm" ? "default" : "lg"}
      className={cn(
        size === "sm" ? "size-8" : "size-10",
        className,
      )}
      aria-label={ariaLabel}
    >
      {user.image && <AvatarImage src={user.image} alt="" />}
      <AvatarFallback
        className={cn(
          "text-xs font-semibold",
          variant === "dark"
            ? "bg-navy-700 text-content-inverse"
            : "bg-secondary text-secondary-foreground",
        )}
      >
        {initials}
      </AvatarFallback>
      {isOnline && (
        <AvatarBadge className="bg-success ring-background" />
      )}
    </Avatar>
  );

  if (offlineLabel) {
    return (
      <Tooltip content={offlineLabel}>
        <span className="inline-flex" tabIndex={0} aria-label={offlineLabel}>
          {avatar}
        </span>
      </Tooltip>
    );
  }
  return avatar;
}
