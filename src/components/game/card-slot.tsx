"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
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

export function CardNameWithTooltip({ cardId, cardDb }: { cardId: string; cardDb: CardDb }) {
  const data = cardDb[cardId];
  const displayName = data?.name ?? cardId;
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const handleMouseEnter = useCallback(() => setVisible(true), []);
  const handleMouseLeave = useCallback(() => setVisible(false), []);

  useLayoutEffect(() => {
    if (!visible || !tooltipRef.current || !triggerRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const tt = tooltipRef.current;
    const gap = 8;
    const pad = 8;
    const ttW = tt.offsetWidth;
    const ttH = tt.offsetHeight;

    let left: number;
    const fitsRight = trigger.right + gap + ttW <= window.innerWidth - pad;
    const fitsLeft = trigger.left - gap - ttW >= pad;

    if (fitsRight) {
      left = trigger.right + gap;
    } else if (fitsLeft) {
      left = trigger.left - gap - ttW;
    } else {
      left = Math.max(pad, window.innerWidth - ttW - pad);
    }

    const top = Math.max(pad, Math.min(trigger.top, window.innerHeight - ttH - pad));

    tt.style.left = `${left}px`;
    tt.style.top = `${top}px`;
    tt.style.opacity = "1";
  }, [visible]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="text-gb-accent-blue cursor-default border-b border-dotted border-gb-accent-blue/50">
        {displayName}
      </span>

      {visible && data && (
        <div
          ref={tooltipRef}
          style={{ opacity: 0, top: 0, left: 0 }}
          className={cn(
            "fixed z-50 pointer-events-none",
            "bg-gb-surface border border-gb-border-strong rounded-md",
            "p-2.5 min-w-[220px] max-w-[340px] shadow-lg",
          )}
        >
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
