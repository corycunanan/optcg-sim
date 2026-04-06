"use client";

interface DeckBuilderDonProps {
  donArtUrl: string | null;
}

export function DeckBuilderDon({ donArtUrl }: DeckBuilderDonProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-5">
      <div className="flex flex-wrap justify-center gap-3">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={`don-${i}`}
            className="w-[100px] overflow-hidden rounded border border-border shadow-sm aspect-[600/838]"
          >
            {donArtUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={donArtUrl}
                alt={`DON card ${i + 1}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-navy-900" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
