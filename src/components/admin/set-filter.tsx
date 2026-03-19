"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Set {
  setLabel: string;
  setName: string;
  packId: string;
}

interface SetFilterProps {
  sets: Set[];
  selectedSets: string[];
  onChange: (sets: string[]) => void;
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={cn("h-3 w-3", className)}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={cn("h-3 w-3", className)}>
      <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" className={cn("h-3 w-3", className)}>
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SetFilter({ sets, selectedSets, onChange }: SetFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // draft = in-progress selections while dropdown is open.
  // We update draft locally on every click (instant), and only call onChange
  // (which triggers router.push + Neon query) when the user commits.
  const [draft, setDraft] = useState<string[]>(selectedSets);
  const draftRef = useRef(draft);
  const selectedSetsRef = useRef(selectedSets);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keep refs in sync
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { selectedSetsRef.current = selectedSets; }, [selectedSets]);

  // Sync draft when selectedSets changes from outside (e.g., "Clear all filters")
  const selectedSetsKey = selectedSets.join(",");
  useEffect(() => {
    setDraft(selectedSets);
    draftRef.current = selectedSets;
  }, [selectedSetsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Commit draft → call onChange only if something actually changed
  const commit = useCallback((next: string[]) => {
    if (next.join(",") !== selectedSetsRef.current.join(",")) {
      onChange(next);
    }
  }, [onChange]);

  const closeAndCommit = useCallback(() => {
    setOpen(false);
    setQuery("");
    commit(draftRef.current);
  }, [commit]);

  // Close on outside click → commit
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeAndCommit();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [closeAndCommit]);

  // Focus search when opening
  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open]);

  const filtered = query.trim()
    ? sets.filter(
        (s) =>
          s.setLabel.toLowerCase().includes(query.toLowerCase()) ||
          s.setName.toLowerCase().includes(query.toLowerCase()),
      )
    : sets;

  // Toggle in draft only — no onChange, no navigation
  const toggleDraft = (label: string) => {
    setDraft((prev) => {
      const next = prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label];
      draftRef.current = next;
      return next;
    });
  };

  // Badge ✕ and clear-all: apply immediately (explicit single-action removal)
  const removeOne = (label: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = draft.filter((s) => s !== label);
    setDraft(next);
    draftRef.current = next;
    commit(next);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft([]);
    draftRef.current = [];
    commit([]);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-9 w-full flex-wrap items-center gap-1 rounded border bg-surface-2 px-3 py-1 text-left text-sm transition-colors",
          open
            ? "border-border-focus ring-2 ring-navy-900/10"
            : "border-border hover:border-border-strong",
        )}
      >
        {draft.length === 0 ? (
          <span className="py-0.5 text-content-tertiary">All Sets</span>
        ) : (
          draft.map((label) => (
            <span
              key={label}
              className="flex items-center gap-1 rounded bg-navy-900 px-2 py-0.5 text-xs font-medium text-content-inverse"
            >
              {label}
              <button type="button" tabIndex={-1} onClick={(e) => removeOne(label, e)} className="opacity-70 transition-opacity hover:opacity-100">
                <XIcon />
              </button>
            </span>
          ))
        )}

        <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          {draft.length > 0 && (
            <button
              type="button"
              tabIndex={-1}
              onClick={clearAll}
              className="rounded p-0.5 text-content-tertiary transition-colors hover:text-content-secondary"
              title="Clear selection"
            >
              <XIcon />
            </button>
          )}
          <ChevronDown className={cn("text-content-tertiary transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border bg-background shadow-lg">
          {/* Search */}
          <div className="border-b border-border px-2 py-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sets…"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-content-primary placeholder:text-content-tertiary focus:border-border-focus focus:outline-none"
            />
          </div>

          {/* List */}
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-content-tertiary">No sets found</p>
            ) : (
              filtered.map((s) => {
                const selected = draft.includes(s.setLabel);
                return (
                  <button
                    key={s.packId}
                    type="button"
                    onClick={() => toggleDraft(s.setLabel)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      selected ? "bg-navy-100 text-navy-900" : "text-content-primary hover:bg-surface-2",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        selected ? "border-navy-900 bg-navy-900 text-content-inverse" : "border-border",
                      )}
                    >
                      {selected && <CheckIcon />}
                    </span>
                    <span className="shrink-0 font-mono text-xs font-bold">{s.setLabel}</span>
                    <span className="truncate text-xs text-content-secondary">{s.setName}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer: Apply */}
          <div className="border-t border-border px-2 py-2">
            <button
              type="button"
              onClick={closeAndCommit}
              className="w-full rounded-md bg-navy-900 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800"
            >
              {draft.length === 0
                ? "Show All Sets"
                : `Apply ${draft.length} Set${draft.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
