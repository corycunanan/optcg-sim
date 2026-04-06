"use client";

import { cn } from "@/lib/utils";
import { SLEEVE_OPTIONS } from "@/lib/deck-builder/customization";

interface SleevePickerProps {
  selectedUrl: string | null;
  onSelect: (url: string) => void;
}

export function SleevePicker({ selectedUrl, onSelect }: SleevePickerProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-sm font-bold text-content-primary uppercase tracking-wide">
        Card Sleeves
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {SLEEVE_OPTIONS.map((option) => (
          <button
            key={option.imageUrl}
            onClick={() => onSelect(option.imageUrl)}
            className={cn(
              "overflow-hidden rounded-md border-2 transition-all aspect-[600/838]",
              selectedUrl === option.imageUrl
                ? "border-navy-900 ring-2 ring-navy-900"
                : "border-border hover:border-content-tertiary",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={option.imageUrl}
              alt="Sleeve design"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
