import Link from "next/link";
import type { CardWithRelations } from "./card-browser";

const COLOR_DOT: Record<string, string> = {
  Red: "var(--card-red)",
  Blue: "var(--card-blue)",
  Green: "var(--card-green)",
  Purple: "var(--card-purple)",
  Black: "var(--card-black)",
  Yellow: "var(--card-yellow)",
};

interface CardGridProps {
  cards: CardWithRelations[];
}

export function CardGrid({ cards }: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-content-tertiary">
        No cards found. Try adjusting your filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {cards.map((card) => (
        <Link
          key={card.id}
          href={`/admin/cards/${card.id}`}
          className="group relative overflow-hidden rounded-lg bg-surface-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
        >
          {/* Card image — no gradient overlay */}
          <div className="relative aspect-[600/838] w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.imageUrl}
              alt={card.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
            {/* Variant badge */}
            {card.artVariants.length > 0 && (
              <span className="absolute top-2 right-2 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-content-inverse backdrop-blur-sm">
                +{card.artVariants.length} art
              </span>
            )}
            {/* Ban badge */}
            {card.banStatus !== "LEGAL" && (
              <span className="absolute top-2 left-2 rounded bg-error px-2 py-1 text-xs font-bold text-content-inverse">
                {card.banStatus}
              </span>
            )}
            {/* Reprint indicator */}
            {card.isReprint && (
              <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-xs font-medium text-gold-100 backdrop-blur-sm">
                Reprint
              </span>
            )}
          </div>

          {/* Card info */}
          <div className="p-3">
            <div className="flex items-start justify-between gap-1">
              <p className="text-sm font-semibold leading-tight line-clamp-2 text-content-primary">
                {card.name}
              </p>
              {card.cost !== null && (
                <span className="shrink-0 rounded bg-surface-3 px-2 py-1 text-xs font-bold tabular-nums text-content-secondary">
                  {card.cost}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {/* Color dots */}
              <div className="flex gap-1">
                {card.color.map((c) => (
                  <span
                    key={c}
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: COLOR_DOT[c] || "var(--border-strong)" }}
                    title={c}
                  />
                ))}
              </div>
              <span className="text-xs text-content-tertiary">{card.type}</span>
              <span className="ml-auto font-mono text-xs text-content-tertiary">
                {card.id}
              </span>
            </div>
            {card.power !== null && (
              <div className="mt-1 text-xs tabular-nums text-content-tertiary">
                {card.power.toLocaleString()} PWR
                {card.counter !== null &&
                  ` · ${card.counter.toLocaleString()} CTR`}
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
