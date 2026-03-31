"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
  className?: string;
}

export function UserAvatar({ user, size = "md", variant = "light", className }: UserAvatarProps) {
  const initials = (user.username || user.name || "?").charAt(0).toUpperCase();

  return (
    <Avatar
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
    </Avatar>
  );
}
