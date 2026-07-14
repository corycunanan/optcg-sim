import type {
  GameEvent,
  GameEventType,
  GameState,
} from "../types.js";

/**
 * The authoritative checkpoint is the current GameState. Detailed event
 * history is retained for recent UI/replay diagnostics, while older events
 * are folded into a bounded summary at the persistence boundary.
 */
export const RECENT_EVENT_LOG_LIMIT = 256;
export const EVENT_LOG_ANCHOR_LIMIT = 128;
export const UNDO_HISTORY_LIMIT = 1;

const ANCHOR_EVENT_TYPES = new Set<GameEventType>([
  "CARD_PLAYED",
  "CARD_KO",
  "CARD_RETURNED_TO_HAND",
  "CARD_STATE_CHANGED",
]);

export interface EventHistorySummary {
  version: 1;
  compactedEventCount: number;
  firstCompactedTimestamp: number | null;
  lastCompactedTimestamp: number | null;
  byType: Partial<Record<GameEventType, number>>;
  byPlayer: [number, number];
}

export interface CompactedSessionHistory {
  state: GameState;
  undoHistory: GameState[];
  historySummary: EventHistorySummary;
  compactedEvents: GameEvent[];
}

export function emptyEventHistorySummary(): EventHistorySummary {
  return {
    version: 1,
    compactedEventCount: 0,
    firstCompactedTimestamp: null,
    lastCompactedTimestamp: null,
    byType: {},
    byPlayer: [0, 0],
  };
}

export function boundUndoHistory(
  undoHistory: readonly GameState[],
): GameState[] {
  return undoHistory.slice(-UNDO_HISTORY_LIMIT);
}

export function compactSessionHistory(
  state: GameState,
  undoHistory: readonly GameState[],
  previousSummary: EventHistorySummary,
): CompactedSessionHistory {
  const compacted = compactGameStateEventLog(state);
  const boundedUndo = boundUndoHistory(undoHistory).map(
    (snapshot) => compactGameStateEventLog(snapshot).state,
  );
  return {
    state: compacted.state,
    undoHistory: boundedUndo,
    historySummary: summarizeCompactedEvents(
      previousSummary,
      compacted.compactedEvents,
    ),
    compactedEvents: compacted.compactedEvents,
  };
}

export function compactGameStateEventLog(state: GameState): {
  state: GameState;
  compactedEvents: GameEvent[];
} {
  if (state.eventLog.length <= RECENT_EVENT_LOG_LIMIT) {
    return { state, compactedEvents: [] };
  }

  const recentStart = state.eventLog.length - RECENT_EVENT_LOG_LIMIT;
  const anchorIds = collectEventAnchorIds(state);
  const seenAnchorKeys = new Set<string>();
  for (let index = state.eventLog.length - 1; index >= recentStart; index--) {
    const key = eventAnchorKey(state.eventLog[index], anchorIds);
    if (key) seenAnchorKeys.add(key);
  }

  const retainedAnchorIndices: number[] = [];
  for (
    let index = recentStart - 1;
    index >= 0 && retainedAnchorIndices.length < EVENT_LOG_ANCHOR_LIMIT;
    index--
  ) {
    const key = eventAnchorKey(state.eventLog[index], anchorIds);
    if (!key || seenAnchorKeys.has(key)) continue;
    seenAnchorKeys.add(key);
    retainedAnchorIndices.push(index);
  }
  retainedAnchorIndices.reverse();

  const retainedIndices = new Set(retainedAnchorIndices);
  for (let index = recentStart; index < state.eventLog.length; index++) {
    retainedIndices.add(index);
  }

  const retained: GameEvent[] = [];
  const compactedEvents: GameEvent[] = [];
  state.eventLog.forEach((event, index) => {
    (retainedIndices.has(index) ? retained : compactedEvents).push(event);
  });

  return {
    state: { ...state, eventLog: retained },
    compactedEvents,
  };
}

export function summarizeCompactedEvents(
  previous: EventHistorySummary,
  events: readonly GameEvent[],
): EventHistorySummary {
  if (events.length === 0) {
    return {
      ...previous,
      byType: { ...previous.byType },
      byPlayer: [...previous.byPlayer],
    };
  }

  const byType = { ...previous.byType };
  const byPlayer: [number, number] = [...previous.byPlayer];
  let first = previous.firstCompactedTimestamp;
  let last = previous.lastCompactedTimestamp;
  for (const event of events) {
    byType[event.type] = (byType[event.type] ?? 0) + 1;
    byPlayer[event.playerIndex] += 1;
    first = first === null ? event.timestamp : Math.min(first, event.timestamp);
    last = last === null ? event.timestamp : Math.max(last, event.timestamp);
  }

  return {
    version: 1,
    compactedEventCount: previous.compactedEventCount + events.length,
    firstCompactedTimestamp: first,
    lastCompactedTimestamp: last,
    byType,
    byPlayer,
  };
}

function eventAnchorKey(
  event: GameEvent,
  anchorIds: ReadonlySet<string>,
): string | null {
  if (!ANCHOR_EVENT_TYPES.has(event.type)) return null;
  if (!("cardInstanceId" in event.payload)) return null;
  const instanceId = event.payload.cardInstanceId;
  if (typeof instanceId !== "string" || !anchorIds.has(instanceId)) return null;
  return `${event.type}:${instanceId}`;
}

function collectEventAnchorIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const player of state.players) {
    ids.add(player.leader.instanceId);
    for (const character of player.characters) {
      if (character) ids.add(character.instanceId);
    }
    if (player.stage) ids.add(player.stage.instanceId);
  }

  for (const frame of state.effectStack) {
    ids.add(frame.sourceCardInstanceId);
    for (const trigger of [
      ...frame.pendingTriggers,
      ...frame.simultaneousTriggers,
    ]) {
      ids.add(trigger.sourceCardInstanceId);
    }
  }
  addSourceInstanceId(ids, state.pendingPrompt?.resumeContext);
  addSourceInstanceId(ids, state.turn.pendingTriggerFromEffect);
  for (const collection of [
    state.activeEffects,
    state.prohibitions,
    state.scheduledActions,
    state.oneTimeModifiers,
    state.triggerRegistry,
  ]) {
    for (const value of collection) addSourceInstanceId(ids, value);
  }
  return ids;
}

function addSourceInstanceId(ids: Set<string>, value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  if (
    "effectSourceInstanceId" in value &&
    typeof value.effectSourceInstanceId === "string"
  ) {
    ids.add(value.effectSourceInstanceId);
  }
  if (
    "sourceCardInstanceId" in value &&
    typeof value.sourceCardInstanceId === "string"
  ) {
    ids.add(value.sourceCardInstanceId);
  }
}
