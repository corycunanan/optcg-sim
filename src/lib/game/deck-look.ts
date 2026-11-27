import type { GameEvent, GameEventType } from "@shared/game-types";

/**
 * OPT-1056: "look at the top N cards" on the board.
 *
 * The worker emits `DECK_TOP_LOOKED` when the selection opens. The looked-at
 * cards leave the deck and fan out at board center: face-up for the player
 * looking, face-down for everyone else. When the selection is answered, each
 * card leaves the fan for where it went: a pick to hand (`CARD_DRAWN` source
 * "search"), to the field (`CARD_PLAYED` source "search_and_play") or to the
 * trash (`CARD_TRASHED` reason "search_trash"); the rest back to the deck
 * (`CARDS_PLACED_IN_DECK`). A pick revealed to both players
 * (`CARDS_REVEALED` source "search") rises in the fan and shows its face
 * before it leaves.
 *
 * This module is pure: it reads the event log and says which fan slot every
 * departing event leaves from. `use-card-transitions` turns that into flights
 * and `use-deck-look` into the fan on screen.
 */

/** A face the viewer cannot see. */
const HIDDEN = "hidden";

export interface DeckLook {
  /** Stable id: the look event's player and timestamp. */
  id: string;
  playerIndex: 0 | 1;
  /** The `DECK_TOP_LOOKED` event's timestamp. */
  timestamp: number;
  /** Card ids top first; null where the viewer sees only the back. */
  cardIds: (string | null)[];
  /** True when the viewer sees the fan face-down (not their look). */
  faceDown: boolean;
  /** A later event exists: the selection was answered. */
  closed: boolean;
  /** Slot indexes each departing event leaves from, keyed by event timestamp. */
  departures: ReadonlyMap<number, readonly number[]>;
  /** A pick revealed to both players, keyed by the reveal event's timestamp. */
  reveals: ReadonlyMap<number, { slot: number; cardId: string }>;
  /** Slots that leave as a pick (to hand or field). The rest of the fan
   *  closes up behind them. */
  picks: ReadonlySet<number>;
  /** Slots placed back in the deck. */
  returns: ReadonlySet<number>;
}

/** How long the fan takes to close up behind a pick, in ms. It finishes
 *  well inside the pick's beat, before the rest move. */
export const LOOK_REFLOW_MS = 320;
/** Rest cards going back to the deck wait this long after their event's
 *  beat: the looking player's face-up cards first turn face-down where
 *  they lie (one shared flip). */
export function lookReturnLeadMs(faceDown: boolean, flipMs: number): number {
  return faceDown ? 0 : flipMs + 40;
}

/** Zone-registry key of one card in a look's fan. */
export function lookSlotZoneKey(
  prefix: "p" | "o",
  look: Pick<DeckLook, "timestamp">,
  index: number,
): string {
  return `${prefix}-look-${look.timestamp}-${index}`;
}

/** True for a fan slot key from `lookSlotZoneKey`. */
export function isLookSlotZoneKey(zoneKey: string): boolean {
  return /^[po]-look-/.test(zoneKey);
}

/** The prefix of every slot key of one look, for matching transitions. */
export function lookZoneKeyPrefix(
  prefix: "p" | "o",
  look: Pick<DeckLook, "timestamp">,
): string {
  return `${prefix}-look-${look.timestamp}-`;
}

/** Events that may follow a look while its selection resolves. Anything else
 *  ends the window, so a later, unrelated draw never leaves from the fan. */
const RESOLUTION_WINDOW: ReadonlySet<GameEventType> = new Set<GameEventType>([
  "CARDS_REVEALED",
  "CARD_DRAWN",
  "CARD_PLAYED",
  "CARD_TRASHED",
  "CARDS_PLACED_IN_DECK",
  "PROMPT_AUTO_RESOLVED",
]);

/** Only looks this close to the end of the log can still be on screen. */
const RECENT_EVENT_WINDOW = 64;

function visibleId(cardId: string | undefined | null): string | null {
  return cardId && cardId !== HIDDEN ? cardId : null;
}

/** The event's own pick or trashed card, when it leaves the fan singly. */
function singleDepartureCardId(event: GameEvent): string | null | undefined {
  switch (event.type) {
    case "CARD_DRAWN":
      return event.payload.source === "search"
        ? visibleId(event.payload.cardId)
        : undefined;
    case "CARD_PLAYED":
      return event.payload.source === "search_and_play"
        ? visibleId(event.payload.cardId)
        : undefined;
    case "CARD_TRASHED":
      return event.payload.reason === "search_trash"
        ? visibleId(event.payload.cardId)
        : undefined;
    default:
      return undefined;
  }
}

function buildLook(
  events: readonly GameEvent[],
  index: number,
): DeckLook | null {
  const lookEvent = events[index];
  if (lookEvent.type !== "DECK_TOP_LOOKED") return null;
  const { playerIndex, timestamp } = lookEvent;
  const count = Math.max(lookEvent.payload.count, lookEvent.payload.cards.length);
  if (count <= 0) return null;
  const cards = lookEvent.payload.cards;
  const cardIds = Array.from({ length: count }, (_, i) => visibleId(cards[i]?.cardId));
  const instanceIds = Array.from({ length: count }, (_, i) =>
    cards[i]?.instanceId && cards[i].instanceId !== HIDDEN ? cards[i].instanceId : null,
  );
  const faceDown = cardIds.every((cardId) => cardId === null);

  const free = new Set<number>(cardIds.map((_, i) => i));
  /** Slots a reveal marked as picks, waiting for their move event. */
  const revealed: Array<{ slot: number; cardId: string }> = [];
  const departures = new Map<number, number[]>();
  const reveals = new Map<number, { slot: number; cardId: string }>();
  const picks = new Set<number>();
  const returns = new Set<number>();

  const freeList = () => [...free].sort((a, b) => a - b);
  // Where the viewer cannot tell which card it was, the middle card goes.
  const middleFree = () => {
    const list = freeList();
    return list[Math.floor((list.length - 1) / 2)];
  };
  const byCardId = (cardId: string | null) =>
    cardId === null
      ? undefined
      : freeList().find((slot) => cardIds[slot] === cardId);
  const take = (slot: number) => {
    free.delete(slot);
    return slot;
  };

  for (let i = index + 1; i < events.length && free.size > 0; i += 1) {
    const event = events[i];
    if (!RESOLUTION_WINDOW.has(event.type)) break;
    if (event.playerIndex !== playerIndex) continue;

    if (event.type === "CARDS_REVEALED") {
      if (event.payload.source !== "search") continue;
      for (const card of event.payload.cards) {
        const cardId = visibleId(card.cardId);
        if (!cardId) continue;
        const reserved = new Set(revealed.map((entry) => entry.slot));
        const candidates = freeList().filter((slot) => !reserved.has(slot));
        if (candidates.length === 0) break;
        const slot =
          candidates.find((s) => instanceIds[s] === card.instanceId) ??
          candidates.find((s) => cardIds[s] === cardId) ??
          candidates[Math.floor((candidates.length - 1) / 2)];
        revealed.push({ slot, cardId });
        if (event.payload.visibility === "BOTH" && !reveals.has(event.timestamp)) {
          reveals.set(event.timestamp, { slot, cardId });
        }
      }
      continue;
    }

    if (event.type === "CARDS_PLACED_IN_DECK") {
      const reserved = new Set(revealed.map((entry) => entry.slot));
      const order = [
        ...freeList().filter((slot) => !reserved.has(slot)),
        ...freeList().filter((slot) => reserved.has(slot)),
      ];
      const slots = order.slice(0, Math.max(0, event.payload.count)).map(take);
      for (const slot of slots) returns.add(slot);
      if (slots.length > 0) departures.set(event.timestamp, slots);
      continue;
    }

    const cardId = singleDepartureCardId(event);
    if (cardId === undefined) continue;
    const revealedAt = revealed.findIndex(
      (entry) => free.has(entry.slot) && (cardId === null || entry.cardId === cardId),
    );
    // A rest card the effect trashes is not a pick: prefer unrevealed cards.
    const isRestTrash =
      event.type === "CARD_TRASHED" && revealedAt === -1;
    let slot: number | undefined;
    if (revealedAt !== -1) {
      slot = revealed[revealedAt].slot;
      revealed.splice(revealedAt, 1);
    } else {
      const reserved = new Set(revealed.map((entry) => entry.slot));
      const open = freeList().filter((s) => !reserved.has(s));
      slot =
        byCardId(cardId) ??
        (isRestTrash ? open[0] : open[Math.floor((open.length - 1) / 2)]) ??
        middleFree();
    }
    if (slot === undefined) continue;
    if (!isRestTrash) picks.add(slot);
    departures.set(event.timestamp, [take(slot)]);
  }

  return {
    id: `${playerIndex}-${timestamp}`,
    playerIndex,
    timestamp,
    cardIds,
    faceDown,
    closed: index < events.length - 1,
    departures,
    reveals,
    picks,
    returns,
  };
}

/** Every recent look in the event log, oldest first. */
export function collectDeckLooks(eventLog: readonly GameEvent[]): DeckLook[] {
  const looks: DeckLook[] = [];
  const start = Math.max(0, eventLog.length - RECENT_EVENT_WINDOW);
  for (let i = start; i < eventLog.length; i += 1) {
    if (eventLog[i].type !== "DECK_TOP_LOOKED") continue;
    const look = buildLook(eventLog, i);
    if (look) looks.push(look);
  }
  return looks;
}

export interface DeckLookSource {
  look: DeckLook;
  slots: readonly number[];
}

/** Lookup from an event's timestamp to the look it arrives in (the look
 *  event itself) or leaves from (a departing event). */
export interface DeckLookIndex {
  arrivals: ReadonlyMap<number, DeckLook>;
  departures: ReadonlyMap<number, DeckLookSource>;
}

export const EMPTY_DECK_LOOK_INDEX: DeckLookIndex = {
  arrivals: new Map(),
  departures: new Map(),
};

export function indexDeckLooks(looks: readonly DeckLook[]): DeckLookIndex {
  if (looks.length === 0) return EMPTY_DECK_LOOK_INDEX;
  const arrivals = new Map<number, DeckLook>();
  const departures = new Map<number, DeckLookSource>();
  for (const look of looks) {
    arrivals.set(look.timestamp, look);
    for (const [timestamp, slots] of look.departures) {
      departures.set(timestamp, { look, slots });
    }
  }
  return { arrivals, departures };
}

/** Fan layout in design px, relative to the fan's center. The looking
 *  player's own cards lie in a flat row; a fan the viewer sees face-down
 *  spreads like a hand, arcing away from its owner's side of the board. */
export interface FanSlotPose {
  x: number;
  y: number;
  rotate: number;
}

export function fanSlotPoses(
  count: number,
  options: {
    faceDown: boolean;
    /** The look belongs to the top (opponent's) side of the board. */
    top: boolean;
    cardWidth: number;
    maxWidth: number;
  },
): FanSlotPose[] {
  if (count <= 0) return [];
  const { faceDown, top, cardWidth, maxWidth } = options;
  const gap = faceDown ? cardWidth * 0.58 : cardWidth + 16;
  const step = count > 1 ? Math.min(gap, (maxWidth - cardWidth) / (count - 1)) : 0;
  const mid = (count - 1) / 2;
  const side = top ? -1 : 1;
  return Array.from({ length: count }, (_, i) => {
    const offset = i - mid;
    return {
      x: offset * step,
      y: faceDown ? side * offset * offset * 4 : 0,
      rotate: faceDown ? side * offset * 5 : 0,
    };
  });
}
