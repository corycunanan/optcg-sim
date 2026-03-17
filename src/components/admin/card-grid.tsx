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
      <div
        className="py-20 text-center text-sm"
        style={{ color: "var(--text-tertiary)" }}
      >
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
          className="group relative overflow-hidden rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {/* Card image */}
          <div className="relative aspect-[600/838] w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.imageUrl}
              alt={card.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
            {/* Subtle gradient overlay at bottom for text readability */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
              style={{
                background:
                  "linear-gradient(to top, var(--surface-1) 0%, transparent 100%)",
              }}
            />
            {/* Variant badge */}
            {card.artVariants.length > 0 && (
              <span
                className="absolute top-2 right-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm"
                style={{
                  background: "oklch(0% 0 0 / 0.6)",
                  color: "var(--teal-muted)",
                  border: "1px solid oklch(100% 0 0 / 0.1)",
                }}
              >
                +{card.artVariants.length} art
              </span>
            )}
            {/* Ban badge */}
            {card.banStatus !== "LEGAL" && (
              <span
                className="absolute top-2 left-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                style={{
                  background: "var(--error)",
                  color: "#fff",
                }}
              >
                {card.banStatus}
              </span>
            )}
            {/* Reprint indicator */}
            {card.isReprint && (
              <span
                className="absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm"
                style={{
                  background: "oklch(0% 0 0 / 0.5)",
                  color: "var(--sage)",
                }}
              >
                Reprint
              </span>
            )}
          </div>

          {/* Card info */}
          <div className="p-2.5">
            <div className="flex items-start justify-between gap-1">
              <p
                className="text-xs leading-tight font-semibold line-clamp-2"
                style={{ color: "var(--text-primary)" }}
              >
                {card.name}
              </p>
              {card.cost !== null && (
                <span
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                  style={{
                    background: "var(--surface-3)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {card.cost}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              {/* Color dots */}
              <div className="flex gap-0.5">
                {card.color.map((c) => (
                  <span
                    key={c}
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: COLOR_DOT[c] || "var(--border)" }}
                    title={c}
                  />
                ))}
              </div>
              <span
                className="text-[10px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                {card.type}
              </span>
              <span
                className="ml-auto font-mono text-[10px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                {card.id}
              </span>
            </div>
            {card.power !== null && (
              <div
                className="mt-1 text-[10px] tabular-nums"
                style={{ color: "var(--text-tertiary)" }}
              >
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
