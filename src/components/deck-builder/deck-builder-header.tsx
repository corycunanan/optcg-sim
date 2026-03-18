"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

interface DeckBuilderHeaderProps {
  name: string;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  isValid: boolean;
  totalCards: number;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onImport: () => void;
  onExport: () => void;
  onClear: () => void;
}

export function DeckBuilderHeader({
  name,
  isDirty,
  isSaving,
  lastSavedAt,
  isValid,
  totalCards,
  onNameChange,
  onSave,
  onImport,
  onExport,
  onClear,
}: DeckBuilderHeaderProps) {
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
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-surface-1 px-4 py-3">
      {/* Back */}
      <Link
        href="/decks"
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
          <input
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
            className="rounded border border-border-focus bg-surface-2 px-2 py-1 font-display text-xl font-bold leading-tight tracking-tight text-content-primary outline-none ring-2 ring-navy-900/10"
          />
        ) : (
          <button
            onClick={() => {
              setEditName(name);
              setEditing(true);
            }}
            aria-label={`Edit deck name: ${name}`}
            className="group flex items-center gap-2 rounded px-2 py-1 font-display text-xl font-bold leading-tight tracking-tight text-content-primary transition-colors hover:bg-surface-2"
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

      {/* Card count + validity badge */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold tabular-nums",
            totalCards === 50
              ? "bg-success text-content-inverse"
              : "bg-surface-3 text-content-secondary"
          )}
        >
          {totalCards}/50
        </span>
        {isValid && totalCards === 50 && (
          <span className="rounded-full bg-success px-3 py-1 text-xs font-bold uppercase tracking-wider text-content-inverse">
            Valid
          </span>
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
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onImport}>Import</Button>
        <Button variant="secondary" size="sm" onClick={onExport}>Export</Button>
        <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
        <Button onClick={onSave} disabled={isSaving} size="sm">
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </header>
  );
}
