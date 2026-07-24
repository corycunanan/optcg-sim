"use client";

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

export interface PartySwitchDetails {
  currentLobbyId: string;
  targetCode: string;
  guestName: string | null;
  hasPendingInvite: boolean;
}

export function partySwitchDetailsFromError(
  body: Record<string, unknown>
): PartySwitchDetails | null {
  if (body.code !== "PARTY_SWITCH_CONFIRMATION_REQUIRED") return null;
  const details = body.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }

  const value = details as Record<string, unknown>;
  if (
    typeof value.currentLobbyId !== "string" ||
    typeof value.targetCode !== "string" ||
    (typeof value.guestName !== "string" && value.guestName !== null) ||
    typeof value.hasPendingInvite !== "boolean"
  ) {
    return null;
  }
  return {
    currentLobbyId: value.currentLobbyId,
    targetCode: value.targetCode,
    guestName: value.guestName,
    hasPendingInvite: value.hasPendingInvite,
  };
}

export function PartySwitchConfirmation({
  open,
  details,
  busy,
  onStay,
  onConfirm,
}: {
  open: boolean;
  details: PartySwitchDetails | null;
  busy: boolean;
  onStay: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onStay();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Switch parties?</AlertDialogTitle>
          <AlertDialogDescription>
            {details?.guestName ? (
              <>
                You&apos;re hosting {details.guestName}. Joining party{" "}
                {details.targetCode} disbands your current party —{" "}
                {details.guestName} will be returned to their own lobby.
              </>
            ) : (
              <>
                Joining party {details?.targetCode} disbands your current party
                and cancels its pending invite.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onStay}>
            Stay here
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "Joining…" : "Disband & join"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
