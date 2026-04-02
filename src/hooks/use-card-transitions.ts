"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameEvent, GameEventType } from "@shared/game-types";

export interface CardTransition {
  id: string;
  /** Card ID for rendering. Null means render face-down (sleeve). */
  cardId: string | null;
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
): CardTransition | null {
  const { type, playerIndex, payload } = event;
  const cardId = (payload.cardId as string) ?? null;
  const prefix = playerIndex === myIndex ? "p" : "o";

  let from: string | null = null;
  let to: string | null = null;

  switch (type) {
    case "CARD_PLAYED": {
      if (!cardId) return null;
      from = `${prefix}-hand`;
      const zone = payload.zone as string | undefined;
      if (zone === "STAGE") {
        to = `${prefix}-stage`;
      } else if (zone === "TRASH") {
        // Event cards go to trash — animate hand → trash
        to = `${prefix}-trash`;
      } else {
        // Character zone — no slot index in payload, use middle slot
        to = `${prefix}-char-2`;
      }
      break;
    }
    case "CARD_KO": {
      // From character field to trash
      from = `${prefix}-char-2`; // approximate — no slot info available
      to = `${prefix}-trash`;
      break;
    }
    case "CARD_TRASHED": {
      // Skip count-based trashes (milling, etc.) — no single card to animate
      if (!cardId && payload.count) return null;
      // From hand or field to trash
      const source = payload.from as string | undefined;
      if (source === "HAND") {
        from = `${prefix}-hand`;
      } else {
        from = `${prefix}-char-2`; // approximate
      }
      to = `${prefix}-trash`;
      break;
    }
    case "CARD_DRAWN": {
      from = `${prefix}-deck`;
      to = `${prefix}-hand`;
      // cardId may be null for opponent draws (hidden info)
      break;
    }
    case "CARD_RETURNED_TO_HAND": {
      const source = payload.source as string | undefined;
      from = source === "TRASH" ? `${prefix}-trash` : `${prefix}-char-2`;
      to = `${prefix}-hand`;
      break;
    }
    case "CARD_ADDED_TO_HAND_FROM_LIFE": {
      from = `${prefix}-life`;
      to = `${prefix}-hand`;
      break;
    }
    case "DON_PLACED_ON_FIELD": {
      // DON deck doesn't have a registered zone — skip for now
      return null;
    }
    default:
      return null;
  }

  if (!from || !to) return null;

  return {
    id: nextId(),
    cardId,
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
) {
  const [transitions, setTransitions] = useState<CardTransition[]>([]);
  const prevLengthRef = useRef(0);
  const dragCooldownRef = useRef(false);

  // After a drag ends, suppress animations briefly so the server-confirmed
  // state update doesn't produce a redundant ghost card.
  useEffect(() => {
    if (isDragging) {
      dragCooldownRef.current = true;
    } else if (dragCooldownRef.current) {
      // Drag just ended — keep cooldown active for one state update cycle
      const timer = setTimeout(() => {
        dragCooldownRef.current = false;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isDragging]);

  // Detect new events and create transitions
  useEffect(() => {
    const prevLen = prevLengthRef.current;
    const newLen = eventLog.length;
    prevLengthRef.current = newLen;

    // Skip if no new events, during/just-after drag, or on initial load
    if (newLen <= prevLen || isDragging || dragCooldownRef.current || prevLen === 0) return;

    const newEvents = eventLog.slice(prevLen);
    const newTransitions: CardTransition[] = [];

    for (const event of newEvents) {
      const t = eventToTransition(event, myIndex);
      if (t) newTransitions.push(t);
    }

    if (newTransitions.length === 0) return;

    setTransitions((prev) => {
      const combined = [...prev, ...newTransitions];
      // Cap at MAX_CONCURRENT, keep most recent
      return combined.slice(-MAX_CONCURRENT);
    });
  }, [eventLog.length, eventLog, myIndex, isDragging]);

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
