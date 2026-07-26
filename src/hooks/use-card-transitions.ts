"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardInstance, GameEvent } from "@shared/game-types";
import type { ZonePositionRegistry } from "@/contexts/zone-position-context";
import {
  findLatestSpotlight,
  spotlightCardZoneKey,
  type SpotlightCard,
  type SpotlightPresentation,
} from "@/lib/game/spotlight";
import { boardZonePrefix } from "@/components/game/board-layout/board-geometry";

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
  /** Transform dissolves at its source without a flight path. `don-attach`
   *  renders a DON token flying from the DON pool onto the destination card.
   *  An omitted kind is a standard travel transition. */
  kind?: "transform" | "don-attach";
  /** Flight start delay in seconds (OPT-274). Used to stagger multi-card
   *  draws (`~60ms` between arrivals) and multi-DON attachments so they
   *  fan out sequentially instead of landing in a single instant. */
  delay?: number;
  /** For `kind: "don-attach"`, the target character's instanceId (used by
   *  consumers to offset the displayed DON count until the token lands).
   *  Mirrors `instanceId` for character-flight kinds — split out so a
   *  DON-attach target is distinguishable from a target-zone card. */
  targetInstanceId?: string;
  /** Number of destination cards represented by this visual. Count-only
   *  transform events use one fizzle plus an aggregated pile receipt. */
  arrivalCount?: number;
  /** A transition sourced from the public spotlight waits until that
   *  spotlight yields, preserving its dwell and waiting-player contract. */
  waitForSpotlightId?: string;
  /** Spotlight cards can be preview- or modal-sized; the animation ghost
   *  must preserve that source footprint before it travels or dissolves. */
  spotlightSourceSize?: "modal" | "preview";
}

export type ReceivedHands = readonly [
  readonly CardInstance[],
  readonly CardInstance[],
];

export function receivedHandsByPlayerIndex(
  bottomHand: readonly CardInstance[],
  topHand: readonly CardInstance[],
  bottomPlayerIndex: 0 | 1,
): ReceivedHands {
  return bottomPlayerIndex === 0
    ? [bottomHand, topHand]
    : [topHand, bottomHand];
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

/** CARD_TRASHED `reason` values that originate from the life zone. The engine
 *  emits these without `from`, so the visual layer infers the source from the
 *  reason. Sandbox scenarios may set `from: "LIFE"` explicitly instead. */
const LIFE_TRASH_REASONS = new Set(["face_up_life", "life_trash"]);

let transitionCounter = 0;
function nextId() {
  return `ct-${++transitionCounter}`;
}

/** Map game event types to source/destination zone key patterns. Returns
 *  one or more transitions (multi-DON attachments produce `count` entries).
 *  Exported for unit testing. */
export function eventToTransitions(
  event: GameEvent,
  bottomPlayerIndex: 0 | 1,
  zoneRegistry: ZonePositionRegistry | null,
  spotlight: SpotlightPresentation | null = null,
  receivedHands?: ReceivedHands,
): CardTransition[] {
  const single = eventToTransition(
    event,
    bottomPlayerIndex,
    zoneRegistry,
    spotlight,
    receivedHands,
  );
  if (single) return [single];

  // DON_GIVEN_TO_CARD fans out into `count` staggered token flights.
  if (event.type === "DON_GIVEN_TO_CARD") {
    const { playerIndex } = event;
    const prefix = boardZonePrefix(playerIndex, bottomPlayerIndex);
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

  // LIFE_CARD_TO_DECK: face-down life cards travel to the bottom of the
  // owner's deck. Mirror the count-N expansion so it reads like a small
  // sequence rather than a single ghost.
  if (event.type === "LIFE_CARD_TO_DECK") {
    const { playerIndex } = event;
    const prefix = boardZonePrefix(playerIndex, bottomPlayerIndex);
    const count = Math.max(1, event.payload.count ?? 1);
    return makeFaceDownBurst(
      count,
      `${prefix}-life`,
      `${prefix}-deck`,
      playerIndex,
      "travel"
    );
  }

  // Count-only trash events do not expose individual cards. Represent the
  // batch with one face-down source fizzle and carry the full arrival count
  // to the destination pile receipt. Instance- or card-bearing events must
  // stay on the singular path above so they retain their real source zone.
  if (
    event.type === "CARD_TRASHED" &&
    !event.payload.cardId &&
    !event.payload.cardInstanceId &&
    !event.payload.newCardInstanceId
  ) {
    const { playerIndex } = event;
    const prefix = boardZonePrefix(playerIndex, bottomPlayerIndex);
    const count = Math.max(1, event.payload.count ?? 1);
    return makeFaceDownBurst(
      count,
      trashSourceZone(event.payload.from, event.payload.reason, prefix),
      `${prefix}-trash`,
      playerIndex,
      "transform"
    );
  }

  return [];
}

/** Helper for count-N face-down flights between two static zones. Each
 *  token gets its own per-token delay so the sequence fans out instead of
 *  landing in a single instant; a later `applyBatchStagger` may add more. */
function makeFaceDownBurst(
  count: number,
  fromZoneKey: string,
  toZoneKey: string,
  playerIndex: 0 | 1,
  kind: "travel" | "transform" = "travel"
): CardTransition[] {
  const startedAt = Date.now();
  if (kind === "transform") {
    return [
      {
        id: nextId(),
        cardId: null,
        instanceId: null,
        fromZoneKey,
        toZoneKey,
        playerIndex,
        startedAt,
        kind: "transform",
        arrivalCount: count,
      },
    ];
  }
  const out: CardTransition[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: nextId(),
      cardId: null,
      instanceId: null,
      fromZoneKey,
      toZoneKey,
      playerIndex,
      startedAt,
      delay: (i * STAGGER_MS) / 1000,
    });
  }
  return out;
}

function trashSourceZone(
  from: string | undefined,
  reason: string,
  prefix: "p" | "o"
): string {
  switch (from?.toUpperCase()) {
    case "HAND":
      return `${prefix}-hand`;
    case "LIFE":
      return `${prefix}-life`;
    case "DECK":
      return `${prefix}-deck`;
    case "STAGE":
      return `${prefix}-stage`;
    case "LEADER":
      return `${prefix}-leader`;
    case "CHARACTER":
      return `${prefix}-char-2`;
  }

  if (LIFE_TRASH_REASONS.has(reason)) return `${prefix}-life`;
  if (reason === "mill" || reason === "search_trash") {
    return `${prefix}-deck`;
  }
  // Legacy count-only cost/effect events predate the explicit `from` field;
  // those overwhelmingly originate in hand. New worker events set `from`.
  return `${prefix}-hand`;
}

function matchSpotlightCard(
  spotlight: SpotlightPresentation | null,
  playerIndex: 0 | 1,
  cardId: string | null,
  instanceId: string | null
): SpotlightCard | null {
  if (!spotlight || spotlight.playerIndex !== playerIndex) return null;

  if (instanceId) {
    const exact = spotlight.cards.find(
      (card) => card.instanceId === instanceId
    );
    if (exact) return exact;
  }

  if (!cardId) return null;
  const matchingIds = spotlight.cards.filter((card) => card.cardId === cardId);
  return matchingIds.length === 1 ? matchingIds[0] : null;
}

function eventToTransition(
  event: GameEvent,
  bottomPlayerIndex: 0 | 1,
  zoneRegistry: ZonePositionRegistry | null,
  spotlight: SpotlightPresentation | null,
  receivedHands?: ReceivedHands,
): CardTransition | null {
  const { type, playerIndex } = event;
  const prefix = boardZonePrefix(playerIndex, bottomPlayerIndex);

  let from: string | null = null;
  let to: string | null = null;
  let cardId: string | null = null;
  let cardInstanceId: string | null = null;
  let kind: CardTransition["kind"];

  switch (type) {
    case "CARD_PLAYED": {
      const p = event.payload;
      cardId = p.cardId;
      cardInstanceId = p.cardInstanceId;
      from = `${prefix}-hand`;
      if (p.zone === "STAGE") {
        to = `${prefix}-stage`;
      } else if (p.zone === "TRASH") {
        // Event plays publish EVENT_ACTIVATED_FROM_HAND immediately after
        // CARD_PLAYED. That public event owns the spotlight-linked transform;
        // handling both would duplicate the same trash arrival.
        return null;
      } else {
        const resolvedZone = cardInstanceId && zoneRegistry
          ? zoneRegistry.getCardZone(cardInstanceId)
          : null;
        to = resolvedZone ?? `${prefix}-char-2`;
      }
      break;
    }
    case "EVENT_ACTIVATED_FROM_HAND": {
      const p = event.payload;
      cardId = p.cardId ?? null;
      cardInstanceId = p.cardInstanceId;
      from = `${prefix}-hand`;
      to = `${prefix}-trash`;
      kind = "transform";
      break;
    }
    case "CARD_KO": {
      cardId = event.payload.cardId;
      const sourceInstanceId = event.payload.cardInstanceId;
      cardInstanceId = event.payload.newCardInstanceId ?? sourceInstanceId;
      const resolvedZone =
        sourceInstanceId && zoneRegistry
          ? zoneRegistry.getCardZone(sourceInstanceId)
          : null;
      from = resolvedZone ?? `${prefix}-char-2`;
      to = `${prefix}-trash`;
      kind = "transform";
      break;
    }
    case "CARD_TRASHED": {
      const p = event.payload;
      cardId = p.cardId ?? null;
      const sourceInstanceId = p.cardInstanceId ?? null;
      cardInstanceId = p.newCardInstanceId ?? sourceInstanceId;
      if (!cardId && !sourceInstanceId && !p.newCardInstanceId) return null;
      const resolvedZone =
        sourceInstanceId && zoneRegistry
          ? zoneRegistry.getCardZone(sourceInstanceId)
          : null;
      from = resolvedZone ?? trashSourceZone(p.from, p.reason, prefix);
      to = `${prefix}-trash`;
      kind = "transform";
      break;
    }
    case "COUNTER_USED": {
      const p = event.payload;
      if (p.type !== "event" || !p.cardId) return null;
      cardId = p.cardId;
      cardInstanceId = p.cardInstanceId ?? null;
      from = `${prefix}-hand`;
      to = `${prefix}-trash`;
      kind = "transform";
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
      const sourceInstanceId = p.cardInstanceId;
      cardInstanceId = p.newCardInstanceId ?? sourceInstanceId;
      if (p.source === "TRASH") {
        from = `${prefix}-trash`;
      } else {
        const resolvedZone =
          sourceInstanceId && zoneRegistry
            ? zoneRegistry.getCardZone(sourceInstanceId)
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
    case "CARD_RETURNED_TO_DECK": {
      const p = event.payload;
      cardId = p.cardId ?? null;
      const sourceInstanceId = p.cardInstanceId;
      cardInstanceId = p.newCardInstanceId ?? sourceInstanceId;
      const resolvedZone =
        sourceInstanceId && zoneRegistry
          ? zoneRegistry.getCardZone(sourceInstanceId)
          : null;
      from = resolvedZone ?? `${prefix}-char-2`;
      to = `${prefix}-deck`;
      break;
    }
    case "DON_PLACED_ON_FIELD": {
      // No flight — DON arrival is handled by `DonZone` via a `useFieldArrivals`
      // entry pop (no logical board source for DON tokens to fly from).
      return null;
    }
    default:
      return null;
  }

  if (!from || !to) return null;

  if (to.endsWith("-hand") && receivedHands) {
    const receivedHand = receivedHands[playerIndex];
    const receivedCard = cardInstanceId
      ? receivedHand.find((card) => card.instanceId === cardInstanceId)
      : receivedHand.length === 1
        ? receivedHand[0]
        : undefined;
    // The destination projection is the sole art authority. If it cannot
    // identify this transition unambiguously, render a face-down ghost rather
    // than trusting an event payload whose redaction may differ.
    cardId = receivedCard?.cardId ?? null;
  }

  const allowSpotlightCardIdFallback =
    type === "CARD_DRAWN" ||
    type === "CARD_RETURNED_TO_HAND" ||
    type === "CARD_ADDED_TO_HAND_FROM_LIFE" ||
    type === "CARD_RETURNED_TO_DECK";
  const spotlightCard =
    type === "CARD_KO"
      ? null
      : matchSpotlightCard(
          spotlight,
          playerIndex,
          cardId,
          allowSpotlightCardIdFallback ? null : cardInstanceId
        );
  if (spotlightCard) {
    from = spotlightCardZoneKey(spotlight!.id, spotlightCard);
  }

  return {
    id: nextId(),
    cardId,
    instanceId: cardInstanceId,
    fromZoneKey: from,
    toZoneKey: to,
    playerIndex,
    startedAt: Date.now(),
    kind,
    waitForSpotlightId: spotlightCard ? spotlight!.id : undefined,
    spotlightSourceSize: spotlightCard
      ? spotlight!.cards.length === 1
        ? "preview"
        : "modal"
      : undefined,
  };
}

/**
 * Apply a per-index stagger to a batch of transitions so multi-card arrivals
 * fan out sequentially instead of landing in a single instant. The first
 * travel transition keeps its original delay; each subsequent travel sibling
 * gets an extra `STAGGER_MS` delay. Transform siblings resolve together so a
 * simultaneous destruction does not become a misleading sequence.
 *
 * Pure helper — exported for unit tests.
 */
export function applyBatchStagger(batch: CardTransition[]): CardTransition[] {
  if (batch.length <= 1) return batch;
  let travelIndex = 0;
  return batch.map((t) => ({
    ...t,
    delay:
      t.kind === "transform"
        ? t.delay
        : (t.delay ?? 0) + (travelIndex++ * STAGGER_MS) / 1000,
  }));
}

export function useCardTransitions(
  eventLog: GameEvent[],
  bottomPlayerIndex: 0 | 1,
  isDragging: boolean,
  zoneRegistry?: ZonePositionRegistry | null,
  activeSpotlight: SpotlightPresentation | null = null,
  receivedHands?: ReceivedHands,
) {
  const [transitions, setTransitions] = useState<CardTransition[]>([]);
  // Track the highest timestamp we've processed. Using timestamps (instead of
  // array length) keeps dedup stable when the server sends a reconstructed
  // eventLog with the same length but different content.
  const lastTimestampRef = useRef<number | null>(null);
  const dragCooldownRef = useRef(false);
  const previousSpotlightIdRef = useRef<string | null>(null);

  // Spotlight-linked transitions remain queued throughout the dwell/waiting
  // state. Releasing the spotlight resets their expiry clock and makes them
  // eligible for the animation layer on the next render.
  useEffect(() => {
    const currentId = activeSpotlight?.id ?? null;
    const previousId = previousSpotlightIdRef.current;
    previousSpotlightIdRef.current = currentId;
    if (!previousId || previousId === currentId) return;

    queueMicrotask(() => {
      setTransitions((prev) =>
        prev.map((transition) => {
          if (transition.waitForSpotlightId !== previousId) return transition;
          const released = { ...transition };
          delete released.waitForSpotlightId;
          return { ...released, startedAt: Date.now() };
        })
      );
    });
  }, [activeSpotlight?.id]);

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
      lastTimestampRef.current = last ? last.timestamp : -1;
      return;
    }

    // Sandbox Reset intentionally rewinds the deterministic event sequence.
    // Reset the cursor with it so replayable motion scenarios still exercise
    // their first event instead of being mistaken for historic state.
    if (eventLog.length === 0) {
      lastTimestampRef.current = -1;
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

    const batchSpotlight = findLatestSpotlight(newEvents) ?? activeSpotlight;
    const newTransitions: CardTransition[] = [];
    for (const event of newEvents) {
      const produced = eventToTransitions(
        event,
        bottomPlayerIndex,
        zoneRegistry ?? null,
        batchSpotlight,
        receivedHands,
      );
      for (const transition of produced) {
        newTransitions.push(
          batchSpotlight &&
            transition.kind === "transform" &&
            transition.waitForSpotlightId === undefined
            ? {
                ...transition,
                waitForSpotlightId: batchSpotlight.id,
              }
            : transition
        );
      }
    }

    // A direct drag already supplies the travel visual, so suppress the
    // server-confirmed duplicate during the drag cooldown. Spotlight-owned
    // transforms are different: they must stay queued to reserve their pile
    // arrivals and play after the spotlight yields.
    const presentableTransitions =
      isDragging || dragCooldownRef.current
        ? newTransitions.filter(
            (transition) => transition.waitForSpotlightId !== undefined
          )
        : newTransitions;

    if (presentableTransitions.length === 0) return;

    // Stagger a batch of new arrivals (OPT-274). Each transition carries its
    // own delay — DON-attach delays are already assigned per-token inside
    // `eventToTransitions`; others stagger by their position in the batch so
    // multi-card draws fan out sequentially. The stagger rides on top of any
    // existing delay (e.g. DON-attach tokens inside a bigger batch).
    const staggered = applyBatchStagger(presentableTransitions);

    queueMicrotask(() => {
      setTransitions((prev) => {
        const combined = [...prev, ...staggered];
        return combined.slice(-MAX_CONCURRENT);
      });
    });
  }, [
    eventLog,
    bottomPlayerIndex,
    isDragging,
    zoneRegistry,
    activeSpotlight,
    receivedHands,
  ]);

  // Auto-expire old transitions
  useEffect(() => {
    if (transitions.length === 0) return;

    const timer = setTimeout(() => {
      const now = Date.now();
      setTransitions((prev) =>
        prev.filter(
          (t) =>
            t.waitForSpotlightId !== undefined ||
            now - t.startedAt < AUTO_EXPIRE_MS
        )
      );
    }, AUTO_EXPIRE_MS);

    return () => clearTimeout(timer);
  }, [transitions]);

  const removeTransition = useCallback((id: string) => {
    setTransitions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { transitions, removeTransition };
}
