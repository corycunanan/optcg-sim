import type { CardWithRelations } from "./card-browser";

interface CardGridProps {
  cards: CardWithRelations[];
  onCardClick: (cardId: string) => void;
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
        <button
          key={card.id}
          type="button"
          onClick={() => onCardClick(card.id)}
          className="group relative overflow-hidden rounded-lg bg-surface-1 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
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
            {/* Variant badge */}
            {card._count.artVariants > 0 && (
              <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-content-inverse backdrop-blur-sm">
                +{card._count.artVariants} art
              </span>
            )}
            {/* Ban badge */}
            {card.banStatus !== "LEGAL" && (
              <span className="absolute left-2 top-2 rounded bg-error px-2 py-1 text-xs font-bold text-content-inverse">
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

        </button>
      ))}
    </div>
  );
}
