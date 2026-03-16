import Link from "next/link";
import type { CardWithRelations } from "./card-browser";

const COLOR_DOT: Record<string, string> = {
  Red: "bg-red-500",
  Blue: "bg-blue-500",
  Green: "bg-green-500",
  Purple: "bg-purple-500",
  Black: "bg-gray-700",
  Yellow: "bg-yellow-400",
};

interface CardGridProps {
  cards: CardWithRelations[];
}

export function CardGrid({ cards }: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400">
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
          className="group overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:shadow-md hover:border-gray-300"
        >
          {/* Card image */}
          <div className="relative aspect-[600/838] w-full overflow-hidden bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.imageUrl}
              alt={card.name}
              className="h-full w-full object-cover transition group-hover:scale-105"
              loading="lazy"
            />
            {/* Variant badge */}
            {card.artVariants.length > 0 && (
              <span className="absolute top-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                +{card.artVariants.length} art
              </span>
            )}
            {/* Ban badge */}
            {card.banStatus !== "LEGAL" && (
              <span className="absolute top-1.5 left-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {card.banStatus}
              </span>
            )}
          </div>

          {/* Card info */}
          <div className="p-2">
            <div className="flex items-start justify-between gap-1">
              <p className="text-xs leading-tight font-semibold text-gray-900 line-clamp-2">
                {card.name}
              </p>
              {card.cost !== null && (
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                  {card.cost}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {/* Color dots */}
              <div className="flex gap-0.5">
                {card.color.map((c) => (
                  <span
                    key={c}
                    className={`inline-block h-2.5 w-2.5 rounded-full ${COLOR_DOT[c] || "bg-gray-300"}`}
                    title={c}
                  />
                ))}
              </div>
              <span className="text-[10px] text-gray-400">{card.type}</span>
              <span className="ml-auto text-[10px] text-gray-400">
                {card.id}
              </span>
            </div>
            {card.power !== null && (
              <div className="mt-0.5 text-[10px] text-gray-500">
                {card.power.toLocaleString()} PWR
                {card.counter !== null && ` · ${card.counter.toLocaleString()} CTR`}
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
