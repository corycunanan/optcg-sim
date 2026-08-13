import { Check } from "lucide-react";

import {
  COLOR_CHIP_SELECTED_CLASSES,
  COLOR_SWATCH_CLASSES,
} from "@/lib/cards/colors-ui";
import { cn } from "@/lib/utils";

/**
 * The canonical card-color chip — one implementation behind every place the app
 * names a TCG color: the card and deck filter dialogs, deck-builder search,
 * deck previews, and card inspection.
 *
 * Anatomy: a constant 12px leading slot followed by the color's name. The slot
 * holds a color swatch at rest and a check when selected, so a toggle never
 * reflows its row and never carries selection on color alone. The swatch is
 * ringed by the same-hue `--card-*-border` keyline, which is what keeps Black
 * and Purple legible against navy.
 */

const CHIP_CLASS =
  "inline-flex items-center gap-2 rounded border px-3 py-1 text-xs font-medium";

const CHIP_RESTING_CLASS =
  "border-border bg-surface-2 text-content-secondary";

/** Shell for any chip that toggles — colors and plain values alike. */
export const CHIP_TOGGLE_CLASS = cn(
  CHIP_CLASS,
  "focus-visible:outline-border-focus cursor-pointer transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
);

/** Unselected fill for a toggle chip. */
export const CHIP_TOGGLE_UNSELECTED_CLASS = cn(
  CHIP_RESTING_CLASS,
  "hover:border-border-strong hover:text-content-primary"
);

/** Fallback fill for a value the card palette does not name. */
const CHIP_SELECTED_FALLBACK_CLASS =
  "border-border-strong bg-accent-soft text-content-primary";

const SWATCH_FALLBACK_CLASS = "border-border-strong bg-surface-3";

function selectedClass(color: string) {
  return (
    COLOR_CHIP_SELECTED_CLASSES[
      color as keyof typeof COLOR_CHIP_SELECTED_CLASSES
    ] ?? CHIP_SELECTED_FALLBACK_CLASS
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-3 shrink-0 rounded border",
        COLOR_SWATCH_CLASSES[color as keyof typeof COLOR_SWATCH_CLASSES] ??
          SWATCH_FALLBACK_CLASS
      )}
    />
  );
}

interface ColorChipProps {
  color: string;
  /**
   * Accessible name for the chip. Defaults to the color itself; pass a fuller
   * phrase where the surrounding context does not supply one ("Red deck
   * color"). The visible label is hidden from assistive tech so the swatch and
   * the word are announced once, as a single unit.
   */
  accessibleLabel?: string;
  className?: string;
}

/** Display-only chip: states a color, never a selection. */
export function ColorChip({
  color,
  accessibleLabel,
  className,
}: ColorChipProps) {
  return (
    <span
      role="img"
      aria-label={accessibleLabel ?? color}
      className={cn(CHIP_CLASS, CHIP_RESTING_CLASS, className)}
    >
      <ColorSwatch color={color} />
      <span aria-hidden="true">{color}</span>
    </span>
  );
}

interface ColorChipToggleProps {
  color: string;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  className?: string;
}

/** Interactive chip: filters by a color, reporting state through aria-pressed. */
export function ColorChipToggle({
  color,
  pressed,
  onPressedChange,
  className,
}: ColorChipToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        CHIP_TOGGLE_CLASS,
        pressed ? selectedClass(color) : CHIP_TOGGLE_UNSELECTED_CLASS,
        className
      )}
    >
      {pressed ? (
        <Check className="size-3 shrink-0" aria-hidden />
      ) : (
        <ColorSwatch color={color} />
      )}
      {color}
    </button>
  );
}
