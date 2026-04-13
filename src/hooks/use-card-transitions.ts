"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameEvent } from "@shared/game-types";
import type { ZonePositionRegistry } from "@/contexts/zone-position-context";

export interface CardTransition {
  id: string;
  /** Card ID for rendering. Null means render face-down (sleeve). */
  cardId: string | null;
  /** Instance ID of the card in its destination zone (for exact placeholder matching). */
  instanceId: string | null;
  fromZoneKey: string;
  toZoneKey: string;
  playerIndex: 0 | 1;
  startedAt: number;
}

const MAX_CONCURRENT = 5;
const AUTO_EXPIRE_MS = 800;

let transitionCounter = 0;
function nextId() {
  return `ct-${++transitionCounter}`;
}

/** Map game event types to source/destination zone key patterns. */
function eventToTransition(
  event: GameEvent,
  myIndex: 0 | 1 | null,
  zoneRegistry: ZonePositionRegistry | null,
): CardTransition | null {
  const { type, playerIndex } = event;
  const prefix = playerIndex === myIndex ? "p" : "o";

  let from: string | null = null;
  let to: string | null = null;
  let cardId: string | null = null;
  let cardInstanceId: string | null = null;

  switch (type) {
    case "CARD_PLAYED": {
      const p = event.payload;
      cardId = p.cardId;
      cardInstanceId = p.cardInstanceId;
      from = `${prefix}-hand`;
      if (p.zone === "STAGE") {
        to = `${prefix}-stage`;
      } else if (p.zone === "TRASH") {
        to = `${prefix}-trash`;
      } else {
        const resolvedZone = cardInstanceId && zoneRegistry
          ? zoneRegistry.getCardZone(cardInstanceId)
          : null;
        to = resolvedZone ?? `${prefix}-char-2`;
      }
      break;
    }
    case "CARD_KO": {
      cardId = event.payload.cardId;
      cardInstanceId = event.payload.cardInstanceId;
      const resolvedZone = cardInstanceId && zoneRegistry
        ? zoneRegistry.getCardZone(cardInstanceId)
        : null;
      from = resolvedZone ?? `${prefix}-char-2`;
      to = `${prefix}-trash`;
      break;
    }
    case "CARD_TRASHED": {
      const p = event.payload;
      cardId = p.cardId ?? null;
      cardInstanceId = p.cardInstanceId ?? null;
      if (!cardId && p.count) return null;
      if (p.from === "HAND") {
        from = `${prefix}-hand`;
      } else {
        const resolvedZone = cardInstanceId && zoneRegistry
          ? zoneRegistry.getCardZone(cardInstanceId)
          : null;
        from = resolvedZone ?? `${prefix}-char-2`;
      }
      to = `${prefix}-trash`;
      break;
    }
    case "CARD_DRAWN": {
      cardId = event.payload.cardId;
      cardInstanceId = event.payload.cardInstanceId ?? null;
      from = `${prefix}-deck`;
      to = `${prefix}-hand`;
      break;
    }
    case "CARD_RETURNED_TO_HAND": {
      const p = event.payload;
      cardId = p.cardId;
      cardInstanceId = p.cardInstanceId;
      if (p.source === "TRASH") {
        from = `${prefix}-trash`;
      } else {
        const resolvedZone = cardInstanceId && zoneRegistry
          ? zoneRegistry.getCardZone(cardInstanceId)
          : null;
        from = resolvedZone ?? `${prefix}-char-2`;
      }
      to = `${prefix}-hand`;
      break;
    }
    case "CARD_ADDED_TO_HAND_FROM_LIFE": {
      cardId = event.payload.cardId ?? null;
      cardInstanceId = event.payload.cardInstanceId ?? null;
      from = `${prefix}-life`;
      to = `${prefix}-hand`;
      break;
    }
    case "DON_PLACED_ON_FIELD": {
      return null;
    }
    default:
      return null;
  }

  if (!from || !to) return null;

  return {
    id: nextId(),
    cardId,
    instanceId: cardInstanceId,
    fromZoneKey: from,
    toZoneKey: to,
    playerIndex,
    startedAt: Date.now(),
  };
}

export function useCardTransitions(
  eventLog: GameEvent[],
  myIndex: 0 | 1 | null,
  isDragging: boolean,
  zoneRegistry?: ZonePositionRegistry | null,
) {
  const [transitions, setTransitions] = useState<CardTransition[]>([]);
  // Track the highest timestamp we've processed. Using timestamps (instead of
  // array length) keeps dedup stable when the server sends a reconstructed
  // eventLog with the same length but different content.
  const lastTimestampRef = useRef<number | null>(null);
  const dragCooldownRef = useRef(false);

  // After a drag ends, suppress animations briefly so the server-confirmed
  // state update doesn't produce a redundant ghost card.
  useEffect(() => {
    if (isDragging) {
      dragCooldownRef.current = true;
    } else if (dragCooldownRef.current) {
      const timer = setTimeout(() => {
        dragCooldownRef.current = false;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isDragging]);

  // Detect new events and create transitions
  useEffect(() => {
    // First run: seed the cursor so historic events don't replay.
    if (lastTimestampRef.current === null) {
      const last = eventLog[eventLog.length - 1];
      lastTimestampRef.current = last ? last.timestamp : 0;
      return;
    }

    const lastTs = lastTimestampRef.current;
    let maxTs = lastTs;
    const newEvents: GameEvent[] = [];
    for (const ev of eventLog) {
      if (ev.timestamp > lastTs) {
        newEvents.push(ev);
        if (ev.timestamp > maxTs) maxTs = ev.timestamp;
      }
    }

    if (newEvents.length === 0) return;
    lastTimestampRef.current = maxTs;

    if (isDragging || dragCooldownRef.current) return;

    const newTransitions: CardTransition[] = [];
    for (const event of newEvents) {
      const t = eventToTransition(event, myIndex, zoneRegistry ?? null);
      if (t) newTransitions.push(t);
    }

    if (newTransitions.length === 0) return;

    setTransitions((prev) => {
      const combined = [...prev, ...newTransitions];
      return combined.slice(-MAX_CONCURRENT);
    });
  }, [eventLog, myIndex, isDragging, zoneRegistry]);

  // Auto-expire old transitions
  useEffect(() => {
    if (transitions.length === 0) return;

    const timer = setTimeout(() => {
      const now = Date.now();
      setTransitions((prev) =>
        prev.filter((t) => now - t.startedAt < AUTO_EXPIRE_MS),
      );
    }, AUTO_EXPIRE_MS);

    return () => clearTimeout(timer);
  }, [transitions]);

  const removeTransition = useCallback((id: string) => {
    setTransitions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { transitions, removeTransition };
}
