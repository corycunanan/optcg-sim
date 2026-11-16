"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  damagedPlayerOf,
  type CardDb,
  type GameEvent,
} from "@shared/game-types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { EffectInline } from "@/components/cards/effect-text";
import { CardTooltip } from "./use-card-tooltip";

/** One run of an event-log line. Text runs may carry printed notation
 *  (`[Trigger]`, `[Counter]`, `[Blocker]`), which renders as the same inline
 *  chips the card inspection modal uses. Card runs name a card and open its
 *  inspection tooltip on hover. */
export type EventLogPart =
  | { kind: "text"; text: string }
  | { kind: "card"; cardId: string; name: string };

export interface FormattedEvent {
  /** Plain-text reading of the line (card names and notation inline). */
  text: string;
  parts: EventLogPart[];
  accent?: string;
}

/** Resolves an instance id to its card id from the current visible state. */
export type InstanceCardLookup = (instanceId: string) => string | undefined;

type CardRef = { cardId: string };

function line(
  items: Array<string | CardRef>,
  cardDb: CardDb,
  accent?: string,
): FormattedEvent {
  const parts: EventLogPart[] = items.map((item) =>
    typeof item === "string"
      ? { kind: "text", text: item }
      : {
          kind: "card",
          cardId: item.cardId,
          name: cardDb[item.cardId]?.name ?? item.cardId,
        },
  );
  const text = parts
    .map((part) => (part.kind === "text" ? part.text : part.name))
    .join("");
  return accent ? { text, parts, accent } : { text, parts };
}

/** Human-readable line for a game event, or `null` when it is not logged. */
export function formatEvent(
  event: GameEvent,
  cardDb: CardDb,
  myIndex: 0 | 1 | null,
  lookupInstance: InstanceCardLookup = () => undefined,
): FormattedEvent | null {
  const who = event.playerIndex === myIndex ? "You" : "Opponent";
  const card = (id?: unknown): CardRef | string =>
    typeof id === "string" && id ? { cardId: id } : "a card";
  const instance = (instanceId?: unknown): CardRef | null => {
    if (typeof instanceId !== "string") return null;
    const cardId = lookupInstance(instanceId);
    return cardId ? { cardId } : null;
  };
  const out = (items: Array<string | CardRef>, accent?: string) =>
    line(items, cardDb, accent);

  switch (event.type) {
    case "CARD_PLAYED": {
      if (event.payload.zone === "TRASH") {
        return out(
          [`${who} played event `, card(event.payload.cardId)],
          "text-gb-accent-purple",
        );
      }
      return out([`${who} played `, card(event.payload.cardId)]);
    }
    case "CARD_DRAWN":
      return out([`${who} drew a card`]);
    case "CARD_KO":
      return out(
        [card(event.payload.cardId), " was K.O.'d"],
        "text-gb-accent-red",
      );
    case "CARD_TRASHED": {
      const reason = event.payload.reason;
      const suffix =
        reason === "overflow"
          ? " trashed (overflow)"
          : reason === "stage_replaced"
            ? " trashed (stage replaced)"
            : " trashed";
      return out([card(event.payload.cardId), suffix]);
    }
    case "CARD_RETURNED_TO_HAND":
      return out([card(event.payload.cardId), " returned to hand"]);
    case "ATTACK_DECLARED": {
      const attacker = instance(event.payload.attackerInstanceId);
      const target = instance(event.payload.targetInstanceId);
      if (attacker && target) {
        return out(
          [attacker, " attacked ", target],
          "text-gb-accent-amber",
        );
      }
      return out([`${who} declared an attack`], "text-gb-accent-amber");
    }
    case "BLOCK_DECLARED": {
      const blocker = instance(event.payload.blockerInstanceId);
      if (blocker) {
        return out(
          ["[Blocker] ", `${who} blocked with `, blocker],
          "text-gb-accent-blue",
        );
      }
      return out(
        ["[Blocker] ", `${who} declared a blocker`],
        "text-gb-accent-blue",
      );
    }
    case "COUNTER_USED": {
      const value = event.payload.counterValue;
      return out([
        "[Counter] ",
        `${who} used `,
        card(event.payload.cardId),
        ...(typeof value === "number" && value > 0 ? [` (+${value})`] : []),
      ]);
    }
    case "DAMAGE_DEALT": {
      // OPT-887: playerIndex is the dealer; name the player who took it.
      const damaged = damagedPlayerOf(event) === myIndex ? "You" : "Opponent";
      return out([`${damaged} took damage`], "text-gb-accent-red");
    }
    case "TRIGGER_ACTIVATED": {
      if (event.payload.activated !== true) return null;
      return out(
        ["[Trigger] ", `${who} activated `, card(event.payload.cardId)],
        "text-gb-accent-purple",
      );
    }
    case "CARDS_REVEALED": {
      const count = event.payload.cards.length;
      if (event.payload.visibility === "CONTROLLER_ONLY") {
        if (event.payload.visibleTo !== myIndex) return null;
        return out(
          [`${who} looked at ${count} ${count === 1 ? "card" : "cards"}`],
          "text-gb-accent-blue",
        );
      }
      const items: Array<string | CardRef> = [`${who} revealed `];
      event.payload.cards.forEach((revealed, index) => {
        if (index > 0) items.push(", ");
        items.push(card(revealed.cardId));
      });
      return out(items, "text-gb-accent-amber");
    }
    case "DON_GIVEN_TO_CARD": {
      const target = instance(event.payload.targetInstanceId);
      const count = event.payload.count;
      return out(
        target
          ? [`${who} gave ${count} DON!! to `, target]
          : [`${who} gave ${count} DON!!`],
      );
    }
    case "POWER_MODIFIED": {
      const amount = event.payload.amount ?? event.payload.value ?? 0;
      const sign = amount > 0 ? "+" : "";
      const target = instance(event.payload.targetInstanceId);
      return out(
        target
          ? [target, ` power ${sign}${amount}`]
          : [`Power ${sign}${amount}`],
        amount > 0 ? "text-gb-accent-green" : "text-gb-accent-red",
      );
    }
    case "TURN_STARTED":
      return out([`${who === "You" ? "Your" : "Opponent's"} turn`], "text-gb-text-bright");
    case "GAME_OVER":
      return out([`Game over: ${event.payload.reason}`], "text-gb-accent-amber");
    case "PREGAME_PRIORITY_ROLLED": {
      const [r0, r1] = event.payload.rolls;
      const winner =
        myIndex === null
          ? `Player ${event.payload.priorityDeciderIndex + 1}`
          : event.payload.priorityDeciderIndex === myIndex
            ? "You"
            : "Opponent";
      return out(
        [`Priority roll: P1 ${r0} vs P2 ${r1}, ${winner} won`],
        "text-gb-accent-amber",
      );
    }
    case "PREGAME_FIRST_PLAYER_DECIDED": {
      const firstPlayer =
        myIndex === null
          ? `Player ${event.payload.firstPlayerIndex + 1}`
          : event.payload.firstPlayerIndex === myIndex
            ? "You"
            : "Opponent";
      return out([`${firstPlayer} will go first`], "text-gb-text-bright");
    }
    case "MULLIGAN_DECISION": {
      const action = event.payload.redrew ? "redrew" : "kept their hand";
      return out([`${who} ${action}`]);
    }
    case "PHASE_CHANGED":
    case "TURN_ENDED":
    case "DON_PLACED_ON_FIELD":
    case "DON_STATE_CHANGED":
    case "DON_DETACHED":
    case "CARD_STATE_CHANGED":
    case "BATTLE_RESOLVED":
    case "LIFE_CARD_FACE_CHANGED":
    case "CARD_ADDED_TO_HAND_FROM_LIFE":
      return null; // Too noisy — suppress
    default:
      return null;
  }
}

/** A card named in the log: underlined, and hovering or focusing it opens the
 *  same card inspection tooltip a board card opens. */
function EventLogCardName({
  cardId,
  name,
  cardDb,
}: {
  cardId: string;
  name: string;
  cardDb: CardDb;
}) {
  return (
    <CardTooltip data={cardDb[cardId] ?? null} cardId={cardId}>
      <span
        tabIndex={cardDb[cardId] ? 0 : undefined}
        data-event-log-card={cardId}
        className="cursor-help underline decoration-gb-text-subtle underline-offset-2 outline-none hover:decoration-current focus-visible:ring-2 focus-visible:ring-gb-accent-blue"
      >
        {name}
      </span>
    </CardTooltip>
  );
}

export function EventLogLine({
  entry,
  cardDb,
}: {
  entry: FormattedEvent;
  cardDb: CardDb;
}) {
  return (
    <p className={cn("text-sm leading-relaxed", entry.accent ?? "text-gb-text")}>
      {entry.parts.map((part, index) =>
        part.kind === "card" ? (
          <EventLogCardName
            key={index}
            cardId={part.cardId}
            name={part.name}
            cardDb={cardDb}
          />
        ) : (
          <EffectInline key={index} text={part.text} />
        ),
      )}
    </p>
  );
}

interface EventLogProps {
  events: GameEvent[];
  cardDb: CardDb;
  myIndex: 0 | 1 | null;
  lookupInstance?: InstanceCardLookup;
  className?: string;
}

/** The game's event log, docked in the board's left column under the prompt
 *  panel. Collapsible; follows the newest entry. */
export function EventLog({
  events,
  cardDb,
  myIndex,
  lookupInstance,
  className,
}: EventLogProps) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (events.length > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = events.length;
  }, [events.length]);

  const displayEvents = events.flatMap((event, index) => {
    const formatted = formatEvent(event, cardDb, myIndex, lookupInstance);
    return formatted ? [{ key: index, entry: formatted }] : [];
  });

  // Show last 100 max
  const visibleEvents = displayEvents.slice(-100);

  return (
    <div
      data-event-log=""
      className={cn(
        "flex min-h-0 w-full flex-col rounded-lg border border-gb-border-strong bg-gb-surface",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((v) => !v)}
        className="flex shrink-0 cursor-pointer items-center justify-between rounded-t-lg border-b border-gb-border-subtle px-3 py-2 transition-colors hover:bg-gb-surface-raised"
      >
        <span className="text-sm font-semibold uppercase tracking-widest text-gb-text-dim">
          Event Log
        </span>
        <div className="flex items-center gap-2">
          {collapsed && displayEvents.length > 0 && (
            <Badge variant="secondary" className="px-1 py-0 h-auto bg-gb-surface-raised text-gb-text-muted border-gb-border-strong">
              {displayEvents.length}
            </Badge>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
            aria-hidden
            className={cn(
              "text-gb-text-dim transition-transform duration-200",
              collapsed && "rotate-180",
            )}
          >
            <path d="M2 4.5L6 8.5L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {!collapsed && (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-1 py-1 scrollbar-thin"
        >
          {visibleEvents.length === 0 ? (
            <p className="text-sm text-gb-text-dim px-2 py-3 text-center italic">
              No events yet
            </p>
          ) : (
            visibleEvents.map(({ key, entry }) => (
              <div
                key={key}
                className="rounded-md px-2 py-1 transition-colors hover:bg-gb-surface-raised/50"
              >
                <EventLogLine entry={entry} cardDb={cardDb} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
