import { describe, expect, it } from "vitest";
import type { CardInstance } from "@shared/game-types";
import { computeHandAnimationState } from "./use-hand-animation-state";
import type { CardTransition } from "./use-card-transitions";

function handCard(instanceId: string, cardId: string): CardInstance {
  return {
    instanceId,
    cardId,
    owner: 0,
    zone: "HAND",
    attachedDon: [],
  } as unknown as CardInstance;
}

function transition(
  instanceId: string | null,
  cardId: string | null,
  toZoneKey: string,
): CardTransition {
  return {
    id: `transition-${instanceId ?? cardId}`,
    instanceId,
    cardId,
    fromZoneKey: toZoneKey.replace("hand", "deck"),
    toZoneKey,
    playerIndex: toZoneKey.startsWith("p-") ? 0 : 1,
    startedAt: 1,
  };
}

describe("computeHandAnimationState", () => {
  it.each([
    ["p-hand", "bottom-visible", "OP01-001"],
    ["o-hand", "top-visible", "OP02-001"],
  ])(
    "tracks a visible draw arriving at %s by received instance identity",
    (zoneKey, instanceId, cardId) => {
      const state = computeHandAnimationState(
        [transition(instanceId, cardId, zoneKey)],
        [handCard(instanceId, cardId)],
        zoneKey,
      );

      expect([...state.inFlightInstanceIds]).toEqual([instanceId]);
      expect(state.projectedCount).toBe(2);
    },
  );

  it("tracks a defensive hidden arrival without requiring card art", () => {
    const state = computeHandAnimationState(
      [transition(null, "hidden", "o-hand")],
      [handCard("hidden-opponent-draw", "hidden")],
      "o-hand",
    );

    expect([...state.inFlightInstanceIds]).toEqual([
      "hidden-opponent-draw",
    ]);
  });

  it("preserves first-match fallback for a seated-player hand departure", () => {
    const state = computeHandAnimationState(
      [
        {
          ...transition(null, "OP01-001", "p-trash"),
          fromZoneKey: "p-hand",
        },
      ],
      [
        handCard("first-copy", "OP01-001"),
        handCard("second-copy", "OP01-001"),
      ],
      "p-hand",
    );

    expect([...state.inFlightInstanceIds]).toEqual(["first-copy"]);
  });

  it("does not borrow a transition from the other hand", () => {
    const state = computeHandAnimationState(
      [transition("top-visible", "OP02-001", "o-hand")],
      [handCard("bottom-visible", "OP01-001")],
      "p-hand",
    );

    expect([...state.inFlightInstanceIds]).toEqual([]);
    expect(state.projectedCount).toBe(1);
  });
});
