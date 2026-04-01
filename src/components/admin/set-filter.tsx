"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";

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

export function SetFilter({ sets, selectedSets, onChange }: SetFilterProps) {
  const [open, setOpen] = useState(false);

  // draft = in-progress selections while popover is open.
  // We update draft locally on every click (instant), and only call onChange
  // (which triggers router.push + Neon query) when the user commits.
  const [draft, setDraft] = useState<string[]>(selectedSets);
  const draftRef = useRef(draft);
  const selectedSetsRef = useRef(selectedSets);

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

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      commit(draftRef.current);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "flex min-h-9 w-full cursor-pointer flex-wrap items-center gap-1 rounded-md border bg-surface-2 px-3 py-1 text-left text-sm transition-colors",
            open
              ? "border-border-focus ring-2 ring-navy-900/10"
              : "border-border hover:border-border-strong",
          )}
        >
          {draft.length === 0 ? (
            <span className="py-0.5 text-content-tertiary">All Sets</span>
          ) : (
            draft.map((label) => (
              <Badge key={label} variant="default" className="gap-1">
                {label}
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => removeOne(label, e)}
                  className="opacity-70 transition-opacity hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </Badge>
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
                <X className="size-3" />
              </button>
            )}
            <ChevronDown className={cn("size-3 text-content-tertiary transition-transform", open && "rotate-180")} />
          </span>
        </div>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search sets..." />
          <CommandList className="max-h-64">
            <CommandEmpty>No sets found</CommandEmpty>
            <CommandGroup>
              {sets.map((s) => {
                const selected = draft.includes(s.setLabel);
                return (
                  <CommandItem
                    key={s.packId}
                    value={`${s.setLabel} ${s.setName}`}
                    onSelect={() => toggleDraft(s.setLabel)}
                    className="gap-3"
                  >
                    <Checkbox
                      checked={selected}
                      className="pointer-events-none"
                    />
                    <span className="shrink-0 font-mono text-xs font-bold">{s.setLabel}</span>
                    <span className="truncate text-xs text-content-secondary">{s.setName}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>

          {/* Footer: Apply */}
          <div className="border-t border-border px-2 py-2">
            <Button
              className="w-full"
              onClick={() => handleOpenChange(false)}
            >
              {draft.length === 0
                ? "Show All Sets"
                : `Apply ${draft.length} Set${draft.length > 1 ? "s" : ""}`}
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
