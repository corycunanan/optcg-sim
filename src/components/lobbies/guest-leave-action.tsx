"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  } catch (error) {
    onError(error);
  } finally {
    returnToBrowser();
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
