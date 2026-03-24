"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardDb, CardInstance } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { TooltipStat } from "./game-ui";

const SLEEVE_IMG = "/images/card-sleeves/ulti.jpg";

interface BoardCardProps {
  card?: CardInstance | null;
  cardId?: string;
  cardDb: CardDb;
  faceDown?: boolean;
  sleeve?: boolean;
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

export function BoardCard({
  card,
  cardId: cardIdOverride,
  cardDb,
  faceDown,
  sleeve,
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
  const isRested = card?.state === "RESTED";
  const donCount = card?.attachedDon.length ?? 0;

  const cardRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const showTooltip = hovered && data !== null;

  useLayoutEffect(() => {
    if (!showTooltip || !tooltipRef.current || !cardRef.current) return;

    const trigger = cardRef.current.getBoundingClientRect();
    const tt = tooltipRef.current;
    const gap = 8;
    const pad = 8;
    const ttW = tt.offsetWidth;
    const ttH = tt.offsetHeight;

    let left: number;
    if (trigger.right + gap + ttW <= window.innerWidth - pad) {
      left = trigger.right + gap;
    } else if (trigger.left - gap - ttW >= pad) {
      left = trigger.left - gap - ttW;
    } else {
      left = Math.max(pad, window.innerWidth - ttW - pad);
    }

    const top = Math.max(
      pad,
      Math.min(trigger.top, window.innerHeight - ttH - pad),
    );

    tt.style.left = `${left}px`;
    tt.style.top = `${top}px`;
    tt.style.opacity = "1";
  }, [showTooltip]);

  if (empty) {
    return (
      <div
        className={cn(
          "rounded border border-dashed flex items-center justify-center",
          "border-gb-border-strong/30 bg-gb-board/50",
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
        className={cn(
          "rounded border border-gb-border-strong relative overflow-hidden",
          sleeve ? "bg-gb-board-dark" : "bg-gb-surface-inset",
          className,
        )}
        style={{ width, height, ...style }}
      >
        {sleeve ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={SLEEVE_IMG}
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

  return (
    <>
      <div
        className={cn("relative", isRested && "opacity-60", className)}
        style={{ width, height, ...style }}
      >
        <div
          ref={cardRef}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={onClick}
          className={cn(
            "rounded border relative overflow-hidden",
            highlight
              ? "border-gb-accent-green ring-1 ring-gb-accent-green/30"
              : "border-gb-border-strong",
            onClick && "cursor-pointer hover:border-gb-text-muted",
            !imageUrl && "flex flex-col bg-gb-surface-raised",
          )}
          style={{
            width,
            height,
            ...(isRested ? { transform: "rotate(90deg)" } : undefined),
          }}
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

        {donCount > 0 && (
          <div
            className="absolute z-10 text-center bg-gb-board-dark/75 py-0.5"
            style={{
              bottom: isRested ? (height - width) / 2 : 0,
              left: isRested ? -(height - width) / 2 : 0,
              width: isRested ? height : width,
            }}
          >
            <span className="text-xs font-extrabold text-white leading-none">
              +{donCount} DON
            </span>
          </div>
        )}
      </div>

      {showTooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[100] pointer-events-none bg-gb-surface border border-gb-border-strong rounded-md p-3 min-w-[220px] max-w-[320px] shadow-lg"
            style={{ opacity: 0 }}
          >
            <div className="font-bold text-gb-text-bright text-sm mb-1">
              {data!.name}
            </div>
            <div className="text-xs text-gb-text-subtle mb-1">
              {data!.type} &middot; {resolvedCardId}
            </div>
            <div className="flex gap-3 flex-wrap mb-1 text-xs">
              {data!.type === "Leader"
                ? (data!.life ?? data!.cost) != null && (
                    <TooltipStat
                      label="Life"
                      value={(data!.life ?? data!.cost)!}
                      color="var(--gb-accent-rose)"
                    />
                  )
                : data!.cost != null && (
                    <TooltipStat
                      label="Cost"
                      value={data!.cost}
                      color="var(--gb-accent-amber)"
                    />
                  )}
              {data!.power != null && (
                <TooltipStat
                  label="Power"
                  value={data!.power.toLocaleString()}
                  color="var(--gb-accent-green)"
                />
              )}
              {data!.counter != null && (
                <TooltipStat
                  label="Counter"
                  value={`+${data!.counter}`}
                  color="var(--gb-accent-purple)"
                />
              )}
              {data!.type !== "Leader" && data!.life != null && (
                <TooltipStat
                  label="Life"
                  value={data!.life}
                  color="var(--gb-accent-rose)"
                />
              )}
            </div>
            {data!.effectText && (
              <div className="text-xs text-gb-text-subtle leading-relaxed border-t border-gb-border-strong pt-1 whitespace-pre-wrap">
                {data!.effectText}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

