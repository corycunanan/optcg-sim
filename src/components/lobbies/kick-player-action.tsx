"use client";

import { useState } from "react";
import { EllipsisVertical, UserMinus } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface KickPlayerActionProps {
  playerName: string;
  kicking: boolean;
  disabled?: boolean;
  onKick: () => void;
}

export function KickPlayerAction({
  playerName,
  kicking,
  disabled = false,
  onKick,
}: KickPlayerActionProps) {
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`More actions for ${playerName}`}
            disabled={disabled || kicking}
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmationOpen(true)}
          >
            <UserMinus />
            Kick player
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
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
    </>
  );
}
