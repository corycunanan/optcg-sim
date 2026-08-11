"use client";

import { SLEEVE_OPTIONS } from "@/lib/deck-builder/customization";
import { CustomizationPicker } from "./customization-picker";

interface SleevePickerProps {
  selectedUrl: string | null;
  onSelect: (url: string | null) => void;
}

export function SleevePicker({ selectedUrl, onSelect }: SleevePickerProps) {
  return (
    <CustomizationPicker
      heading="Card Sleeves"
      defaultLabel="Default"
      defaultAriaLabel="Use default card sleeve"
      optionAriaLabel={(index) => `Use card sleeve option ${index + 1}`}
      options={SLEEVE_OPTIONS}
      selectedUrl={selectedUrl}
      onSelect={onSelect}
    />
  );
}
