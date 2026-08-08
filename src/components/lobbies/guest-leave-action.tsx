"use client";

import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api-client";

interface GuestLeaveMenuItemProps {
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

/**
 * Guest's own seat action, contributed to the seat card's `⋮` overflow menu.
 * Leaving is reversible (the guest can rejoin with the party code), so this
 * commits immediately instead of routing through a confirmation.
 */
export function GuestLeaveMenuItem({
  leaving,
  disabled = false,
  onLeave,
}: GuestLeaveMenuItemProps) {
  return (
    <DropdownMenuItem disabled={disabled || leaving} onSelect={onLeave}>
      <LogOut />
      {leaving ? "Leaving..." : "Leave lobby"}
    </DropdownMenuItem>
  );
}
