"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui";

export function NavMenu({
  onLeave,
  onConcede,
  matchClosed,
  spectator = false,
  leaving = false,
}: {
  onLeave: () => void;
  onConcede?: () => void;
  matchClosed: boolean;
  spectator?: boolean;
  leaving?: boolean;
}) {
  const [concedeOpen, setConcedeOpen] = useState(false);

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="text-gb-text-subtle hover:text-gb-text-bright data-[state=open]:bg-gb-surface-raised data-[state=open]:text-gb-text-bright focus-visible:ring-gb-accent-blue flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="Game menu"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="2"
              y="3"
              width="12"
              height="1.5"
              rx="0.75"
              fill="currentColor"
            />
            <rect
              x="2"
              y="7.25"
              width="12"
              height="1.5"
              rx="0.75"
              fill="currentColor"
            />
            <rect
              x="2"
              y="11.5"
              width="12"
              height="1.5"
              rx="0.75"
              fill="currentColor"
            />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bg-gb-surface border-gb-border-strong w-48"
      >
        <DropdownMenuItem
          onClick={onLeave}
          disabled={leaving}
          className="text-gb-text focus:bg-gb-surface-raised"
        >
          {spectator
            ? leaving
              ? "Stopping…"
              : "Stop spectating"
            : "← Back to Lobbies"}
        </DropdownMenuItem>
        {!matchClosed && onConcede && (
          <DropdownMenuItem
            onClick={() => setConcedeOpen(true)}
            className="text-gb-accent-red focus:bg-gb-surface-raised focus:text-gb-accent-red"
          >
            Concede
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!onConcede) return menu;

  return (
    <AlertDialog open={concedeOpen} onOpenChange={setConcedeOpen}>
      {menu}

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Concede Game</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to concede? This will end the game and count
            as a loss.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConcede}>
            Yes, Concede
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
