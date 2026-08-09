import { cn } from "@/lib/utils";
import { COLOR_DOT_CLASSES } from "@/lib/cards/colors-ui";

interface DeckColorIndicatorsProps {
  colors: readonly string[];
}

export function DeckColorIndicators({ colors }: DeckColorIndicatorsProps) {
  return (
    <div
      role="group"
      aria-label="Deck colors"
      className="flex flex-wrap items-center gap-2"
    >
      {colors.map((color) => (
        <span
          key={color}
          role="img"
          aria-label={`${color} deck color`}
          className="text-content-tertiary inline-flex items-center gap-1 text-xs"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-3 shrink-0 rounded-full",
              COLOR_DOT_CLASSES[color as keyof typeof COLOR_DOT_CLASSES] ??
                "bg-surface-3"
            )}
          />
          <span aria-hidden="true">{color}</span>
        </span>
      ))}
    </div>
  );
}
