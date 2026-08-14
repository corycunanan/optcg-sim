"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { handCardHover } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { CardWithRelations } from "./card-browser";

/** Hover-off tween for the grid tile. `handCardHover` springs *in*; without an
 *  element-level default the spring would also drive the return trip and the
 *  tile would bounce back. Mirrors the board card's interaction layer. */
const HOVER_EXIT_TRANSITION = { duration: 0.15, ease: "easeOut" as const };

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
  const reducedMotion = useReducedMotion() ?? false;

  return (
    // The board's hand-card hover preset (pop + raise + one wiggle) is the
    // whole hover treatment here — the tile no longer stacks a CSS translate
    // and an inner image zoom on top of it (ELEVATION-LANGUAGE, Anti-stacking).
    // Motion owns `transform`; CSS owns only `box-shadow`, so the two never
    // fight over a property. Motion also manages `will-change` for the
    // duration of each animation, which matters on a ~50-tile grid: a static
    // `will-change-transform` would promote every tile to its own compositor
    // layer for the entire page lifetime.
    <motion.button
      type="button"
      onClick={() => onCardClick(card.id)}
      whileHover={reducedMotion ? undefined : handCardHover}
      transition={HOVER_EXIT_TRANSITION}
      className="bg-surface-1 relative overflow-hidden rounded-lg text-left shadow-sm transition-shadow duration-200 hover:shadow-md"
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
    </motion.button>
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
        <div key={i} className="bg-surface-1 overflow-hidden rounded-lg">
          <Skeleton className="aspect-card w-full rounded-none" />
        </div>
      ))}
    </div>
  );
}
