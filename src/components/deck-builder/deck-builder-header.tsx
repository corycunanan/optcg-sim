"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

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
    <header
      className="sticky top-0 z-20 flex items-center gap-4 px-5 py-3"
      style={{
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      {/* Back */}
      <Link
        href="/decks"
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-white/5"
        style={{ color: "var(--text-tertiary)" }}
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
            className="rounded-md px-2 py-1 text-lg font-bold"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--accent)",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => {
              setEditName(name);
              setEditing(true);
            }}
            className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-lg font-bold transition-colors hover:bg-white/5"
            style={{ color: "var(--text-primary)" }}
          >
            {name}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="opacity-0 transition-opacity group-hover:opacity-60"
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
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums"
          style={{
            background: totalCards === 50 ? "var(--success)" : "var(--surface-3)",
            color: totalCards === 50 ? "var(--surface-0)" : "var(--text-secondary)",
          }}
        >
          {totalCards}/50
        </span>
        {isValid && totalCards === 50 && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "var(--success)", color: "var(--surface-0)" }}
          >
            Valid
          </span>
        )}
      </div>

      {/* Save status */}
      <div className="ml-auto flex items-center gap-2">
        {lastSavedAt && !isDirty && (
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Saved {lastSavedAt.toLocaleTimeString()}
          </span>
        )}
        {isDirty && (
          <span className="text-xs" style={{ color: "var(--warning)" }}>
            Unsaved changes
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <HeaderButton onClick={onImport} label="Import" />
        <HeaderButton onClick={onExport} label="Export" />
        <HeaderButton onClick={onClear} label="Clear" variant="ghost" />
        <button
          onClick={onSave}
          disabled={isSaving}
          className="rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--surface-0)" }}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </header>
  );
}

function HeaderButton({
  onClick,
  label,
  variant = "default",
}: {
  onClick: () => void;
  label: string;
  variant?: "default" | "ghost";
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
      style={{
        border: variant === "default" ? "1px solid var(--border)" : "none",
        color: "var(--text-secondary)",
      }}
    >
      {label}
    </button>
  );
}
