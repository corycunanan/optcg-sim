"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
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
interface DeckBuilderHeaderProps {
  name: string;
  isDirty: boolean;
  isSaving: boolean;
  hasLeader: boolean;
  lastSavedAt: Date | null;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onClear: () => void;
}

export function DeckBuilderHeader({
  name,
  isDirty,
  isSaving,
  hasLeader,
  lastSavedAt,
  onNameChange,
  onSave,
  onClear,
}: DeckBuilderHeaderProps) {
  const router = useRouter();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitName = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== name) {
      onNameChange(trimmed);
    }
    setEditing(false);
  };

  return (
    <header className="flex items-center gap-4 border-b border-border bg-surface-1 px-4 py-3">
      {/* Back — guarded while dirty so in-app nav can't silently drop work */}
      <Link
        href="/decks"
        onClick={(e) => {
          if (isDirty) {
            e.preventDefault();
            setConfirmLeave(true);
          }
        }}
        className="flex items-center gap-2 rounded px-2 py-1 text-sm text-content-tertiary transition-colors hover:bg-surface-2 hover:text-content-secondary"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M10 12L6 8L10 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Decks
      </Link>

      {/* Deck name */}
      <div className="flex items-center gap-2">
        {editing ? (
          <Input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setEditName(name);
                setEditing(false);
              }
            }}
            className="h-auto border-border-focus px-2 py-1 text-lg font-semibold leading-tight ring-2 ring-navy-900/10"
          />
        ) : (
          <button
            onClick={() => {
              setEditName(name);
              setEditing(true);
            }}
            aria-label={`Edit deck name: ${name}`}
            className="group flex items-center gap-2 rounded px-2 py-1 text-lg font-semibold leading-tight text-content-primary transition-colors hover:bg-surface-2"
          >
            {name}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
              className="opacity-0 transition-opacity group-hover:opacity-40"
            >
              <path
                d="M10.5 1.5L12.5 3.5L4.5 11.5L1.5 12.5L2.5 9.5L10.5 1.5Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Save status */}
      <div className="ml-auto flex items-center gap-2">
        {lastSavedAt && !isDirty && (
          <span className="text-xs text-content-tertiary">
            Saved {lastSavedAt.toLocaleTimeString()}
          </span>
        )}
        {isDirty && (
          <span className="text-xs text-warning">Unsaved changes</span>
        )}
      </div>

      {/* Actions */}
      <TooltipProvider>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">Clear</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear Deck</AlertDialogTitle>
                <AlertDialogDescription>
                  Remove the leader and every card from &ldquo;{name}&rdquo;?
                  This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onClear}>
                  Clear Deck
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {hasLeader ? (
            <Button onClick={onSave} disabled={isSaving} size="sm">
              {isSaving ? "Saving…" : "Save"}
            </Button>
          ) : (
            <Tooltip content="Pick a Leader first" side="bottom">
              {/* span wrapper: disabled buttons don't emit pointer events */}
              <span tabIndex={0} className="rounded-md">
                <Button disabled size="sm">
                  Save
                </Button>
              </span>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>

      {/* Leave-without-saving confirmation for the back link */}
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{name}&rdquo; has unsaved changes. Leave anyway and
              discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => router.push("/decks")}
            >
              Discard &amp; Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
