"use client";

import { Avatar, AvatarImage, AvatarFallback, AvatarBadge } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface User {
  username: string | null;
  name: string | null;
  image: string | null;
}

interface UserAvatarProps {
  user: User;
  size?: "sm" | "md";
  variant?: "light" | "dark";
  showOnline?: boolean;
  className?: string;
}

export function UserAvatar({ user, size = "md", variant = "light", showOnline, className }: UserAvatarProps) {
  const initials = (user.username || user.name || "?").charAt(0).toUpperCase();

  return (
    <Avatar
      size={size === "sm" ? "default" : "lg"}
      className={cn(
        size === "sm" ? "size-8" : "size-10",
        className,
      )}
    >
      {user.image && <AvatarImage src={user.image} alt="" />}
      <AvatarFallback
        className={cn(
          "text-xs font-semibold",
          variant === "dark"
            ? "bg-navy-700 text-content-inverse"
            : "bg-navy-900 text-content-inverse",
        )}
      >
        {initials}
      </AvatarFallback>
      {showOnline && (
        <AvatarBadge className="bg-success ring-navy-900" />
      )}
    </Avatar>
  );
}
