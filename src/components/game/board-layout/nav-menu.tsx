"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui";

export function NavMenu({
  onLeave,
  onConcede,
  matchClosed,
}: {
  onLeave: () => void;
  onConcede: () => void;
  matchClosed: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center justify-center w-8 h-8 rounded-md transition-colors cursor-pointer text-gb-text-subtle hover:text-gb-text-bright data-[state=open]:bg-gb-surface-raised data-[state=open]:text-gb-text-bright"
          aria-label="Game menu"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="2" y="11.5" width="12" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 bg-gb-surface border-gb-border-strong"
      >
        <DropdownMenuItem
          onClick={onLeave}
          className="text-xs text-gb-text focus:bg-gb-surface-raised"
        >
          &larr; Back to Lobbies
        </DropdownMenuItem>
        {!matchClosed && (
          <DropdownMenuItem
            onClick={onConcede}
            className="text-xs text-gb-accent-red focus:bg-gb-surface-raised focus:text-gb-accent-red"
          >
            Concede
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
