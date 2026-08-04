/**
 * OPT-611 — canonical "rested Characters" gates must not count rested
 * Leaders, Stages, or DON!! cards.
 */

import { describe, expect, it } from "vitest";
import { evaluateCondition } from "../engine/conditions.js";
import type { Condition, EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import type { CardInstance, GameState, PlayerState } from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const RESTED_CHARACTER_GATES = [
  ["OP01-052", 2],
  ["OP05-031", 2],
  ["OP09-024", 2],
  ["OP09-026", 2],
  ["OP09-027", 3],
  ["OP09-031", 2],
  ["OP09-033", 2],
  ["OP09-035", 2],
  ["OP09-036", 2],
  ["OP09-037", 3],
  ["OP09-039", 2],
  ["OP09-040", 2],
  ["OP09-041", 2],
  ["OP10-024", 2],
  ["OP10-025", 2],
  ["OP10-029", 2],
  ["OP10-038", 2],
  ["P-037", 2],
] as const;

function findRestedCharacterGate(schema: EffectSchema): Condition {
  const matches: Condition[] = [];

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;

    const candidate = value as Record<string, unknown>;
    const filter = candidate.filter as Record<string, unknown> | undefined;
    if (
      candidate.type === "CARD_ON_FIELD" &&
      filter?.card_type === "CHARACTER" &&
      filter.is_rested === true
    ) {
      matches.push(value as Condition);
    }
    Object.values(candidate).forEach(visit);
  }

  visit(schema.effects);
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function restedCharacter(index: number): CardInstance {
  return {
    instanceId: `rested-character-${index}`,
    cardId: CARDS.VANILLA.id,
    zone: "CHARACTER",
    state: "RESTED",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

function withRestedField(
  state: GameState,
  characterCount: number,
  restedDonCount: number
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    characters: padChars(
      Array.from({ length: characterCount }, (_, index) =>
        restedCharacter(index)
      )
    ),
    donCostArea: players[0].donCostArea.map((don, index) => ({
      ...don,
      state: index < restedDonCount ? "RESTED" : "ACTIVE",
    })),
  };
  return { ...state, players };
}

describe("OPT-611 — rested Character gates", () => {
  it.each(RESTED_CHARACTER_GATES)(
    "%s ignores rested DON!! and accepts the canonical Character threshold",
    (cardId, threshold) => {
      const schema = getEffectSchema(cardId);
      expect(schema).toBeDefined();
      const condition = findRestedCharacterGate(schema!);
      expect(condition).toEqual({
        type: "CARD_ON_FIELD",
        controller: "SELF",
        filter: { card_type: "CHARACTER", is_rested: true },
        count: { operator: ">=", value: threshold },
      });

      const cardDb = createTestCardDb();
      const base = createBattleReadyState(cardDb);
      const context = {
        sourceCardInstanceId: base.players[0].leader.instanceId,
        controller: 0 as const,
        cardDb,
      };
      const falsePositive = withRestedField(base, threshold - 1, 1);
      const valid = withRestedField(base, threshold, 0);

      expect(evaluateCondition(falsePositive, condition, context)).toBe(false);
      expect(evaluateCondition(valid, condition, context)).toBe(true);
    }
  );
});
