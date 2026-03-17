"use client";

import { useState } from "react";

interface ArtVariant {
  id: string;
  variantId: string;
  label: string;
  rarity: string;
  imageUrl: string;
  set: string;
}

interface CardImageGalleryProps {
  cardName: string;
  baseImageUrl: string;
  artVariants: ArtVariant[];
}

export function CardImageGallery({
  cardName,
  baseImageUrl,
  artVariants,
}: CardImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState(baseImageUrl);

  // Build the full list: origin artwork first, then variants
  const allArtworks = [
    { id: "__origin", label: "Original", imageUrl: baseImageUrl },
    ...artVariants.map((v) => ({
      id: v.id,
      label: v.label,
      imageUrl: v.imageUrl,
    })),
  ];

  return (
    <div>
      {/* Main image */}
      <div
        className="overflow-hidden rounded-xl"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selectedImage}
          alt={cardName}
          className="w-full"
          key={selectedImage}
        />
      </div>

      {/* Artwork selector — only show if there are variants */}
      {artVariants.length > 0 && (
        <div className="mt-5">
          <h3
            className="mb-3 text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-tertiary)" }}
          >
            Artworks ({allArtworks.length})
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {allArtworks.map((art) => {
              const isSelected = selectedImage === art.imageUrl;
              return (
                <button
                  key={art.id}
                  type="button"
                  onClick={() => setSelectedImage(art.imageUrl)}
                  className="group cursor-pointer overflow-hidden rounded-lg text-left transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20"
                  style={{
                    border: isSelected
                      ? "2px solid var(--accent)"
                      : "1px solid var(--border-subtle)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={art.imageUrl}
                    alt={`${cardName} — ${art.label}`}
                    className={`w-full transition-opacity ${
                      isSelected ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                    }`}
                    loading="lazy"
                  />
                  <div
                    className="p-1.5 text-center text-[10px] font-medium"
                    style={{
                      background: isSelected
                        ? "var(--accent-soft)"
                        : "var(--surface-1)",
                      color: isSelected
                        ? "var(--accent)"
                        : "var(--text-tertiary)",
                    }}
                  >
                    {art.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
