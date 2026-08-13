"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { HoloCard } from "@/components/ui/holo-card";
import { holoEffectForRarity, HOLO_FEATURE_ENABLED } from "@/lib/cards/holo";

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
  baseRarity: string;
  artVariants: ArtVariant[];
  // Controlled mode — when provided, selected image is managed externally
  controlledImage?: string;
  onImageSelect?: (imageUrl: string, isBase: boolean) => void;
}

export function CardImageGallery({
  cardName,
  baseImageUrl,
  baseRarity,
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
    {
      id: "__origin",
      label: "Original",
      rarity: baseRarity,
      imageUrl: baseImageUrl,
    },
    ...artVariants.map((v) => ({
      id: v.id,
      label: v.label,
      rarity: v.rarity,
      imageUrl: v.imageUrl,
    })),
  ];
  const selectedRarity =
    allArtworks.find((art) => art.imageUrl === selectedImage)?.rarity ??
    baseRarity;
  const effect = HOLO_FEATURE_ENABLED
    ? holoEffectForRarity(selectedRarity)
    : "none";

  return (
    <div>
      {/* Main image */}
      <HoloCard effect={effect} className="overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selectedImage}
          alt={cardName}
          className="w-full"
          key={selectedImage}
        />
      </HoloCard>

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
                  aria-pressed={isSelected}
                  onClick={() => handleSelect(art.imageUrl)}
                  className={cn(
                    // A stretched grid-cell button vertically centres its
                    // content, so any height slack would paint as padding
                    // above the art; a top-aligned flex column pushes the
                    // slack below the label instead, and `aspect-card` keeps
                    // every scan the same height regardless of its intrinsic
                    // ratio.
                    "group flex cursor-pointer flex-col overflow-hidden rounded-md text-left transition-all hover:shadow-md",
                    isSelected
                      ? "border border-border-strong"
                      : "border border-border",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={art.imageUrl}
                    alt={`${cardName} — ${art.label}`}
                    className={cn(
                      "aspect-card w-full object-cover transition-opacity",
                      isSelected ? "opacity-100" : "opacity-70 group-hover:opacity-100",
                    )}
                    loading="lazy"
                  />
                  <div
                    className={cn(
                      "p-1 text-center text-sm font-medium",
                      isSelected
                        ? "bg-surface-interactive text-content-primary"
                        : "bg-card text-content-tertiary",
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
