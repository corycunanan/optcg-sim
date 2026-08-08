"use client";

import { X } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface RunHostCloseOptions {
  close: () => Promise<void>;
  onSuccess: () => void;
  onError: (error: unknown) => void;
  returnToBrowser: () => void;
}

export async function runHostClose({
  close,
  onSuccess,
  onError,
  returnToBrowser,
}: RunHostCloseOptions) {
  try {
    await close();
    onSuccess();
    returnToBrowser();
  } catch (error) {
    // CLOSED is already the desired terminal state if another request won.
    if (error instanceof ApiError && error.status === 404) {
      onSuccess();
      returnToBrowser();
      return;
    }
    onError(error);
  }
}

export function closeLobbyImpactCopy(guestName: string | null) {
  if (guestName) {
    return `This will disband your party, cancel outstanding invites, and return ${guestName} to the lobby browser. This cannot be undone.`;
  }
  return "This will disband your party and cancel outstanding invites. This cannot be undone.";
}

/**
 * Host seat action, contributed to the seat card's `⋮` overflow menu. The
 * confirmation lives in {@link HostCloseConfirmDialog} and is rendered outside
 * the menu — a dialog nested inside `DropdownMenuContent` unmounts the moment
 * the menu closes on select.
 */
export function HostCloseMenuItem({
  closing,
  disabled = false,
  onSelect,
}: {
  closing: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      variant="destructive"
      disabled={disabled || closing}
      onSelect={onSelect}
    >
      <X />
      {closing ? "Disbanding..." : "Disband party"}
    </DropdownMenuItem>
  );
}

export function HostCloseConfirmDialog({
  open,
  onOpenChange,
  guestName,
  closing,
  onClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guestName: string | null;
  closing: boolean;
  onClose: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <HostCloseConfirmation
        guestName={guestName}
        closing={closing}
        onClose={onClose}
      />
    </AlertDialog>
  );
}

function HostCloseConfirmation({
  guestName,
  closing,
  onClose,
}: {
  guestName: string | null;
  closing: boolean;
  onClose: () => void;
}) {
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Disband party?</AlertDialogTitle>
        <AlertDialogDescription>
          {closeLobbyImpactCopy(guestName)}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={closing}>Keep party</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={closing}
          onClick={onClose}
        >
          {closing ? "Disbanding..." : "Disband party"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
