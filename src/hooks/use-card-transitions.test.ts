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

describe("eventToTransitions — CARD_RETURNED_TO_DECK (OPT-121)", () => {
  const instanceId = "i-7";
  const registry = mkRegistry({
    getCardZone: (id) => (id === instanceId ? "p-char-1" : null),
  });

  it("flies from the registered card zone to the owner's deck", () => {
    const ev = {
      type: "CARD_RETURNED_TO_DECK",
      playerIndex: 0,
      timestamp: 1,
      payload: { cardInstanceId: instanceId, cardId: "OP01-001", position: "TOP" },
    } as unknown as GameEvent;
    const [t] = eventToTransitions(ev, 0, registry);
    expect(t.fromZoneKey).toBe("p-char-1");
    expect(t.toZoneKey).toBe("p-deck");
    expect(t.cardId).toBe("OP01-001");
    expect(t.instanceId).toBe(instanceId);
    expect(t.kind).toBeUndefined();
  });

  it("falls back to a character slot when the source zone isn't registered", () => {
    const ev = {
      type: "CARD_RETURNED_TO_DECK",
      playerIndex: 0,
      timestamp: 1,
      payload: { cardInstanceId: "unknown", cardId: "OP01-002" },
    } as unknown as GameEvent;
    const [t] = eventToTransitions(ev, 0, mkRegistry());
    expect(t.fromZoneKey).toBe("p-char-2");
    expect(t.toZoneKey).toBe("p-deck");
  });

  it("uses opponent prefix when the event originated from the other player", () => {
    const oppRegistry = mkRegistry({
      getCardZone: (id) => (id === instanceId ? "o-leader" : null),
    });
    const ev = {
      type: "CARD_RETURNED_TO_DECK",
      playerIndex: 1,
      timestamp: 1,
      payload: { cardInstanceId: instanceId, cardId: "OP01-003" },
    } as unknown as GameEvent;
    const [t] = eventToTransitions(ev, 0, oppRegistry);
    expect(t.fromZoneKey).toBe("o-leader");
    expect(t.toZoneKey).toBe("o-deck");
    expect(t.playerIndex).toBe(1);
  });
});

describe("eventToTransitions — LIFE_CARD_TO_DECK (OPT-121)", () => {
  it("fans out a count-N event into N face-down life→deck flights", () => {
    const ev = {
      type: "LIFE_CARD_TO_DECK",
      playerIndex: 0,
      timestamp: 1,
      payload: { count: 2 },
    } as unknown as GameEvent;
    const out = eventToTransitions(ev, 0, mkRegistry());
    expect(out).toHaveLength(2);
    for (const t of out) {
      expect(t.fromZoneKey).toBe("p-life");
      expect(t.toZoneKey).toBe("p-deck");
      expect(t.cardId).toBeNull();
      expect(t.instanceId).toBeNull();
      expect(t.kind).toBeUndefined();
    }
    expect(out[0].delay).toBe(0);
    expect(out[1].delay).toBeCloseTo(0.06, 5);
  });

  it("treats an omitted count as 1 token and uses opponent prefix when needed", () => {
    const ev = {
      type: "LIFE_CARD_TO_DECK",
      playerIndex: 1,
      timestamp: 1,
      payload: { count: 0 },
    } as unknown as GameEvent;
    const out = eventToTransitions(ev, 0, mkRegistry());
    expect(out).toHaveLength(1);
    expect(out[0].fromZoneKey).toBe("o-life");
    expect(out[0].toZoneKey).toBe("o-deck");
    expect(out[0].playerIndex).toBe(1);
  });
});

describe("eventToTransitions — life-source CARD_TRASHED (OPT-121)", () => {
  function lifeTrashEvent(reason: string, count = 1): GameEvent {
    return {
      type: "CARD_TRASHED",
      playerIndex: 0,
      timestamp: 1,
      payload: { count, reason },
    } as unknown as GameEvent;
  }

  it("life_trash fans out into face-down life→trash flights", () => {
    const out = eventToTransitions(lifeTrashEvent("life_trash", 2), 0, mkRegistry());
    expect(out).toHaveLength(2);
    for (const t of out) {
      expect(t.fromZoneKey).toBe("p-life");
      expect(t.toZoneKey).toBe("p-trash");
      expect(t.cardId).toBeNull();
      expect(t.instanceId).toBeNull();
    }
    expect(out[0].delay).toBe(0);
    expect(out[1].delay).toBeCloseTo(0.06, 5);
  });

  it("face_up_life uses the same life→trash route", () => {
    const out = eventToTransitions(lifeTrashEvent("face_up_life", 1), 0, mkRegistry());
    expect(out).toHaveLength(1);
    expect(out[0].fromZoneKey).toBe("p-life");
    expect(out[0].toZoneKey).toBe("p-trash");
  });

  it("non-life CARD_TRASHED with only count still returns nothing (existing behavior)", () => {
    // search_trash, hand_wheel, mill, etc. — these emit count without a cardId
    // and don't have a single source rect, so the flight layer skips them.
    const out = eventToTransitions(lifeTrashEvent("mill", 3), 0, mkRegistry());
    expect(out).toEqual([]);
  });
});
