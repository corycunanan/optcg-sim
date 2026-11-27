"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GameEvent } from "@shared/game-types";
import type { CardTransition } from "@/hooks/use-card-transitions";
import { boardZonePrefix } from "@/components/game/board-layout/board-geometry";
import { FLIP_SECONDS } from "@/lib/game/card-motion";
import {
  lookSlotZoneKey,
  lookZoneKeyPrefix,
  type DeckLook,
} from "@/lib/game/deck-look";
import { buildEventTimeline, eventOffsetMs } from "@/lib/game/event-timeline";

/** How long an answered look stays mounted for its departures to pick up
 *  their slots, when no flight references it yet. */
export const DECK_LOOK_CLOSE_GRACE_MS = 1200;

/** How long a newly opened look's slots wait for their deal flights before
 *  showing their cards anyway. */
export const DECK_LOOK_DEAL_FALLBACK_MS = 1500;

/** Gap between the looking player's cards turning face-up, left to right,
 *  once the whole row is in place. */
export const DECK_LOOK_FACE_UP_STAGGER_MS = 60;

/** A card going back to the deck turns face-down this long before its
 *  flight starts: one shared flip, plus a beat at rest. */
const RETURN_FLIP_LEAD_MS = FLIP_SECONDS * 1000 + 40;

/** A slot whose flight never reported its start counts as gone this long
 *  after its scheduled start. */
const DEPARTURE_FALLBACK_MS = 400;

export interface DeckLookSlotView {
  index: number;
  zoneKey: string;
  cardId: string | null;
  /** The card is not in its slot right now: flying in, or gone. */
  hidden: boolean;
  /** The slot left as a pick: the rest of the fan closes up without it. */
  collapsed: boolean;
  /** The card shows its back (before the row turns up, or on its way back
   *  to the deck). A revealed pick overrides this while it rises. */
  faceDown: boolean;
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
  /** The flight layer reports a card leaving its slot; the slot hides in
   *  the same frame the flight appears. Stable across renders. */
  markDeparted: (zoneKey: string) => void;
}

const EMPTY_LOOKS: DeckLookView[] = [];
const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map();

function withoutKeys<K, V>(map: ReadonlyMap<K, V>, keep: (key: K) => boolean) {
  const next = new Map([...map].filter(([key]) => keep(key)));
  return next.size === map.size ? map : next;
}

function withoutItems<T>(set: ReadonlySet<T>, keep: (item: T) => boolean) {
  const next = new Set([...set].filter(keep));
  return next.size === set.size ? set : next;
}

/**
 * OPT-1056: which look fans are on screen and how each of their cards shows.
 *
 * Every card deals in face-down. Once the looking player's row is in place
 * it turns face-up, left to right. A pick leaves and the fan closes up
 * behind it; the rest turn face-down where they lie and go back to the
 * deck. A slot is hidden while a flight into it runs, and from the frame
 * its flight out appears. A fan shows while its selection is open, while
 * any flight uses it, and for a short grace after it is answered. Looks
 * already answered on mount (history) never show; one open on mount shows
 * at rest. Reduced motion shows no fan: the board swaps instantly.
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
  /** Looks on screen at mount: their cards already rest in the fan. */
  const [mountedLookIds] = useState<ReadonlySet<string>>(
    () => new Set(looks.map((look) => look.id)),
  );
  /** Look id → epoch ms it was first seen open (looks opened after mount). */
  const [openedAt, setOpenedAt] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  /** Slot keys whose deal flight has been seen. Until then a freshly opened
   *  look's slot stays hidden: the flights are scheduled after the render
   *  that first shows the look, and no card may flash before it flies in. */
  const [dealtSeen, setDealtSeen] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Look id → epoch ms its whole row came to rest. */
  const [settledAt, setSettledAt] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  /** Slot key → epoch ms its departing flight is scheduled to start, kept
   *  after the flight ends. */
  const [departAtSeen, setDepartAtSeen] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  /** Slot keys whose departing flight has appeared. */
  const [departed, setDeparted] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Slot key → epoch ms its reveal starts. */
  const [revealAt, setRevealAt] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const lastTimestampRef = useRef<number | null>(null);

  const markDeparted = useCallback((zoneKey: string) => {
    setDeparted((current) =>
      current.has(zoneKey) ? current : new Set([...current, zoneKey]),
    );
  }, []);

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
    const dealt = transitions
      .map((t) => t.toZoneKey)
      .filter((key) => key.includes("-look-") && !dealtSeen.has(key));
    if (dealt.length === 0) return;
    // Mirroring the flight queue: a slot shows once its deal has started.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDealtSeen((current) => new Set([...current, ...dealt]));
  }, [transitions, dealtSeen]);

  // Track looks opening, and forget looks gone from the log (a sandbox
  // Reset replays the same looks, which must deal again).
  useLayoutEffect(() => {
    const fresh = looks.filter(
      (look) => !mountedLookIds.has(look.id) && !openedAt.has(look.id),
    );
    const present = new Set(looks.map((look) => look.id));
    const gone = [...openedAt.keys()].some((id) => !present.has(id));
    if (fresh.length === 0 && !gone) return;
    const stamp = Date.now();
    // Mirroring the websocket's event stream into transient fan state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenedAt((current) => {
      const next = new Map(withoutKeys(current, (id) => present.has(id)));
      for (const look of fresh) next.set(look.id, stamp);
      return next;
    });
    if (gone) {
      const prefixes = looks.map((look) =>
        lookZoneKeyPrefix(
          boardZonePrefix(look.playerIndex, bottomPlayerIndex),
          look,
        ),
      );
      const keepKey = (key: string) =>
        prefixes.some((prefix) => key.startsWith(prefix));
      const keepId = (id: string) => present.has(id);
      setDealtSeen((current) => withoutItems(current, keepKey));
      setDeparted((current) => withoutItems(current, keepKey));
      setDepartAtSeen((current) => withoutKeys(current, keepKey));
      setRevealAt((current) => withoutKeys(current, keepKey));
      setSettledAt((current) => withoutKeys(current, keepId));
      setClosedAt((current) => withoutKeys(current, keepId));
    }
    setNow(stamp);
  }, [looks, mountedLookIds, openedAt, bottomPlayerIndex]);

  // A freshly dealt row comes to rest once every card has landed.
  useLayoutEffect(() => {
    const stamp = Date.now();
    const settled: string[] = [];
    for (const look of looks) {
      if (look.faceDown || mountedLookIds.has(look.id)) continue;
      if (settledAt.has(look.id)) continue;
      const opened = openedAt.get(look.id);
      if (opened === undefined) continue;
      const prefix = boardZonePrefix(look.playerIndex, bottomPlayerIndex);
      const keyPrefix = lookZoneKeyPrefix(prefix, look);
      const allDealt = look.cardIds.every((_, index) =>
        dealtSeen.has(lookSlotZoneKey(prefix, look, index)),
      );
      const landing = transitions.some((t) =>
        t.toZoneKey.startsWith(keyPrefix),
      );
      const timedOut = now - opened >= DECK_LOOK_DEAL_FALLBACK_MS;
      if ((allDealt && !landing) || timedOut) settled.push(look.id);
    }
    if (settled.length === 0) return;
    // Mirroring the flight queue: the row turns face-up once it is all in.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettledAt((current) => {
      const next = new Map(current);
      for (const id of settled) next.set(id, stamp);
      return next;
    });
    setNow(stamp);
  }, [
    looks,
    transitions,
    dealtSeen,
    openedAt,
    settledAt,
    mountedLookIds,
    bottomPlayerIndex,
    now,
  ]);

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

  const views = useMemo(() => {
    if (reducedMotion || looks.length === 0) {
      return { looks: EMPTY_LOOKS, deckOutCounts: EMPTY_COUNTS };
    }
    const result: DeckLookView[] = [];
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
      // A card whose move the update already carries has left the deck in
      // the board state (or its flight back is counted as an arrival).
      const leaving = new Set([...look.departures.values()].flat());
      const atMount = mountedLookIds.has(look.id);
      // A look opened after mount waits for its deal flights. If a flight
      // never comes (dropped by the concurrency cap), the card shows anyway.
      const opened = openedAt.get(look.id) ?? now;
      const awaitsDeal =
        !atMount && now - opened < DECK_LOOK_DEAL_FALLBACK_MS;
      const settled = settledAt.get(look.id);
      const slots = look.cardIds.map((cardId, index): DeckLookSlotView => {
        const zoneKey = lookSlotZoneKey(prefix, look, index);
        const arriving =
          transitions.some((t) => t.toZoneKey === zoneKey) ||
          (awaitsDeal && !dealtSeen.has(zoneKey));
        const startsAt = departAt.get(zoneKey);
        const flying = transitions.some((t) => t.fromZoneKey === zoneKey);
        const gone =
          departed.has(zoneKey) ||
          (startsAt !== undefined &&
            !flying &&
            now >= startsAt + DEPARTURE_FALLBACK_MS);
        // Out of the deck: resting in the fan or flying in, and not yet
        // counted by the board state or a flight back. A card still waiting
        // for its deal flight stays in the deck until the flight appears.
        const waitingForDeal = awaitsDeal && !dealtSeen.has(zoneKey);
        const stillAway = !leaving.has(index) || (look.returns.has(index) && !flying);
        if (!gone && !waitingForDeal && stillAway) out += 1;
        const faceUpAt = atMount
          ? Number.NEGATIVE_INFINITY
          : settled === undefined
            ? Number.POSITIVE_INFINITY
            : settled + index * DECK_LOOK_FACE_UP_STAGGER_MS;
        const returning =
          look.returns.has(index) &&
          startsAt !== undefined &&
          now >= startsAt - RETURN_FLIP_LEAD_MS;
        const faceDown = look.faceDown || now < faceUpAt || returning;
        const reveal = [...look.reveals.values()].find((r) => r.slot === index);
        return {
          index,
          zoneKey,
          cardId,
          hidden: arriving || gone,
          collapsed: gone && look.picks.has(index),
          faceDown,
          revealAt: revealAt.get(zoneKey),
          revealCardId: reveal?.cardId,
        };
      });
      const deckKey = `${prefix}-deck`;
      deckOutCounts.set(deckKey, (deckOutCounts.get(deckKey) ?? 0) + out);
      result.push({ look, prefix, slots });
    }
    return { looks: result, deckOutCounts };
  }, [
    looks,
    transitions,
    bottomPlayerIndex,
    reducedMotion,
    now,
    revealAt,
    closedAt,
    departAt,
    departed,
    mountedLookIds,
    openedAt,
    dealtSeen,
    settledAt,
  ]);

  // Wake for the next moment that changes the view: a card turning over, a
  // departure's fallback, a deal's fallback or a grace end.
  useEffect(() => {
    if (views.looks.length === 0) return;
    const current = Date.now();
    let nextAt = Number.POSITIVE_INFINITY;
    const consider = (at: number) => {
      if (at > now) nextAt = Math.min(nextAt, at);
    };
    for (const view of views.looks) {
      const settled = settledAt.get(view.look.id);
      for (const slot of view.slots) {
        const startsAt = departAt.get(slot.zoneKey);
        if (startsAt !== undefined) {
          consider(startsAt - RETURN_FLIP_LEAD_MS);
          consider(startsAt + DEPARTURE_FALLBACK_MS);
        }
        if (settled !== undefined) {
          consider(settled + slot.index * DECK_LOOK_FACE_UP_STAGGER_MS);
        }
      }
      const opened = openedAt.get(view.look.id);
      if (opened !== undefined && !mountedLookIds.has(view.look.id)) {
        consider(opened + DECK_LOOK_DEAL_FALLBACK_MS);
      }
      const closedSince = closedAt.get(view.look.id);
      if (closedSince !== undefined && Number.isFinite(closedSince)) {
        consider(closedSince + DECK_LOOK_CLOSE_GRACE_MS);
      }
    }
    if (!Number.isFinite(nextAt)) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, nextAt - current) + 1,
    );
    return () => clearTimeout(timer);
  }, [views, closedAt, departAt, now, openedAt, mountedLookIds, settledAt]);

  return useMemo(
    () => ({ ...views, markDeparted }),
    [views, markDeparted],
  );
}
