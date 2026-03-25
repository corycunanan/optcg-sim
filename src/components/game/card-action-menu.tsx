"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";

interface CardActionMenuProps {
  card: CardInstance;
  cardDb: CardDb;
  anchorX: number;
  anchorY: number;
  onAction: (action: GameAction) => void;
  onClose: () => void;
}

/**
 * Right-click context menu for field cards.
 * Shows "Activate [Main] effect" if the card has an ACTIVATE_MAIN effect block,
 * otherwise shows a disabled "No [Main] effect".
 */
export function CardActionMenu({
  card,
  cardDb,
  anchorX,
  anchorY,
  onAction,
  onClose,
}: CardActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click-outside or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Position: clamp to viewport
  const [pos, setPos] = useState({ x: anchorX, y: anchorY });
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    let x = anchorX;
    let y = anchorY;
    if (x + rect.width > window.innerWidth - pad) {
      x = window.innerWidth - rect.width - pad;
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = window.innerHeight - rect.height - pad;
    }
    setPos({ x: Math.max(pad, x), y: Math.max(pad, y) });
  }, [anchorX, anchorY]);

  // Determine if card has an [Activate: Main] effect
  const data = cardDb[card.cardId];
  const schema = data?.effectSchema as {
    effects?: Array<{
      id: string;
      category: string;
      trigger?: { keyword?: string };
    }>;
  } | null;

  const activateBlock = schema?.effects?.find(
    (e) =>
      e.category === "activate" &&
      e.trigger?.keyword === "ACTIVATE_MAIN",
  );

  const hasMainEffect = !!activateBlock;

  const handleActivate = useCallback(() => {
    if (!hasMainEffect || !activateBlock) return;
    onAction({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: card.instanceId,
      effectId: activateBlock.id,
    });
    onClose();
  }, [hasMainEffect, activateBlock, card.instanceId, onAction, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] min-w-[200px] rounded-md border border-gb-border-strong bg-gb-surface shadow-lg py-1"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Card name header */}
      <div className="px-3 py-2 border-b border-gb-border-subtle">
        <span className="text-xs font-bold text-gb-text-bright truncate block">
          {data?.name ?? "Unknown Card"}
        </span>
        <span className="text-xs text-gb-text-dim">
          {data?.type}
        </span>
      </div>

      {/* Activate Main effect */}
      <button
        onClick={handleActivate}
        disabled={!hasMainEffect}
        className={cn(
          "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
          hasMainEffect
            ? "text-gb-text hover:bg-gb-surface-raised cursor-pointer"
            : "text-gb-text-dim cursor-not-allowed",
        )}
      >
        <span className="text-xs shrink-0">
          {hasMainEffect ? "⚡" : "—"}
        </span>
        <span>
          {hasMainEffect ? "Activate [Main] effect" : "No [Main] effect"}
        </span>
      </button>
    </div>,
    document.body,
  );
}
