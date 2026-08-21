import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ColorChip } from "./color-chip";

interface CardHeaderBadgeRowProps {
  id: string;
  type: string;
  colors: string[];
  rarity: string;
  banStatus: string;
}

/** Keeps card header metadata aligned with the canonical ColorChip box. */
const HEADER_BADGE_CLASS = "py-1";

export function CardHeaderBadgeRow({
  id,
  type,
  colors,
  rarity,
  banStatus,
}: CardHeaderBadgeRowProps) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Badge variant="outline" className={cn(HEADER_BADGE_CLASS, "font-mono")}>
        {id}
      </Badge>
      <Badge variant="outline" className={HEADER_BADGE_CLASS}>
        {type}
      </Badge>
      {colors.map((color) => (
        <ColorChip
          key={color}
          color={color}
          accessibleLabel={`${color} card color`}
        />
      ))}
      <Badge variant="outline" className={HEADER_BADGE_CLASS}>
        {rarity}
      </Badge>
      {banStatus !== "LEGAL" && (
        <Badge
          variant="error"
          className={cn(HEADER_BADGE_CLASS, "font-semibold")}
        >
          {banStatus}
        </Badge>
      )}
    </div>
  );
}
