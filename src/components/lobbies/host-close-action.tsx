"use client";

import { X } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface HostCloseActionProps {
  canClose: boolean;
  guestName: string | null;
  closing: boolean;
  disabled?: boolean;
  onClose: () => void;
}

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
    return `This will close the lobby for you and ${guestName}, cancel outstanding invites, and return ${guestName} to the lobby browser. This cannot be undone.`;
  }
  return "This will close the lobby and cancel outstanding invites. This cannot be undone.";
}

export function HostCloseAction({
  canClose,
  guestName,
  closing,
  disabled = false,
  onClose,
}: HostCloseActionProps) {
  if (!canClose) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="secondary" disabled={disabled || closing}>
          <X data-icon="inline-start" />
          {closing ? "Closing..." : "Close Lobby"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close Lobby?</AlertDialogTitle>
          <AlertDialogDescription>
            {closeLobbyImpactCopy(guestName)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={closing}>Keep Lobby</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={closing}
            onClick={onClose}
          >
            {closing ? "Closing..." : "Close Lobby"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
