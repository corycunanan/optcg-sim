import { describe, expect, it } from "vitest";
import type { GameEvent } from "@shared/game-types";
import type { ZonePositionRegistry } from "@/contexts/zone-position-context";
import { assignPileFlips, planFlight } from "@/lib/game/card-motion";
import { eventToTransitions } from "./use-card-transitions";

// OPT-1057: DON!! moves between the face-down DON!! deck and the field.

function mkRegistry(cardZones: Record<string, string> = {}): ZonePositionRegistry {
  return {
    register: () => {},
    unregister: () => {},
    getRect: () => null,
    registerCard: () => {},
    unregisterCard: () => {},
    getCardZone: (id) => cardZones[id] ?? null,
  };
}

const placed = (playerIndex: 0 | 1, ids: string[]): GameEvent => ({
  type: "DON_PLACED_ON_FIELD",
  playerIndex,
  payload: { count: ids.length, donInstanceIds: ids },
  timestamp: 1,
});

describe("eventToTransitions: DON!! Phase placement", () => {
  it("deals one token per placed DON!! from the DON!! deck to its cost-area slot, 90ms apart", () => {
    const out = eventToTransitions(placed(0, ["d1", "d2"]), 0, mkRegistry());
    expect(out.map((t) => [t.kind, t.fromZoneKey, t.toZoneKey, t.donInstanceId, t.delay])).toEqual([
      ["don-move", "p-don-deck", "p-don", "d1", 0],
      ["don-move", "p-don-deck", "p-don", "d2", 0.09],
    ]);
    expect(out.every((t) => t.sourceFaceDown === true && t.destinationFaceDown === false)).toBe(true);
  });

  it("uses the top board's keys for the opponent", () => {
    const out = eventToTransitions(placed(1, ["o1"]), 0, mkRegistry());
    expect(out[0]).toMatchObject({ fromZoneKey: "o-don-deck", toZoneKey: "o-don" });
  });

  it("flips only the top DON!! on the pile; the one under it comes off face-up", () => {
    const [top, under] = assignPileFlips(
      eventToTransitions(placed(0, ["d1", "d2"]), 0, mkRegistry()),
    );
    expect(top.flip).toBe("turn");
    expect(under.flip).toBe("under");
    expect(planFlight(top)).toMatchObject({ initialFaceDown: true, faceDown: false, flipAt: 0 });
    // Both leave only after the top card's flip.
    expect(planFlight(under).departAt).toBeGreaterThanOrEqual(planFlight(top).departAt);
  });

  it("falls back to a count for an event without ids", () => {
    const out = eventToTransitions(
      { type: "DON_PLACED_ON_FIELD", playerIndex: 0, payload: { count: 2 }, timestamp: 1 },
      0,
      mkRegistry(),
    );
    expect(out).toHaveLength(2);
    expect(out[0].donInstanceId).toBeUndefined();
  });
});

describe("eventToTransitions: DON!! returns", () => {
  it("flies cost-area DON!! from their slots and attached DON!! from their card into the DON!! deck", () => {
    const out = eventToTransitions(
      {
        type: "DON_DETACHED",
        playerIndex: 0,
        payload: {
          count: 3,
          to: "DON_DECK",
          fromCostArea: 2,
          sources: [{ cardInstanceId: "char-a", count: 1 }],
          donInstanceIds: ["c1", "c2", "a1"],
        },
        timestamp: 1,
      },
      0,
      mkRegistry({ "char-a": "p-char-3" }),
    );
    expect(out.map((t) => [t.fromZoneKey, t.toZoneKey, t.donInstanceId])).toEqual([
      ["p-don", "p-don-deck", "c1"],
      ["p-don", "p-don-deck", "c2"],
      ["p-char-3", "p-don-deck", undefined],
    ]);
    // Each turns face-down where it stands: no pile, so every one flips.
    expect(assignPileFlips(out).map((t) => t.flip)).toEqual(["turn", "turn", "turn"]);
  });

  it("treats a count-only return as cost-area DON!!", () => {
    const out = eventToTransitions(
      { type: "DON_DETACHED", playerIndex: 1, payload: { count: 2 }, timestamp: 1 },
      0,
      mkRegistry(),
    );
    expect(out.map((t) => [t.fromZoneKey, t.toZoneKey])).toEqual([
      ["o-don", "o-don-deck"],
      ["o-don", "o-don-deck"],
    ]);
  });

  it("has no DON!! deck flight for the Refresh Phase return", () => {
    for (const payload of [
      {},
      { to: "COST_AREA" as const, sources: [{ cardInstanceId: "l", count: 2 }] },
    ]) {
      expect(
        eventToTransitions(
          { type: "DON_DETACHED", playerIndex: 0, payload, timestamp: 1 },
          0,
          mkRegistry(),
        ),
      ).toEqual([]);
    }
  });
});
