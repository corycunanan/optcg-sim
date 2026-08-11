"use client";

import { DON_OPTIONS } from "@/lib/deck-builder/customization";
import { CustomizationPicker } from "./customization-picker";

interface DonPickerProps {
  selectedUrl: string | null;
  onSelect: (url: string | null) => void;
}

export function DonPicker({ selectedUrl, onSelect }: DonPickerProps) {
  return (
    <CustomizationPicker
      heading="DON Card Art"
      defaultLabel="Default"
      defaultAriaLabel="Use default DON card art"
      optionAriaLabel={(index) => `Use DON card art option ${index + 1}`}
      options={DON_OPTIONS}
      selectedUrl={selectedUrl}
      onSelect={onSelect}
    />
  );
}
