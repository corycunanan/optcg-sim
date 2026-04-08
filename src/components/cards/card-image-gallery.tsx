"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

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
  // Controlled mode — when provided, selected image is managed externally
  controlledImage?: string;
  onImageSelect?: (imageUrl: string, isBase: boolean) => void;
}

export function CardImageGallery({
  cardName,
  baseImageUrl,
  artVariants,
  controlledImage,
  onImageSelect,
}: CardImageGalleryProps) {
  const [internalImage, setInternalImage] = useState(baseImageUrl);
  const selectedImage = controlledImage ?? internalImage;

  function handleSelect(imageUrl: string) {
    if (onImageSelect) {
      onImageSelect(imageUrl, imageUrl === baseImageUrl);
    } else {
      setInternalImage(imageUrl);
    }
  }

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
      <div className="overflow-hidden rounded-lg border border-border">
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
          <div className="grid grid-cols-4 gap-2">
            {allArtworks.map((art) => {
              const isSelected = selectedImage === art.imageUrl;
              return (
                <button
                  key={art.id}
                  type="button"
                  onClick={() => handleSelect(art.imageUrl)}
                  className={cn(
                    "group cursor-pointer overflow-hidden rounded text-left transition-all hover:shadow-md",
                    isSelected
                      ? "ring-2 ring-navy-900"
                      : "border border-border",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={art.imageUrl}
                    alt={`${cardName} — ${art.label}`}
                    className={cn(
                      "w-full transition-opacity",
                      isSelected ? "opacity-100" : "opacity-70 group-hover:opacity-100",
                    )}
                    loading="lazy"
                  />
                  <div
                    className={cn(
                      "p-1 text-center text-xs font-medium",
                      isSelected
                        ? "bg-navy-100 text-navy-900"
                        : "bg-surface-1 text-content-tertiary",
                    )}
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
