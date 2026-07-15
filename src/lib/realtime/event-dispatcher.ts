/**
 * Pure typed event dispatcher for the UserChannel.
 *
 * Owns a `Map<eventType, Set<handler>>`. Subscribers register a handler for a
 * single event type and get pinpoint delivery without each one parsing JSON.
 * `dispatch` is called once per inbound message; if no handlers exist for the
 * type the message is dropped.
 *
 * Extracted as a pure factory so the subscribe/unsubscribe semantics are
 * testable without React.
 */

import type { RealtimeServerEvent } from "@/types/realtime";

// `[T] extends [never]` is the non-distributive form — without the brackets the
// conditional distributes over `never` and collapses to `never`, leaving the
// dispatcher untypeable until the union has at least one variant.
export type EventType = [RealtimeServerEvent] extends [never]
  ? string
  : RealtimeServerEvent extends { type: infer T extends string }
    ? T
    : string;
export type EventOf<T extends EventType> = [RealtimeServerEvent] extends [never]
  ? { type: T } & Record<string, unknown>
  : Extract<RealtimeServerEvent, { type: T }>;
export type Handler<T extends EventType> = (event: EventOf<T>) => void;
export type Unsubscribe = () => void;

export interface EventDispatcher {
  subscribe<T extends EventType>(type: T, handler: Handler<T>): Unsubscribe;
  /**
   * Dispatch a parsed message. Unknown `type` strings are silently dropped —
   * the worker is the source of truth for the event vocabulary, but we never
   * want a server-side rollout to throw on older clients.
   */
  dispatch(event: { type: string } & Record<string, unknown>): void;
  /** Test/inspection only. */
  handlerCount(type: string): number;
}

export function createEventDispatcher(): EventDispatcher {
  // A heterogeneous handler map erases the correlation between each key and
  // its event subtype; assertions stay inside this private, typed API boundary.
  const handlers = new Map<string, Set<Handler<EventType>>>();

  return {
    subscribe(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler as unknown as Handler<EventType>);
      return () => {
        const current = handlers.get(type);
        if (!current) return;
        current.delete(handler as unknown as Handler<EventType>);
        if (current.size === 0) handlers.delete(type);
      };
    },

    dispatch(event) {
      const set = handlers.get(event.type);
      if (!set) return;
      // Iterate a snapshot so a handler unsubscribing mid-dispatch doesn't
      // skip its siblings.
      for (const handler of [...set]) {
        try {
          handler(event as EventOf<EventType>);
        } catch (err) {
          console.warn("[useUserChannel] subscriber threw", {
            type: event.type,
            err,
          });
        }
      }
    },

    handlerCount(type) {
      return handlers.get(type)?.size ?? 0;
    },
  };
}
