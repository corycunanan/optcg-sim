"use client";

import { useCallback, useRef, useState } from "react";
import type { CardData, CardInstance } from "@shared/game-types";
import { cn } from "@/lib/utils";

type CardDb = Record<string, CardData>;

export function CardRow({ card, cardDb }: { card: CardInstance; cardDb: CardDb }) {
  const donCount = card.attachedDon.length;
  return (
    <div className="flex items-center gap-1 py-0.5 border-b border-gb-border-subtle text-xs">
      <CardNameWithTooltip cardId={card.cardId} cardDb={cardDb} />
      <span className="text-xs text-gb-text-dim">&middot;</span>
      <span className={cn(
        "text-xs",
        card.state === "ACTIVE" ? "text-gb-accent-green" : "text-gb-text-subtle",
      )}>
        {card.state}
      </span>
      {donCount > 0 && (
        <span className="text-xs text-gb-accent-amber">+{donCount} DON</span>
      )}
    </div>
  );
}

type TooltipPlacement = { vertical: "above" | "below"; horizontal: "left" | "right" };

export function CardNameWithTooltip({ cardId, cardDb }: { cardId: string; cardDb: CardDb }) {
  const data = cardDb[cardId];
  const displayName = data?.name ?? cardId;
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [placement, setPlacement] = useState<TooltipPlacement>({ vertical: "above", horizontal: "left" });

  const handleMouseEnter = useCallback(() => {
    if (!ref.current) { setVisible(true); return; }
    const rect = ref.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceRight = window.innerWidth - rect.left;
    setPlacement({
      vertical: spaceAbove < 200 ? "below" : "above",
      horizontal: spaceRight < 360 ? "right" : "left",
    });
    setVisible(true);
  }, []);

  return (
    <span ref={ref} className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={() => setVisible(false)}>
      <span className="text-gb-accent-blue cursor-default border-b border-dotted border-gb-accent-blue/50">
        {displayName}
      </span>

      {visible && data && (
        <div className={cn(
          "absolute z-50 pointer-events-none",
          "bg-gb-surface border border-gb-border-strong rounded-md",
          "p-2.5 min-w-[220px] max-w-[340px] shadow-lg",
          placement.vertical === "above" ? "bottom-full mb-1" : "top-full mt-1",
          placement.horizontal === "left" ? "left-0" : "right-0",
        )}>
          <div className="font-bold text-gb-text-bright text-sm mb-1">
            {data.name}
          </div>
          <div className="text-xs text-gb-text-subtle mb-1">{data.type} &middot; {cardId}</div>

          <div className="flex gap-2.5 flex-wrap mb-1 text-xs">
            {data.type === "Leader"
              ? (data.life ?? data.cost) !== null && (
                  <TooltipStat label="Life" value={(data.life ?? data.cost)!} color="var(--gb-accent-rose)" />
                )
              : data.cost !== null && (
                  <TooltipStat label="Cost" value={data.cost} color="var(--gb-accent-amber)" />
                )
            }
            {data.power !== null && (
              <TooltipStat label="Power" value={data.power.toLocaleString()} color="var(--gb-accent-green)" />
            )}
            {data.counter !== null && (
              <TooltipStat label="Counter" value={`+${data.counter}`} color="var(--gb-accent-purple)" />
            )}
            {data.type !== "Leader" && data.life !== null && (
              <TooltipStat label="Life" value={data.life} color="var(--gb-accent-rose)" />
            )}
          </div>

          {data.effectText && (
            <div className="text-xs text-gb-text-subtle leading-relaxed border-t border-gb-border-strong pt-1 whitespace-pre-wrap">
              {data.effectText}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function TooltipStat({ label, value, color }: { label: string; value: unknown; color: string }) {
  return (
    <div className="text-center">
      <div className="font-bold text-sm" style={{ color }}>{String(value)}</div>
      <div className="text-xs text-gb-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
