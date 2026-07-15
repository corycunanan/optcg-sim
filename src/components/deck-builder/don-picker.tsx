"use client";

import { cn } from "@/lib/utils";
import { DON_OPTIONS } from "@/lib/deck-builder/customization";

interface DonPickerProps {
  selectedUrl: string | null;
  onSelect: (url: string | null) => void;
}

export function DonPicker({ selectedUrl, onSelect }: DonPickerProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-content-primary text-sm font-bold tracking-wide uppercase">
        DON Card Art
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          aria-label="Use default DON card art"
          aria-pressed={selectedUrl === null}
          onClick={() => onSelect(null)}
          className={cn(
            "bg-surface-1 text-content-secondary aspect-card focus-visible:ring-border-focus flex items-center justify-center overflow-hidden rounded-md border-2 text-xs font-bold uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            selectedUrl === null
              ? "border-navy-900 ring-navy-900 ring-2"
              : "border-border hover:border-content-tertiary"
          )}
        >
          Default
        </button>
        {DON_OPTIONS.map((option, index) => (
          <button
            key={option.imageUrl}
            type="button"
            aria-label={`Use DON card art option ${index + 1}`}
            aria-pressed={selectedUrl === option.imageUrl}
            onClick={() => onSelect(option.imageUrl)}
            className={cn(
              "aspect-card focus-visible:ring-border-focus overflow-hidden rounded-md border-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              selectedUrl === option.imageUrl
                ? "border-navy-900 ring-navy-900 ring-2"
                : "border-border hover:border-content-tertiary"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={option.imageUrl}
              alt="DON card design"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
