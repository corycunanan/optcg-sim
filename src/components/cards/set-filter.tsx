"use client";

import { cn } from "@/lib/utils";
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
  className?: string;
}

/**
 * Searchable set list. Fully controlled: the filter dialog owns the draft, so
 * this component never commits anything on its own — it reports toggles and
 * renders the selection it is given.
 */
export function SetFilter({
  sets,
  selectedSets,
  onChange,
  className,
}: SetFilterProps) {
  const toggle = (label: string) => {
    onChange(
      selectedSets.includes(label)
        ? selectedSets.filter((s) => s !== label)
        : [...selectedSets, label]
    );
  };

  return (
    <Command
      label="Sets"
      className={cn("border-border h-auto border", className)}
    >
      <CommandInput placeholder="Search sets..." />
      <CommandList className="max-h-56">
        <CommandEmpty>No sets match that search.</CommandEmpty>
        <CommandGroup>
          {sets.map((s) => {
            const selected = selectedSets.includes(s.setLabel);
            return (
              <CommandItem
                key={s.packId}
                value={`${s.setLabel} ${s.setName}`}
                onSelect={() => toggle(s.setLabel)}
                className={cn("gap-3", selected && "bg-surface-2")}
              >
                <Checkbox checked={selected} className="pointer-events-none" />
                <span className="text-content-primary shrink-0 font-mono text-xs font-semibold">
                  {s.setLabel}
                </span>
                <span className="text-content-secondary truncate text-xs">
                  {s.setName}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
