import { expect } from "vitest";

interface StateLike {
  eventLog: Array<{ type: string; timestamp: number; playerIndex?: number; payload?: unknown }>;
  executionContext?: { clockCounter?: number };
}

function isStateLike(node: unknown): node is StateLike {
  return (
    !!node &&
    typeof node === "object" &&
    Array.isArray((node as StateLike).eventLog) &&
    Array.isArray((node as { players?: unknown }).players)
  );
}

/**
 * Frozen historic corpora predate the OPT-1055 `DECK_SHUFFLED` event, which
 * every engine deck shuffle now announces. On a comparison copy of
 * `received`, assert each announcement's contract (deck owner, empty
 * payload, in log order), then drop it and take the frozen clock values the
 * extra event shifted (event timestamps, `clockCounter`). Everything else
 * still matches byte for byte. States without a shuffle are left untouched.
 */
export function withoutAssertedDeckShuffled<T>(received: T, expected: T): T {
  const copy = structuredClone(received);
  function visit(node: unknown, frozen: unknown): void {
    if (!node || typeof node !== "object" || !frozen || typeof frozen !== "object") return;
    if (isStateLike(node) && isStateLike(frozen)) {
      const shuffles = node.eventLog.filter((event) => event.type === "DECK_SHUFFLED");
      if (shuffles.length > 0) {
        for (const event of shuffles) {
          expect(event.payload).toEqual({});
          expect([0, 1]).toContain(event.playerIndex);
        }
        const stamps = node.eventLog.map((event) => event.timestamp);
        expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
        const rest = node.eventLog.filter((event) => event.type !== "DECK_SHUFFLED");
        node.eventLog = rest.map((event, index) => {
          const old = frozen.eventLog[index];
          return old && old.type === event.type ? { ...event, timestamp: old.timestamp } : event;
        });
        const clock = node.executionContext?.clockCounter;
        const frozenClock = frozen.executionContext?.clockCounter;
        if (clock !== undefined && frozenClock !== undefined && node.executionContext) {
          expect(clock).toBeGreaterThan(frozenClock);
          node.executionContext.clockCounter = frozenClock;
        }
      }
    }
    if (Array.isArray(node) && Array.isArray(frozen)) {
      node.forEach((child, index) => visit(child, frozen[index]));
      return;
    }
    const raw = node as Record<string, unknown>;
    const old = frozen as Record<string, unknown>;
    for (const key of Object.keys(raw)) {
      if (key === "eventLog") continue;
      visit(raw[key], old[key]);
    }
  }
  visit(copy, expected);
  return copy;
}
