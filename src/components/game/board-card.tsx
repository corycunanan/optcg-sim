"use client";

import React from "react";
import type { CardDb, CardInstance } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { CardTooltip } from "./use-card-tooltip";

const DEFAULT_SLEEVE_IMG = "/images/card-sleeves/ulti.jpg";

interface BoardCardProps {
  card?: CardInstance | null;
  cardId?: string;
  cardDb: CardDb;
  faceDown?: boolean;
  sleeve?: boolean;
  sleeveUrl?: string | null;
  empty?: boolean;
  label?: string;
  count?: number;
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  highlight?: boolean;
}

export const BoardCard = React.memo(function BoardCard({
  card,
  cardId: cardIdOverride,
  cardDb,
  faceDown,
  sleeve,
  sleeveUrl,
  empty,
  label,
  count,
  width,
  height,
  className,
  style,
  onClick,
  highlight,
}: BoardCardProps) {
  const resolvedCardId = card?.cardId ?? cardIdOverride;
  const data = resolvedCardId ? cardDb[resolvedCardId] : null;

  if (empty) {
    return (
      <div
        onClick={onClick}
        className={cn(
          "rounded border border-dashed flex items-center justify-center",
          "border-gb-border-strong/30 bg-gb-board/50",
          onClick && "cursor-pointer",
          className,
        )}
        style={{ width, height, ...style }}
      >
        {label && (
          <span className="text-xs text-gb-text-dim/50 select-none uppercase tracking-wider leading-tight text-center">
            {label}
          </span>
        )}
      </div>
    );
  }

  if (faceDown || sleeve) {
    return (
      <div
        onClick={onClick}
        className={cn(
          "rounded border border-gb-border-strong relative overflow-hidden",
          sleeve ? "bg-gb-board-dark" : "bg-gb-surface-inset",
          onClick && "cursor-pointer",
          className,
        )}
        style={{ width, height, ...style }}
      >
        {sleeve ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={sleeveUrl || DEFAULT_SLEEVE_IMG}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div
            className="absolute inset-0 opacity-15"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 3px, currentColor 3px, currentColor 4px)",
              color: "var(--gb-border-strong)",
            }}
          />
        )}
        {count != null && count > 0 && (
          <div className="absolute bottom-1 right-1 bg-gb-board-dark/80 text-gb-text-bright text-xs font-bold px-1 rounded text-center z-[1]">
            {count}
          </div>
        )}
        {label && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-gb-text-dim/40 select-none uppercase tracking-wider z-[1]">
            {label}
          </span>
        )}
      </div>
    );
  }

  const imageUrl = data?.imageUrl ?? null;

  const cardElement = (
    <div
      className={cn("relative", className)}
      style={{ width, height, ...style }}
    >
      <div
        onClick={onClick}
        className={cn(
          "rounded border relative overflow-hidden",
          highlight
            ? "border-gb-accent-green ring-1 ring-gb-accent-green/30"
            : "border-gb-border-strong",
          onClick && "cursor-pointer hover:border-gb-text-muted",
          !imageUrl && "flex flex-col bg-gb-surface-raised",
        )}
        style={{ width, height }}
      >
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={data?.name ?? ""}
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          </>
        ) : (
          <>
            <div className="px-1 pt-1 text-xs leading-tight text-gb-text-bright font-bold line-clamp-2">
              {data?.name ?? label ?? "?"}
            </div>
            {data?.type && (
              <div className="px-1">
                <span className="text-xs text-gb-text-dim">{data.type}</span>
              </div>
            )}
            <div className="flex-1" />
            <div className="px-1 pb-1 flex items-end justify-between">
              {data?.power != null && (
                <span className="text-xs font-bold text-gb-accent-green leading-none">
                  {data.power >= 1000
                    ? `${(data.power / 1000).toFixed(0)}K`
                    : data.power}
                </span>
              )}
            </div>
          </>
        )}

        {count != null && count > 0 && (
          <div className="absolute top-1 right-1 bg-gb-board-dark/80 text-gb-text-bright text-xs font-bold px-1 rounded text-center">
            {count}
          </div>
        )}
      </div>
    </div>
  );

  if (!data) return cardElement;

  return (
    <CardTooltip data={data} cardId={resolvedCardId} card={card}>
      {cardElement}
    </CardTooltip>
  );
});

