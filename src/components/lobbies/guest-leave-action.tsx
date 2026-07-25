"use client";

import { EllipsisVertical, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api-client";

interface GuestLeaveActionProps {
  isGuest: boolean;
  leaving: boolean;
  disabled?: boolean;
  compact?: boolean;
  onLeave: () => void;
}

interface RunGuestLeaveOptions {
  leave: () => Promise<void>;
  onSuccess: () => void;
  onError: (error: unknown) => void;
  returnToBrowser: () => void;
}

export async function runGuestLeave({
  leave,
  onSuccess,
  onError,
  returnToBrowser,
}: RunGuestLeaveOptions) {
  try {
    await leave();
    onSuccess();
    returnToBrowser();
  } catch (error) {
    // A missing lobby/seat is already the desired terminal state, so it is
    // safe to leave the room. Retryable failures keep the guest in place.
    if (error instanceof ApiError && error.status === 404) {
      onSuccess();
      returnToBrowser();
      return;
    }
    onError(error);
  }
}

export function GuestLeaveAction({
  isGuest,
  leaving,
  disabled = false,
  compact = false,
  onLeave,
}: GuestLeaveActionProps) {
  if (!isGuest) return null;

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || leaving}
            aria-label="More actions for guest"
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onLeave}>
            <LogOut />
            {leaving ? "Leaving..." : "Leave lobby"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={onLeave}
      disabled={disabled || leaving}
    >
      <LogOut data-icon="inline-start" />
      {leaving ? "Leaving..." : "Leave Lobby"}
    </Button>
  );
}
