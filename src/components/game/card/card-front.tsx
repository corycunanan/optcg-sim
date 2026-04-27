"use client";

import React from "react";
import type { CardData } from "@shared/game-types";
import { cn } from "@/lib/utils";

/**
 * Front face of the card — artwork when available, else a compact
 * name/type/power placeholder. `backface-visibility: hidden` keeps this layer
 * from showing through during the flip.
 */
export function CardFront({
  data,
  fallbackLabel,
  imageUrlOverride,
  className,
}: {
  data: CardData | null;
  fallbackLabel?: string;
  /**
   * Direct image URL that bypasses the cardDb lookup — used by tokens
   * without card data (DON!!). Falls back to `data.imageUrl` when absent.
   */
  imageUrlOverride?: string;
  className?: string;
}) {
  const imageUrl = imageUrlOverride ?? data?.imageUrl ?? null;

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden rounded border border-gb-border-strong",
        "[backface-visibility:hidden]",
        !imageUrl && "flex flex-col bg-gb-surface-raised",
        className,
      )}
    >
      {imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageUrl}
          alt={data?.name ?? ""}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <>
          <div className="px-1 pt-1 text-sm leading-tight font-bold text-gb-text-bright line-clamp-2">
            {data?.name ?? fallbackLabel ?? "?"}
          </div>
          {data?.type && (
            <div className="px-1">
              <span className="text-sm text-gb-text-dim">{data.type}</span>
            </div>
          )}
          <div className="flex-1" />
          <div className="px-1 pb-1 flex items-end justify-between">
            {data?.power != null && (
              <span className="text-sm font-bold leading-none text-gb-accent-green">
                {data.power >= 1000
                  ? `${(data.power / 1000).toFixed(0)}K`
                  : data.power}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
