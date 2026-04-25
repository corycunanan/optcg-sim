import { describe, expect, it } from "vitest";
import type { GameEvent } from "@shared/game-types";
import type { ZonePositionRegistry } from "@/contexts/zone-position-context";
import {
  applyBatchStagger,
  eventToTransitions,
  type CardTransition,
} from "./use-card-transitions";

function mkRegistry(overrides: Partial<ZonePositionRegistry> = {}): ZonePositionRegistry {
  return {
    register: () => {},
    unregister: () => {},
    getRect: () => null,
    registerCard: () => {},
    unregisterCard: () => {},
    getCardZone: () => null,
    ...overrides,
  };
}

function mkTransition(partial: Partial<CardTransition> = {}): CardTransition {
  return {
    id: "t",
    cardId: null,
    instanceId: null,
    fromZoneKey: "p-deck",
    toZoneKey: "p-hand",
    playerIndex: 0,
    startedAt: 0,
    ...partial,
  };
}

describe("applyBatchStagger", () => {
  it("returns the batch unchanged when length <= 1", () => {
    const batch = [mkTransition({ id: "a" })];
    expect(applyBatchStagger(batch)).toEqual(batch);
  });

  it("assigns 0, 60, 120, … ms delays to siblings in order", () => {
    const batch = [
      mkTransition({ id: "a" }),
      mkTransition({ id: "b" }),
      mkTransition({ id: "c" }),
    ];
    const out = applyBatchStagger(batch);
    expect(out[0].delay).toBe(0);
    expect(out[1].delay).toBeCloseTo(0.06, 5);
    expect(out[2].delay).toBeCloseTo(0.12, 5);
  });

  it("adds batch stagger on top of per-transition delays (e.g. DON-attach tokens)", () => {
    // Simulate a DON_GIVEN_TO_CARD expansion — each token already has its own
    // per-token delay; the batch stagger rides on top.
    const batch = [
      mkTransition({ id: "d0", delay: 0 }),
      mkTransition({ id: "d1", delay: 0.06 }),
    ];
    const out = applyBatchStagger(batch);
    expect(out[0].delay).toBe(0);
    expect(out[1].delay).toBeCloseTo(0.12, 5);
  });
});

describe("eventToTransitions — DON_GIVEN_TO_CARD", () => {
  const targetId = "p0-char-c1";
  const targetZone = "p-char-1";
  const registry = mkRegistry({
    getCardZone: (id) => (id === targetId ? targetZone : null),
  });

  function donEvent(count: number, include = true): GameEvent {
    return {
      type: "DON_GIVEN_TO_CARD",
      playerIndex: 0,
      timestamp: 1,
      payload: include ? { targetInstanceId: targetId, count } : { count },
    } as unknown as GameEvent;
  }

  it("fans out a count-N event into N don-attach transitions", () => {
    const out = eventToTransitions(donEvent(3), 0, registry);
    expect(out).toHaveLength(3);
    for (const t of out) {
      expect(t.kind).toBe("don-attach");
      expect(t.targetInstanceId).toBe(targetId);
      expect(t.fromZoneKey).toBe("p-don");
      expect(t.toZoneKey).toBe(targetZone);
      expect(t.instanceId).toBeNull();
      expect(t.cardId).toBeNull();
    }
  });

  it("assigns per-token stagger delays inside the expansion", () => {
    const out = eventToTransitions(donEvent(3), 0, registry);
    expect(out[0].delay).toBe(0);
    expect(out[1].delay).toBeCloseTo(0.06, 5);
    expect(out[2].delay).toBeCloseTo(0.12, 5);
  });

  it("uses opponent prefix when the event originated from the other player", () => {
    const registryOpp = mkRegistry({
      getCardZone: (id) => (id === targetId ? "o-char-1" : null),
    });
    const ev = { ...donEvent(1), playerIndex: 1 } as unknown as GameEvent;
    const [t] = eventToTransitions(ev, 0, registryOpp);
    expect(t.fromZoneKey).toBe("o-don");
    expect(t.toZoneKey).toBe("o-char-1");
    expect(t.playerIndex).toBe(1);
  });

  it("returns an empty array when the target card has no registered zone", () => {
    const registryUnknown = mkRegistry({ getCardZone: () => null });
    expect(eventToTransitions(donEvent(2), 0, registryUnknown)).toEqual([]);
  });

  it("returns an empty array when the payload is missing a targetInstanceId", () => {
    expect(eventToTransitions(donEvent(1, false), 0, registry)).toEqual([]);
  });

  it("treats an omitted count as 1 token", () => {
    const ev = {
      type: "DON_GIVEN_TO_CARD",
      playerIndex: 0,
      timestamp: 1,
      payload: { targetInstanceId: targetId },
    } as unknown as GameEvent;
    expect(eventToTransitions(ev, 0, registry)).toHaveLength(1);
  });
});

describe("eventToTransitions — CARD_DRAWN (deck→hand flight)", () => {
  const registry = mkRegistry();

  it("produces a single deck→hand transition", () => {
    const ev = {
      type: "CARD_DRAWN",
      playerIndex: 0,
      timestamp: 1,
      payload: { cardId: "OP01-001", cardInstanceId: "i-1" },
    } as unknown as GameEvent;
    const out = eventToTransitions(ev, 0, registry);
    expect(out).toHaveLength(1);
    expect(out[0].fromZoneKey).toBe("p-deck");
    expect(out[0].toZoneKey).toBe("p-hand");
    expect(out[0].kind).toBeUndefined();
  });
});

describe("eventToTransitions — CARD_TRASHED life→trash routing", () => {
  const registry = mkRegistry();

  function trashEvent(
    payload: Record<string, unknown>,
    playerIndex: 0 | 1 = 0,
  ): GameEvent {
    return {
      type: "CARD_TRASHED",
      playerIndex,
      timestamp: 1,
      payload,
    } as unknown as GameEvent;
  }

  it("routes from the life zone when payload.from is LIFE", () => {
    const out = eventToTransitions(
      trashEvent({ cardInstanceId: "p0-life-1", from: "LIFE", reason: "x" }),
      0,
      registry,
    );
    expect(out).toHaveLength(1);
    expect(out[0].fromZoneKey).toBe("p-life");
    expect(out[0].toZoneKey).toBe("p-trash");
    expect(out[0].cardId).toBeNull();
  });

  it("routes from the life zone when reason is face_up_life (engine shape)", () => {
    const out = eventToTransitions(
      trashEvent({ cardInstanceId: "p0-life-1", reason: "face_up_life" }),
      0,
      registry,
    );
    expect(out[0].fromZoneKey).toBe("p-life");
  });

  it("routes from the life zone when reason is life_trash", () => {
    const out = eventToTransitions(
      trashEvent({ cardInstanceId: "p0-life-1", reason: "life_trash" }),
      0,
      registry,
    );
    expect(out[0].fromZoneKey).toBe("p-life");
  });

  it("uses opponent prefix when the event originated from the other player", () => {
    const out = eventToTransitions(
      trashEvent(
        { cardInstanceId: "p1-life-1", from: "LIFE", reason: "face_up_life" },
        1,
      ),
      0,
      registry,
    );
    expect(out[0].fromZoneKey).toBe("o-life");
    expect(out[0].toZoneKey).toBe("o-trash");
  });

  it("falls back to char-2 when neither from nor a life-trash reason is set", () => {
    const out = eventToTransitions(
      trashEvent({ cardInstanceId: "x", reason: "EFFECT" }),
      0,
      registry,
    );
    expect(out[0].fromZoneKey).toBe("p-char-2");
  });

  it("returns no transitions for the engine's count-only emission shape", () => {
    // Matches the production engine: { count: N, reason: "face_up_life" }.
    // Without a cardId or cardInstanceId, the per-card flight is suppressed —
    // sandbox scenarios emit per-card events explicitly to render the flight.
    const out = eventToTransitions(
      trashEvent({ count: 2, reason: "face_up_life" }),
      0,
      registry,
    );
    expect(out).toEqual([]);
  });
});
