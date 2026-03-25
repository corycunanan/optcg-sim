"use client";

import React, { useEffect, useRef, useState } from "react";
import type { CardDb, GameEvent } from "@shared/game-types";
import { cn } from "@/lib/utils";

interface EventLogProps {
  events: GameEvent[];
  cardDb: CardDb;
  myIndex: 0 | 1 | null;
}

/** Human-readable label for a game event */
function formatEvent(
  event: GameEvent,
  cardDb: CardDb,
  myIndex: 0 | 1 | null,
): { icon: string; text: string; accent?: string } | null {
  const who = event.playerIndex === myIndex ? "You" : "Opponent";
  const cardName = (id?: unknown) => {
    if (!id || typeof id !== "string") return "a card";
    return cardDb[id]?.name ?? id;
  };

  switch (event.type) {
    case "CARD_PLAYED": {
      const name = cardName(event.payload.cardId);
      const zone = event.payload.zone;
      if (zone === "TRASH") return { icon: "🎴", text: `${who} played event ${name}`, accent: "text-gb-accent-purple" };
      return { icon: "🃏", text: `${who} played ${name}` };
    }
    case "CARD_DRAWN":
      return { icon: "📥", text: `${who} drew ${event.payload.count ?? 1} card(s)` };
    case "CARD_KO": {
      const name = cardName(event.payload.cardId);
      return { icon: "💀", text: `${name} was K.O.'d`, accent: "text-gb-accent-red" };
    }
    case "CARD_TRASHED": {
      const name = cardName(event.payload.cardId);
      const reason = event.payload.reason;
      if (reason === "overflow") return { icon: "🗑️", text: `${name} trashed (overflow)` };
      if (reason === "stage_replaced") return { icon: "🗑️", text: `${name} trashed (stage replaced)` };
      return { icon: "🗑️", text: `${name} trashed` };
    }
    case "CARD_RETURNED_TO_HAND": {
      const name = cardName(event.payload.cardId);
      return { icon: "↩️", text: `${name} returned to hand` };
    }
    case "ATTACK_DECLARED": {
      const atk = cardName(event.payload.attackerCardId);
      const tgt = cardName(event.payload.targetCardId);
      return { icon: "⚔️", text: `${who} attacked ${tgt} with ${atk}`, accent: "text-gb-accent-amber" };
    }
    case "BLOCK_DECLARED": {
      const name = cardName(event.payload.blockerCardId);
      return { icon: "🛡️", text: `${who} blocked with ${name}`, accent: "text-gb-accent-blue" };
    }
    case "COUNTER_USED": {
      const name = cardName(event.payload.cardId);
      return { icon: "🔄", text: `${who} used counter ${name}` };
    }
    case "DAMAGE_DEALT":
      return { icon: "💥", text: `${who} took damage`, accent: "text-gb-accent-red" };
    case "TRIGGER_ACTIVATED": {
      const name = cardName(event.payload.cardId);
      return { icon: "⚡", text: `Trigger: ${name}`, accent: "text-gb-accent-purple" };
    }
    case "DON_GIVEN_TO_CARD": {
      const count = (event.payload.count as number) ?? 1;
      return { icon: "🔴", text: `${who} attached ${count} DON!!` };
    }
    case "POWER_MODIFIED": {
      const name = cardName(event.payload.cardId);
      const amount = event.payload.amount as number;
      const sign = amount > 0 ? "+" : "";
      return { icon: "💪", text: `${name} ${sign}${amount} power`, accent: amount > 0 ? "text-gb-accent-green" : "text-gb-accent-red" };
    }
    case "TURN_STARTED":
      return { icon: "🔄", text: `Turn ${event.payload.turnNumber ?? "?"} — ${who}'s turn`, accent: "text-gb-text-bright" };
    case "GAME_OVER": {
      const reason = event.payload.reason;
      return { icon: "🏁", text: `Game over: ${reason}`, accent: "text-gb-accent-amber" };
    }
    case "PHASE_CHANGED":
    case "TURN_ENDED":
    case "DON_PLACED_ON_FIELD":
    case "DON_STATE_CHANGED":
    case "DON_DETACHED":
    case "CARD_STATE_CHANGED":
    case "BATTLE_RESOLVED":
    case "LIFE_CARD_FACE_CHANGED":
    case "CARD_ADDED_TO_HAND_FROM_LIFE":
      return null; // Too noisy — suppress
    default:
      return null;
  }
}

export function EventLog({ events, cardDb, myIndex }: EventLogProps) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (events.length > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = events.length;
  }, [events.length]);

  // Format only the displayable events
  const displayEvents = events
    .map((e, i) => ({ key: i, ...formatEvent(e, cardDb, myIndex) }))
    .filter((e): e is { key: number; icon: string; text: string; accent?: string } => e.icon !== undefined);

  // Show last 100 max
  const visibleEvents = displayEvents.slice(-100);

  return (
    <div
      className={cn(
        "fixed bottom-3 left-3 z-[100] flex flex-col rounded-lg border border-gb-border-strong bg-gb-surface/95 backdrop-blur-sm shadow-lg transition-all duration-200",
        collapsed ? "w-[180px]" : "w-[280px]",
      )}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center justify-between px-3 py-2 cursor-pointer border-b border-gb-border-subtle hover:bg-gb-surface-raised transition-colors rounded-t-lg"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-gb-text-dim">
          Event Log
        </span>
        <div className="flex items-center gap-2">
          {collapsed && displayEvents.length > 0 && (
            <span className="text-xs text-gb-text-muted">
              {displayEvents.length}
            </span>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
            className={cn(
              "text-gb-text-dim transition-transform duration-200",
              collapsed && "rotate-180",
            )}
          >
            <path d="M2 4.5L6 8.5L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* Event list */}
      {!collapsed && (
        <div
          ref={scrollRef}
          className="overflow-y-auto max-h-[200px] px-1 py-1 scrollbar-thin"
        >
          {visibleEvents.length === 0 ? (
            <p className="text-xs text-gb-text-dim px-2 py-3 text-center italic">
              No events yet
            </p>
          ) : (
            visibleEvents.map((entry) => (
              <div
                key={entry.key}
                className="flex items-start gap-1 px-2 py-1 rounded hover:bg-gb-surface-raised/50 transition-colors"
              >
                <span className="text-xs leading-5 shrink-0">{entry.icon}</span>
                <span
                  className={cn(
                    "text-xs leading-5",
                    entry.accent ?? "text-gb-text",
                  )}
                >
                  {entry.text}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
