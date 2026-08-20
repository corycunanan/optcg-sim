"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CustomizationPickerProps {
  heading: string;
  defaultLabel: string;
  defaultAriaLabel: string;
  optionAriaLabel: (index: number) => string;
  options: readonly { imageUrl: string }[];
  selectedUrl: string | null;
  onSelect: (url: string | null) => void;
}

export function CustomizationPicker({
  heading,
  defaultLabel,
  defaultAriaLabel,
  optionAriaLabel,
  options,
  selectedUrl,
  onSelect,
}: CustomizationPickerProps) {
  const optionClassName = (selected: boolean) =>
    cn(
      "aspect-card rounded-card h-auto overflow-hidden border-2 p-0",
      selected
        ? "border-border-focus ring-border-focus ring-2"
        : "border-border hover:border-content-tertiary"
    );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-content-primary text-sm font-semibold tracking-widest uppercase">
        {heading}
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <Button
          type="button"
          variant="ghost"
          aria-label={defaultAriaLabel}
          aria-pressed={selectedUrl === null}
          onClick={() => onSelect(null)}
          className={cn(
            optionClassName(selectedUrl === null),
            "bg-card text-content-secondary text-sm font-semibold tracking-widest uppercase"
          )}
        >
          {defaultLabel}
        </Button>
        {options.map((option, index) => (
          <Button
            key={option.imageUrl}
            type="button"
            variant="ghost"
            aria-label={optionAriaLabel(index)}
            aria-pressed={selectedUrl === option.imageUrl}
            onClick={() => onSelect(option.imageUrl)}
            className={optionClassName(selectedUrl === option.imageUrl)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={option.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </Button>
        ))}
      </div>
    </div>
  );
}
