"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CardWithRelations } from "./card-browser";

interface CardGridProps {
  cards: CardWithRelations[];
  onCardClick: (cardId: string) => void;
}

function CardGridItem({
  card,
  onCardClick,
}: {
  card: CardWithRelations;
  onCardClick: (cardId: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    // Tailwind v4 uses standalone `scale`, so the register names it alongside
    // box-shadow. `motion-safe:` disables transforms under reduced motion.
    <button
      type="button"
      onClick={() => onCardClick(card.id)}
      className="bg-surface-1 rounded-card relative overflow-hidden text-left shadow-sm transition-[scale,box-shadow] duration-200 ease-out hover:shadow-md motion-safe:hover:scale-[1.03]"
    >
      {/* Card image */}
      <div className="aspect-card relative w-full overflow-hidden">
        {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.imageUrl}
          alt={card.name}
          className={cn(
            "h-full w-full object-cover",
            loaded ? "opacity-100" : "opacity-0"
          )}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
        {/* Variant badge */}
        {loaded && card._count.artVariants > 0 && (
          <Badge className="bg-surface-interactive text-content-primary border-border-strong absolute top-2 right-2 backdrop-blur-sm">
            +{card._count.artVariants} art
          </Badge>
        )}
        {/* Ban badge */}
        {loaded && card.banStatus !== "LEGAL" && (
          <Badge variant="error" className="absolute top-2 left-2 font-semibold">
            {card.banStatus}
          </Badge>
        )}
        {/* Reprint indicator */}
        {loaded && card.isReprint && (
          <Badge variant="warning" className="absolute bottom-2 left-2">
            Reprint
          </Badge>
        )}
      </div>
    </button>
  );
}

export function CardGrid({ cards, onCardClick }: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="text-content-tertiary py-16 text-center text-sm">
        No cards found. Try adjusting your filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {cards.map((card) => (
        <CardGridItem key={card.id} card={card} onCardClick={onCardClick} />
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 20 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface-1 rounded-card overflow-hidden">
          <Skeleton className="aspect-card w-full rounded-none" />
        </div>
      ))}
    </div>
  );
}
