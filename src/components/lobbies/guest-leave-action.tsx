"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";

interface GuestLeaveActionProps {
  isGuest: boolean;
  leaving: boolean;
  disabled?: boolean;
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
  onLeave,
}: GuestLeaveActionProps) {
  if (!isGuest) return null;

  return (
    <Button
      variant="secondary"
      onClick={onLeave}
      disabled={disabled || leaving}
    >
      <LogOut data-icon="inline-start" />
      {leaving ? "Leaving..." : "Leave Lobby"}
    </Button>
  );
}
