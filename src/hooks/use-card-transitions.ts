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
  /** Marks the flight as originating from a KO event — flight layer plays
   *  the KO shrink preset at the source zone before the trash flight.
   *  `"don-attach"` (OPT-274) renders a DON token flying from the DON pool
   *  onto the destination card. */
  kind?: "ko" | "don-attach";
  /** Flight start delay in seconds (OPT-274). Used to stagger multi-card
   *  draws (`~60ms` between arrivals) and multi-DON attachments so they
   *  fan out sequentially instead of landing in a single instant. */
  delay?: number;
  /** For `kind: "don-attach"`, the target character's instanceId (used by
   *  consumers to offset the displayed DON count until the token lands).
   *  Mirrors `instanceId` for character-flight kinds — split out so a
   *  DON-attach target is distinguishable from a target-zone card. */
  targetInstanceId?: string;
}

const MAX_CONCURRENT = 8;
// Covers the worst case: `MAX_CONCURRENT * STAGGER_MS` of start-time offset +
// the longest flight path (arc + bouncy landing) before `onAnimationComplete`
// fires. `onComplete` is the normal cleanup path; this timer is a safety net.
const AUTO_EXPIRE_MS = 1500;
/** Per-batch stagger between arrivals (OPT-274). Keeps multi-card draws
 *  (e.g. "draw 2", Perona peek, search-and-draw effects) from landing in a
 *  single instant. Also used for the per-token delay inside a DON attach. */
const STAGGER_MS = 60;

let transitionCounter = 0;
function nextId() {
  return `ct-${++transitionCounter}`;
}

/** Map game event types to source/destination zone key patterns. Returns
 *  one or more transitions (multi-DON attachments produce `count` entries).
 *  Exported for unit testing. */
export function eventToTransitions(
  event: GameEvent,
  myIndex: 0 | 1 | null,
  zoneRegistry: ZonePositionRegistry | null,
): CardTransition[] {
  const single = eventToTransition(event, myIndex, zoneRegistry);
  if (single) return [single];

  // DON_GIVEN_TO_CARD fans out into `count` staggered token flights.
  if (event.type === "DON_GIVEN_TO_CARD") {
    const { playerIndex } = event;
    const prefix = playerIndex === myIndex ? "p" : "o";
    const targetId = event.payload.targetInstanceId;
    if (!targetId || !zoneRegistry) return [];
    const toZoneKey = zoneRegistry.getCardZone(targetId);
    if (!toZoneKey) return [];
    const count = Math.max(1, event.payload.count ?? 1);
    const startedAt = Date.now();
    const out: CardTransition[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        id: nextId(),
        cardId: null,
        instanceId: null,
        fromZoneKey: `${prefix}-don`,
        toZoneKey,
        playerIndex,
        startedAt,
        kind: "don-attach",
        delay: (i * STAGGER_MS) / 1000,
        targetInstanceId: targetId,
      });
    }
    return out;
  }

  return [];
}

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
      return {
        id: nextId(),
        cardId,
        instanceId: cardInstanceId,
        fromZoneKey: from,
        toZoneKey: to,
        playerIndex,
        startedAt: Date.now(),
        kind: "ko",
      };
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

/**
 * Apply a per-index stagger to a batch of transitions so multi-card arrivals
 * fan out sequentially instead of landing in a single instant. The first
 * transition keeps its original delay; each subsequent sibling gets an extra
 * `STAGGER_MS` delay added on top of whatever per-transition delay already
 * existed (e.g. DON-attach token offsets within the batch).
 *
 * Pure helper — exported for unit tests.
 */
export function applyBatchStagger(batch: CardTransition[]): CardTransition[] {
  if (batch.length <= 1) return batch;
  return batch.map((t, i) => ({
    ...t,
    delay: (t.delay ?? 0) + (i * STAGGER_MS) / 1000,
  }));
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
      const produced = eventToTransitions(event, myIndex, zoneRegistry ?? null);
      for (const t of produced) newTransitions.push(t);
    }

    if (newTransitions.length === 0) return;

    // Stagger a batch of new arrivals (OPT-274). Each transition carries its
    // own delay — DON-attach delays are already assigned per-token inside
    // `eventToTransitions`; others stagger by their position in the batch so
    // multi-card draws fan out sequentially. The stagger rides on top of any
    // existing delay (e.g. DON-attach tokens inside a bigger batch).
    const staggered = applyBatchStagger(newTransitions);

    setTransitions((prev) => {
      const combined = [...prev, ...staggered];
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
