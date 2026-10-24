import { expect } from "vitest";
import type { GameState } from "../types.js";

/** Frozen historic corpora predate optional root evidence. Assert precisely its
 * independent contract before omitting only that field on a comparison copy. */
export function withoutAssertedCostEvidence<T>(value: T): T {
  const copy = structuredClone(value);
  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const raw = node as Record<string, unknown>;
    if (Array.isArray(raw.effectStack) && Array.isArray(raw.players)) {
      const state = raw as unknown as GameState;
      for (const frame of state.effectStack) {
        if (frame.costExpectedRoot !== undefined) {
          expect(state.schemaVersion).toBe(7);
          expect(frame.phase).toBe("AWAITING_COST_SELECTION");
          expect(frame.costs[frame.currentCostIndex]).toBeDefined();
          if (frame.kind !== undefined) expect(frame.kind).toBe("COST");
          expect(frame.costExpectedRoot).toEqual({
            players: state.players,
            turn: state.turn,
            activeEffects: state.activeEffects,
            prohibitions: state.prohibitions,
            scheduledActions: state.scheduledActions,
            oneTimeModifiers: state.oneTimeModifiers,
            triggerRegistry: state.triggerRegistry,
          });
          delete frame.costExpectedRoot;
        }
      }
    }
    Object.values(raw).forEach(visit);
  }
  visit(copy);
  return copy;
}
