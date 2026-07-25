"use client";

import { useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  if (!canClose) return null;

  if (compact) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled || closing}
              aria-label="More actions for host"
            >
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmationOpen(true)}
            >
              <X />
              Disband party
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
          <HostCloseConfirmation
            guestName={guestName}
            closing={closing}
            onClose={onClose}
          />
        </AlertDialog>
      </>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="default"
          disabled={disabled || closing}
        >
          <X data-icon="inline-start" />
          {closing ? "Disbanding..." : "Disband party"}
        </Button>
      </AlertDialogTrigger>
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
