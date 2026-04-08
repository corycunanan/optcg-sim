"use client";

import type { ReactNode } from "react";
import { cn, cardRotation } from "@/lib/utils";

interface CardFanStackProps {
  cardId: string;
  count: number;
  renderCard: (index: number) => ReactNode;
  className?: string;
}

/**
 * Renders a fanned stack of cards with deterministic rotation.
 * Consumers provide their own tooltip wrapper and card image via renderCard.
 */
export function CardFanStack({
  cardId,
  count,
  renderCard,
  className,
}: CardFanStackProps) {
  return (
    <div className={cn("flex", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={`${cardId}-${i}`}
          className={cn(
            "relative flex-shrink-0 transition-transform duration-150",
            i > 0 && "-ml-16",
          )}
          style={{
            zIndex: count - i,
            ...(i > 0 && {
              rotate: `${cardRotation(cardId, i)}deg`,
            }),
          }}
        >
          {renderCard(i)}
        </div>
      ))}
    </div>
  );
}
