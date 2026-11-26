"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { GameEvent, PlayerState } from "@shared/game-types";
import type { ZonePositionRegistry } from "@/contexts/zone-position-context";
import { refreshStandUp } from "@/lib/motion";
import type { CardTransition } from "@/hooks/use-card-transitions";
import { boardZoneKey } from "@/components/game/board-layout/board-geometry";
import {
  buildEventTimeline,
  eventOffsetMs,
  isRefreshPhaseEnd,
} from "@/lib/game/event-timeline";
import {
  diffRefresh,
  planRefreshWave,
  standUpDelays,
  type RefreshReturnToken,
} from "@/lib/game/refresh-wave";

/** Players by player index. */
export type PlayersByIndex = readonly [PlayerState | null, PlayerState | null];

interface Wave {
  id: number;
  playerIndex: 0 | 1;
  returns: RefreshReturnToken[];
  /** Refreshed cards and DON!! still drawn rested. */
  held: ReadonlySet<string>;
  /** Every card and DON!! this wave stands up. */
  standingIds: readonly string[];
  /** Returning DON!! that have left their card. */
  departed: number;
  /** The stand-up has started. */
  standing: boolean;
  /** Some DON!! fly back, so the stand-up waits for them to land. */
  hadFlights: boolean;
}

/** If a returning DON!! never reports landing, stand up anyway this long
 *  after the planned start. */
const STAND_FALLBACK_MS = 400;

export interface RefreshWaveView {
  /** `don-return` flights, merged into the card animation layer. */
  transitions: CardTransition[];
  /** Removes a finished `don-return` flight. Returns false for other ids. */
  removeTransition: (id: string) => boolean;
  /** The players as the board should draw them while the wave plays. */
  display: (player: PlayerState | null) => PlayerState | null;
  /** DON!! badge holds: tokens still under each card. */
  donCountAdjustments: ReadonlyMap<string, number> | null;
  /** Returning DON!! whose token has not landed yet. */
  hiddenDonIds: ReadonlySet<string> | null;
  /** While the stand-up runs, every card and DON!! in it (value 0): their
   *  activate uses the short Refresh stand-up tween instead of the spring. */
  standDelays: ReadonlyMap<string, number> | null;
}

let waveCounter = 0;

function donSlotX(instanceId: string): number | null {
  if (typeof document === "undefined") return null;
  const node = document.querySelector(
    `[data-don-instance-id="${CSS.escape(instanceId)}"]`
  );
  const rect = node?.getBoundingClientRect();
  return rect && rect.width > 0 ? rect.left + rect.width / 2 : null;
}

/**
 * OPT-1058: replays the Refresh Phase on the board. When an update ends a
 * Refresh Phase, the board before that update says which DON!! were
 * attached and which cards were rested. The hook then:
 *
 * - flies each attached DON!! out from under its card to its cost-area slot
 *   (`don-return`), counting the card's badge down as each token leaves;
 * - keeps every refreshed card and DON!! drawn rested until the returns
 *   land; and
 * - then releases them one at a time, left to right by screen x.
 *
 * The wave starts on the REFRESH → DRAW event's beat in the update's
 * playback timeline. History present on mount and reduced motion play
 * nothing: the board shows the final state at once.
 */
export function useRefreshWave(
  eventLog: GameEvent[],
  players: PlayersByIndex,
  bottomPlayerIndex: 0 | 1,
  zoneRegistry: ZonePositionRegistry | null
): RefreshWaveView {
  const reducedMotion = useReducedMotion();
  const [wave, setWave] = useState<Wave | null>(null);
  const [transitions, setTransitions] = useState<CardTransition[]>([]);
  const previousPlayersRef = useRef<PlayersByIndex>(players);
  const lastTimestampRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startStandUpRef = useRef<(() => void) | null>(null);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
  }, []);

  useLayoutEffect(() => {
    const previousPlayers = previousPlayersRef.current;
    previousPlayersRef.current = players;

    const latest = eventLog.at(-1)?.timestamp ?? null;
    if (lastTimestampRef.current === null) {
      lastTimestampRef.current = latest ?? -1;
      return;
    }
    const since = lastTimestampRef.current;
    if (latest === null || latest <= since) {
      if (eventLog.length === 0) lastTimestampRef.current = -1;
      return;
    }
    lastTimestampRef.current = latest;
    const newEvents = eventLog.filter((event) => event.timestamp > since);
    const refreshEnd = newEvents.findLast(isRefreshPhaseEnd);
    if (!refreshEnd || reducedMotion) return;

    const playerIndex = refreshEnd.playerIndex;
    const before = previousPlayers[playerIndex];
    const after = players[playerIndex];
    if (!before || !after) return;
    const diff = diffRefresh(before, after);
    if (!diff) return;

    const offsetMs = eventOffsetMs(buildEventTimeline(newEvents), refreshEnd);
    const plan = planRefreshWave(diff.returns.length, diff.standing.length);
    const startedAt = Date.now();
    const waveId = ++waveCounter;
    const donZoneKey = boardZoneKey(playerIndex, bottomPlayerIndex, "don");

    const flights: CardTransition[] = [];
    diff.returns.forEach((token, i) => {
      const fromZoneKey = zoneRegistry?.getCardZone(token.cardInstanceId);
      if (!fromZoneKey) return;
      flights.push({
        id: `rw-${waveId}-${i}`,
        cardId: null,
        instanceId: token.donInstanceId,
        fromZoneKey,
        toZoneKey: donZoneKey,
        playerIndex,
        startedAt,
        kind: "don-return",
        delay: (offsetMs + plan.returnDelaysMs[i]) / 1000,
        targetInstanceId: token.cardInstanceId,
      });
    });

    clearTimers();
    const schedule = (atMs: number, run: () => void) => {
      timersRef.current.push(setTimeout(run, Math.max(0, atMs)));
    };
    const update = (change: (current: Wave) => Wave | null) =>
      setWave((current) => (current && current.id === waveId ? change(current) : current));

    plan.returnDelaysMs.forEach((delayMs, i) => {
      schedule(offsetMs + delayMs, () =>
        update((current) => ({ ...current, departed: Math.max(current.departed, i + 1) }))
      );
    });

    // Rested cards stand up one at a time, left to right. Releasing each
    // from the hold in turn (rather than all at once with motion delays)
    // keeps a DON!! in place until its turn: standing moves it from the
    // rested group to the active one.
    let standingStarted = false;
    const startStandUp = () => {
      if (standingStarted) return;
      standingStarted = true;
      const stageKey = boardZoneKey(playerIndex, bottomPlayerIndex, "stage");
      const xOf = (id: string): number | null => {
        if (after.stage?.instanceId === id) {
          const rect = zoneRegistry?.getRect(stageKey);
          return rect ? rect.left + rect.width / 2 : null;
        }
        const zoneKey = zoneRegistry?.getCardZone(id);
        const rect = zoneKey ? zoneRegistry?.getRect(zoneKey) : null;
        if (rect) return rect.left + rect.width / 2;
        return donSlotX(id);
      };
      const order = [...standUpDelays(diff.standing, xOf, plan.standStaggerMs)];
      const first = new Set(order.filter(([, delay]) => delay === 0).map(([id]) => id));
      update((current) => ({
        ...current,
        departed: current.returns.length,
        standing: true,
        held: new Set([...current.held].filter((id) => !first.has(id))),
      }));
      order.forEach(([id, delaySeconds]) => {
        if (first.has(id)) return;
        schedule(delaySeconds * 1000, () =>
          update((current) => {
            const held = new Set(current.held);
            held.delete(id);
            return { ...current, held };
          })
        );
      });
      const lastMs = order.length > 0 ? order[order.length - 1][1] * 1000 : 0;
      schedule(lastMs + refreshStandUp.transition.duration * 1000 + 100, () =>
        update(() => null)
      );
    };
    startStandUpRef.current = startStandUp;
    // With DON!! returning, the stand-up follows their landing (see the
    // effect below); this timer is only a fallback if a flight never ends.
    schedule(
      flights.length > 0 ? offsetMs + plan.standStartMs + STAND_FALLBACK_MS : offsetMs,
      startStandUp
    );

    // Mirroring the websocket's event stream into transient playback state.
    setWave({
      id: waveId,
      playerIndex,
      returns: diff.returns,
      held: new Set(diff.standing),
      standingIds: diff.standing,
      departed: 0,
      standing: false,
      hadFlights: flights.length > 0,
    });
    setTransitions(flights);
  }, [eventLog, players, bottomPlayerIndex, zoneRegistry, reducedMotion, clearTimers]);

  // The last returning DON!! has landed: stand up after a short beat.
  const allLanded =
    !!wave && wave.hadFlights && !wave.standing && transitions.length === 0;
  useEffect(() => {
    if (!allLanded) return;
    const timer = setTimeout(() => startStandUpRef.current?.(), refreshStandUp.gapMs);
    return () => clearTimeout(timer);
  }, [allLanded]);

  useEffect(() => clearTimers, [clearTimers]);

  const removeTransition = useCallback((id: string) => {
    if (!id.startsWith("rw-")) return false;
    setTransitions((current) => current.filter((transition) => transition.id !== id));
    return true;
  }, []);

  const display = useCallback(
    (player: PlayerState | null): PlayerState | null => {
      if (!player || !wave || wave.held.size === 0) return player;
      if (players[wave.playerIndex] !== player) return player;
      return holdRested(player, wave.held);
    },
    [players, wave]
  );

  let donCountAdjustments: Map<string, number> | null = null;
  if (wave) {
    wave.returns.forEach((token, i) => {
      if (i < wave.departed) return;
      donCountAdjustments ??= new Map();
      donCountAdjustments.set(
        token.cardInstanceId,
        (donCountAdjustments.get(token.cardInstanceId) ?? 0) + 1
      );
    });
  }

  const standDelays = useMemo(
    () => (wave?.standing ? new Map(wave.standingIds.map((id) => [id, 0])) : null),
    [wave?.standing, wave?.standingIds]
  );

  const hiddenDonIds =
    transitions.length > 0
      ? new Set(
          transitions.flatMap((transition) =>
            transition.instanceId ? [transition.instanceId] : []
          )
        )
      : null;

  return {
    transitions,
    removeTransition,
    display,
    donCountAdjustments,
    hiddenDonIds,
    standDelays,
  };
}

/** The player with `held` cards and DON!! drawn rested. */
export function holdRested(
  player: PlayerState,
  held: ReadonlySet<string>
): PlayerState {
  const rest = <T extends { instanceId: string; state: string }>(item: T): T =>
    held.has(item.instanceId) && item.state !== "RESTED"
      ? { ...item, state: "RESTED" }
      : item;
  return {
    ...player,
    leader: rest(player.leader),
    characters: player.characters.map((card) => (card ? rest(card) : card)),
    stage: player.stage ? rest(player.stage) : player.stage,
    donCostArea: player.donCostArea.map(rest),
  };
}
