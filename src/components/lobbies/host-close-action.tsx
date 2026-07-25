"use client";

import { EllipsisVertical, X } from "lucide-react";
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
  compact?: boolean;
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
    return `This will disband your party, cancel outstanding invites, and return ${guestName} to the lobby browser. This cannot be undone.`;
  }
  return "This will disband your party and cancel outstanding invites. This cannot be undone.";
}

export function HostCloseAction({
  canClose,
  guestName,
  closing,
  disabled = false,
  compact = false,
  onClose,
}: HostCloseActionProps) {
  if (!canClose) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size={compact ? "icon" : "default"}
          disabled={disabled || closing}
          aria-label={compact ? "More actions for host" : undefined}
        >
          {compact ? (
            <EllipsisVertical />
          ) : (
            <>
              <X data-icon="inline-start" />
              {closing ? "Disbanding..." : "Disband party"}
            </>
          )}
        </Button>
      </AlertDialogTrigger>
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
    </AlertDialog>
  );
}
