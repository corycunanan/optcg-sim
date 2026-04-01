"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
    <button
      type="button"
      onClick={() => onCardClick(card.id)}
      className="group relative overflow-hidden rounded-lg bg-surface-1 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      {/* Card image */}
      <div className="relative aspect-[600/838] w-full overflow-hidden">
        {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.imageUrl}
          alt={card.name}
          className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${loaded ? "opacity-100" : "opacity-0"}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
        {/* Variant badge */}
        {loaded && card._count.artVariants > 0 && (
          <Badge className="absolute right-2 top-2 backdrop-blur-sm">
            +{card._count.artVariants} art
          </Badge>
        )}
        {/* Ban badge */}
        {loaded && card.banStatus !== "LEGAL" && (
          <Badge variant="error" className="absolute left-2 top-2 font-bold">
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
      <div className="py-20 text-center text-sm text-content-tertiary">
        No cards found. Try adjusting your filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
      {cards.map((card) => (
        <CardGridItem key={card.id} card={card} onCardClick={onCardClick} />
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 20 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg bg-surface-1">
          <Skeleton className="aspect-[600/838] w-full rounded-none" />
        </div>
      ))}
    </div>
  );
}
