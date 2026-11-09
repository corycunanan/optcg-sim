import type { GameEvent, GameEventType } from "@shared/game-types";
import { cardFizzle, cardTransitions } from "@/lib/motion";
import { eventToSpotlight } from "@/lib/game/spotlight";

/**
 * OPT-1040: board effect playback timeline.
 *
 * The worker resolves a whole action at once and sends one update holding the
 * final state plus that action's new event-log entries. Without a timeline the
 * client starts every flight, glow, and spotlight in the same instant, so a
 * play that triggers an On Play K.O. and a draw reads as one blur.
 *
 * `buildEventTimeline` splits one update's new events into ordered beats, one
 * visible effect step each, and gives every event a start offset. Each board
 * visual consumer (flights, glows, spotlight) adds its event's offset, so the
 * steps play one after another with a short pause between them.
 *
 * The function is pure and deterministic: every consumer that sees the same
 * batch of new events computes the same offsets without sharing state.
 */

/** Pause between the end of one beat's main motion and the next beat. */
export const BEAT_GAP_MS = 350;
/** Smallest gap a long chain may be compressed to. */
export const MIN_BEAT_GAP_MS = 120;
/** Spacing between sibling cards moving together (draw 2, DON!! x2). */
export const MULTI_CARD_STAGGER_MS = 120;
/** A single action's playback is compressed to stay near this length. */
export const MAX_PLAYBACK_MS = 4000;
/** How long a public card spotlight stays at board center. */
export const SPOTLIGHT_DWELL_MS = 1000;
/** Readable portion of a card glow. The next beat may start while the glow's
 *  tail is still fading out. */
export const PULSE_READ_MS = 400;

const FLIGHT_MS = Math.round(cardTransitions.zoneMove.duration * 1000);
const FIZZLE_MS = Math.round(cardFizzle.transition.duration * 1000);

/** Events that move a card between zones along a flight path. Siblings in the
 *  same beat fan out by `MULTI_CARD_STAGGER_MS`. */
const TRAVEL_EVENTS: ReadonlySet<GameEventType> = new Set<GameEventType>([
  "CARD_PLAYED",
  "CARD_DRAWN",
  "CARD_RETURNED_TO_HAND",
  "CARD_ADDED_TO_HAND_FROM_LIFE",
  "CARD_RETURNED_TO_DECK",
]);

/** Events that dissolve a card at its source. Siblings resolve together so a
 *  simultaneous K.O. does not read as a sequence. */
const TRANSFORM_EVENTS: ReadonlySet<GameEventType> = new Set<GameEventType>([
  "CARD_KO",
  "CARD_TRASHED",
]);

/** Events that only drive a short glow on a card or zone. */
const PULSE_EVENTS: ReadonlySet<GameEventType> = new Set<GameEventType>([
  "ATTACK_REDIRECTED",
  "COMBAT_VICTORY",
  "COUNTER_USED",
  "DAMAGE_DEALT",
  "EFFECTS_NEGATED",
  "LIFE_SCRIED",
  "POWER_MODIFIED",
  "TRIGGER_ACTIVATED",
]);

/** Events whose fan-out is internal (count tokens from one event). */
const COUNTED_TRAVEL_EVENTS: ReadonlySet<GameEventType> =
  new Set<GameEventType>(["DON_GIVEN_TO_CARD", "LIFE_CARD_TO_DECK"]);

export type BeatKind = "spotlight" | "travel" | "transform" | "pulse";

/**
 * What a board consumer sees for one event. `null` means the event has no
 * event-driven visual of its own: board state (rest, counts, phase) renders it,
 * so it must not hold the following steps back.
 */
export function classifyEventBeat(event: GameEvent): BeatKind | null {
  if (eventToSpotlight(event)) return "spotlight";
  if (event.type === "EVENT_ACTIVATED_FROM_HAND") return "transform";
  if (TRAVEL_EVENTS.has(event.type) || COUNTED_TRAVEL_EVENTS.has(event.type)) {
    return "travel";
  }
  if (TRANSFORM_EVENTS.has(event.type)) return "transform";
  if (PULSE_EVENTS.has(event.type)) return "pulse";
  return null;
}

function countedFanOut(event: GameEvent): number {
  if (event.type === "DON_GIVEN_TO_CARD" || event.type === "LIFE_CARD_TO_DECK") {
    return Math.max(1, event.payload.count ?? 1);
  }
  return 1;
}

function leadMsFor(kind: BeatKind): number {
  switch (kind) {
    case "spotlight":
      return SPOTLIGHT_DWELL_MS;
    case "travel":
      return FLIGHT_MS;
    case "transform":
      return FIZZLE_MS;
    case "pulse":
      return PULSE_READ_MS;
  }
}

interface Beat {
  kind: BeatKind;
  type: GameEventType;
  playerIndex: 0 | 1;
  /** Main-motion length, including any sibling stagger inside the beat. */
  leadMs: number;
  /** Per-event offset inside the beat, keyed by event timestamp. */
  members: Array<{ timestamp: number; innerOffsetMs: number }>;
  /** Next travel sibling's inner offset. */
  nextTravelOffsetMs: number;
}

export interface EventTimeline {
  /** Start offset in ms from the update's arrival, keyed by event timestamp.
   *  Every event in the batch has an entry. */
  offsets: ReadonlyMap<number, number>;
  /** When the last beat's main motion ends, in ms from arrival. Prompts and
   *  board input wait for this. */
  durationMs: number;
  /** Number of sequenced steps. */
  beatCount: number;
}

const EMPTY_TIMELINE: EventTimeline = {
  offsets: new Map(),
  durationMs: 0,
  beatCount: 0,
};

export interface BuildEventTimelineOptions {
  /** Reduced motion plays every step at once, as before OPT-1040. */
  reducedMotion?: boolean;
}

/**
 * Assign every event in one update batch a start offset. Consecutive events
 * of the same type for the same player share a beat (draw 2, a multi-K.O.);
 * events without their own visual inherit the current beat's offset.
 */
export function buildEventTimeline(
  events: readonly GameEvent[],
  options: BuildEventTimelineOptions = {}
): EventTimeline {
  if (events.length === 0) return EMPTY_TIMELINE;

  if (options.reducedMotion) {
    return {
      offsets: new Map(events.map((event) => [event.timestamp, 0])),
      durationMs: 0,
      beatCount: 0,
    };
  }

  const beats: Beat[] = [];
  // Silent events before the first beat start at 0; later ones ride along
  // with the beat they follow.
  const leading: number[] = [];

  for (const event of events) {
    const kind = classifyEventBeat(event);
    const current = beats.at(-1);

    if (kind === null) {
      if (current) {
        current.members.push({ timestamp: event.timestamp, innerOffsetMs: 0 });
      } else {
        leading.push(event.timestamp);
      }
      continue;
    }

    const fanOut = countedFanOut(event);
    const joinsCurrent =
      current !== undefined &&
      kind !== "spotlight" &&
      current.kind === kind &&
      current.type === event.type &&
      current.playerIndex === event.playerIndex;

    if (joinsCurrent) {
      const innerOffsetMs = kind === "travel" ? current.nextTravelOffsetMs : 0;
      current.members.push({ timestamp: event.timestamp, innerOffsetMs });
      if (kind === "travel") {
        current.nextTravelOffsetMs =
          innerOffsetMs + fanOut * MULTI_CARD_STAGGER_MS;
        current.leadMs = Math.max(
          current.leadMs,
          innerOffsetMs + (fanOut - 1) * MULTI_CARD_STAGGER_MS + FLIGHT_MS
        );
      }
      continue;
    }

    beats.push({
      kind,
      type: event.type,
      playerIndex: event.playerIndex,
      leadMs: leadMsFor(kind) + (fanOut - 1) * MULTI_CARD_STAGGER_MS,
      members: [{ timestamp: event.timestamp, innerOffsetMs: 0 }],
      nextTravelOffsetMs: fanOut * MULTI_CARD_STAGGER_MS,
    });
  }

  const totalLead = beats.reduce((sum, beat) => sum + beat.leadMs, 0);
  const gapCount = Math.max(0, beats.length - 1);
  let gapMs = BEAT_GAP_MS;
  if (gapCount > 0 && totalLead + gapCount * BEAT_GAP_MS > MAX_PLAYBACK_MS) {
    gapMs = Math.max(
      MIN_BEAT_GAP_MS,
      Math.floor((MAX_PLAYBACK_MS - totalLead) / gapCount)
    );
  }

  const offsets = new Map<number, number>();
  for (const timestamp of leading) offsets.set(timestamp, 0);

  let start = 0;
  let durationMs = 0;
  for (const beat of beats) {
    for (const member of beat.members) {
      offsets.set(member.timestamp, start + member.innerOffsetMs);
    }
    durationMs = start + beat.leadMs;
    start = durationMs + gapMs;
  }

  return { offsets, durationMs, beatCount: beats.length };
}

/** Offset for one event, 0 when the timeline does not list it. */
export function eventOffsetMs(
  timeline: EventTimeline,
  event: GameEvent
): number {
  return timeline.offsets.get(event.timestamp) ?? 0;
}
