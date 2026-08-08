"use client";

import { UserMinus } from "lucide-react";
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

/**
 * Host-only action on the guest seat, contributed to that seat's `⋮` overflow
 * menu. The confirmation is {@link KickPlayerConfirmDialog}, rendered outside
 * the menu so selecting the item (which closes the menu) cannot unmount it.
 */
export function KickPlayerMenuItem({
  playerName,
  kicking,
  disabled = false,
  onSelect,
}: {
  playerName: string;
  kicking: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      variant="destructive"
      disabled={disabled || kicking}
      onSelect={onSelect}
    >
      <UserMinus />
      {kicking ? "Kicking..." : `Kick ${playerName}`}
    </DropdownMenuItem>
  );
}

export function KickPlayerConfirmDialog({
  open,
  onOpenChange,
  playerName,
  kicking,
  onKick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  kicking: boolean;
  onKick: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kick {playerName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove {playerName} from your party and reopen the guest
            seat.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={kicking}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={kicking}
            onClick={(event) => {
              event.preventDefault();
              onKick();
            }}
          >
            {kicking ? "Kicking..." : "Kick player"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
