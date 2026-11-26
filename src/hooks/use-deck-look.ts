"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GameEvent } from "@shared/game-types";
import type { CardTransition } from "@/hooks/use-card-transitions";
import { boardZonePrefix } from "@/components/game/board-layout/board-geometry";
import {
  lookSlotZoneKey,
  lookZoneKeyPrefix,
  type DeckLook,
} from "@/lib/game/deck-look";
import { buildEventTimeline, eventOffsetMs } from "@/lib/game/event-timeline";

/** How long an answered look stays mounted for its departures to pick up
 *  their slots, when no flight references it yet. */
export const DECK_LOOK_CLOSE_GRACE_MS = 1200;

export interface DeckLookSlotView {
  index: number;
  zoneKey: string;
  cardId: string | null;
  /** The card is not in its slot right now: flying in, or gone. */
  hidden: boolean;
  /** Epoch ms when a revealed pick rises and shows its face. */
  revealAt?: number;
  /** The revealed pick's face, for a viewer who sees the fan face-down. */
  revealCardId?: string;
}

export interface DeckLookView {
  look: DeckLook;
  prefix: "p" | "o";
  slots: DeckLookSlotView[];
}

export interface DeckLookPresentation {
  looks: DeckLookView[];
  /** Cards out of each deck in a fan (resting or flying in), so the deck
   *  count drops while they are away. Keyed by deck zone key. */
  deckOutCounts: ReadonlyMap<string, number>;
}

const EMPTY_PRESENTATION: DeckLookPresentation = {
  looks: [],
  deckOutCounts: new Map(),
};

/**
 * OPT-1056: which look fans are on screen and which of their cards show.
 *
 * A slot is hidden while a flight into it is running, and from the moment a
 * flight out of it starts (its own delay), after which it stays hidden. A fan
 * shows while its selection is open, while any flight uses it, and for a
 * short grace after it is answered. Looks already answered on mount (history)
 * never show. Reduced motion shows no fan: the board swaps instantly.
 */
export function useDeckLook(
  looks: readonly DeckLook[],
  transitions: readonly CardTransition[],
  eventLog: readonly GameEvent[],
  bottomPlayerIndex: 0 | 1,
  reducedMotion: boolean,
): DeckLookPresentation {
  const [now, setNow] = useState(() => Date.now());
  /** Look id → epoch ms it was first seen answered. Looks answered before
   *  mount (history) start at -∞, so they never show. */
  const [closedAt, setClosedAt] = useState<ReadonlyMap<string, number>>(
    () =>
      new Map(
        looks
          .filter((look) => look.closed)
          .map((look) => [look.id, Number.NEGATIVE_INFINITY]),
      ),
  );
  /** Slot key → epoch ms its departing flight starts, kept after the
   *  flight ends so the slot stays empty. */
  const [departAtSeen, setDepartAtSeen] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  /** Slot key → epoch ms its reveal starts. */
  const [revealAt, setRevealAt] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const lastTimestampRef = useRef<number | null>(null);

  // Departures of the current flights. A flight still queued behind a
  // spotlight has not been scheduled yet.
  const departAt = useMemo(() => {
    const merged = new Map(departAtSeen);
    for (const transition of transitions) {
      if (transition.waitForSpotlightId !== undefined) continue;
      const key = transition.fromZoneKey;
      if (!key.includes("-look-") || merged.has(key)) continue;
      merged.set(key, transition.startedAt + (transition.delay ?? 0) * 1000);
    }
    return merged;
  }, [departAtSeen, transitions]);

  useEffect(() => {
    if (departAt.size === departAtSeen.size) return;
    // Remember departures past the end of their flights.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDepartAtSeen(departAt);
  }, [departAt, departAtSeen]);

  useLayoutEffect(() => {
    const newlyClosed = looks.filter(
      (look) => look.closed && !closedAt.has(look.id),
    );
    if (newlyClosed.length === 0) return;
    const stamp = Date.now();
    // Mirroring the websocket's event stream into transient fan state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClosedAt((current) => {
      const next = new Map(current);
      for (const look of newlyClosed) next.set(look.id, stamp);
      return next;
    });
    setNow(stamp);
  }, [looks, closedAt]);

  // Schedule reveals from the update that carries them, on their beat.
  useLayoutEffect(() => {
    const latest = eventLog.at(-1)?.timestamp ?? null;
    if (lastTimestampRef.current === null) {
      lastTimestampRef.current = latest ?? -1;
      return;
    }
    const since = lastTimestampRef.current;
    const newEvents = eventLog.filter((event) => event.timestamp > since);
    lastTimestampRef.current = latest ?? since;
    if (newEvents.length === 0 || reducedMotion) return;
    const timeline = buildEventTimeline(newEvents);
    const arrival = Date.now();
    const next = new Map<string, number>();
    for (const look of looks) {
      const prefix = boardZonePrefix(look.playerIndex, bottomPlayerIndex);
      for (const event of newEvents) {
        const reveal = look.reveals.get(event.timestamp);
        if (!reveal) continue;
        next.set(
          lookSlotZoneKey(prefix, look, reveal.slot),
          arrival + eventOffsetMs(timeline, event),
        );
      }
    }
    if (next.size === 0) return;
    // Mirroring the websocket's event stream into transient reveal timing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealAt((current) => new Map([...current, ...next]));
  }, [eventLog, looks, bottomPlayerIndex, reducedMotion]);

  const presentation = useMemo(() => {
    if (reducedMotion || looks.length === 0) return EMPTY_PRESENTATION;
    const views: DeckLookView[] = [];
    const deckOutCounts = new Map<string, number>();
    for (const look of looks) {
      const prefix = boardZonePrefix(look.playerIndex, bottomPlayerIndex);
      const keyPrefix = lookZoneKeyPrefix(prefix, look);
      const inUse = transitions.some(
        (t) =>
          t.fromZoneKey.startsWith(keyPrefix) ||
          t.toZoneKey.startsWith(keyPrefix),
      );
      // Answered in this render, before the close is stamped: still live.
      const closedSince = closedAt.get(look.id) ?? now;
      const live =
        !look.closed ||
        inUse ||
        now - closedSince < DECK_LOOK_CLOSE_GRACE_MS;
      if (!live) continue;
      let out = 0;
      const slots = look.cardIds.map((cardId, index) => {
        const zoneKey = lookSlotZoneKey(prefix, look, index);
        const arriving = transitions.some((t) => t.toZoneKey === zoneKey);
        const startsAt = departAt.get(zoneKey);
        const departed = startsAt !== undefined && now >= startsAt;
        if (!departed) out += 1;
        const reveal = [...look.reveals.values()].find((r) => r.slot === index);
        return {
          index,
          zoneKey,
          cardId,
          hidden: arriving || departed,
          revealAt: revealAt.get(zoneKey),
          revealCardId: reveal?.cardId,
        };
      });
      const deckKey = `${prefix}-deck`;
      deckOutCounts.set(deckKey, (deckOutCounts.get(deckKey) ?? 0) + out);
      views.push({ look, prefix, slots });
    }
    return { looks: views, deckOutCounts };
  }, [
    looks,
    transitions,
    bottomPlayerIndex,
    reducedMotion,
    now,
    revealAt,
    closedAt,
    departAt,
  ]);

  // Wake for the next departure start or grace end that changes the view.
  useEffect(() => {
    if (presentation.looks.length === 0) return;
    const current = Date.now();
    let nextAt = Number.POSITIVE_INFINITY;
    for (const view of presentation.looks) {
      for (const slot of view.slots) {
        const startsAt = departAt.get(slot.zoneKey);
        if (startsAt !== undefined && startsAt > now) {
          nextAt = Math.min(nextAt, startsAt);
        }
      }
      const closedSince = closedAt.get(view.look.id);
      if (closedSince !== undefined && Number.isFinite(closedSince)) {
        const graceEnd = closedSince + DECK_LOOK_CLOSE_GRACE_MS;
        if (graceEnd > now) nextAt = Math.min(nextAt, graceEnd);
      }
    }
    if (!Number.isFinite(nextAt)) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, nextAt - current) + 1,
    );
    return () => clearTimeout(timer);
  }, [presentation, closedAt, departAt, now]);

  return presentation;
}
