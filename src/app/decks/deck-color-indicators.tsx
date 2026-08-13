import { ColorChip } from "@/components/cards/color-chip";

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
        <ColorChip
          key={color}
          color={color}
          accessibleLabel={`${color} deck color`}
        />
      ))}
    </div>
  );
}
