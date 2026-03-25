"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardData, CardInstance } from "@shared/game-types";
import { CardTooltipContent } from "./board-card";

export function useCardTooltip(
  data: CardData | null,
  cardId: string | undefined,
  card?: CardInstance | null,
) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const showTooltip = hovered && data !== null;

  useLayoutEffect(() => {
    if (!showTooltip || !tooltipRef.current || !triggerRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
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

  const portal =
    showTooltip && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[200] pointer-events-none bg-gb-surface border border-gb-border-strong rounded-md p-3 min-w-[220px] max-w-[320px] shadow-lg"
            style={{ opacity: 0 }}
          >
            <CardTooltipContent data={data!} cardId={cardId} card={card} />
          </div>,
          document.body,
        )
      : null;

  return {
    triggerRef,
    hoverHandlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
    portal,
  };
}
