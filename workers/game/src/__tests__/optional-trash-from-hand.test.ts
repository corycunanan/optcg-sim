/**
 * Optional TRASH_FROM_HAND — "you may trash 1 card from your hand. If you
 * do, …" (OP16-035 Zoro). With params.optional the prompt allows selecting 0
 * (countMin 0) and always appears, and a 0-card selection reports
 * succeeded: false so a following IF_DO action does not fire.
 */

import { describe, expect, it } from "vitest";
import { executeTrashFromHand } from "../engine/effect-resolver/actions/removal.js";
import type { Action, EffectResult } from "../engine/effect-types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

const cardDb = createTestCardDb();

const optionalTrash: Action = { type: "TRASH_FROM_HAND", params: { amount: 1, optional: true } };

describe("optional TRASH_FROM_HAND", () => {
  it("always prompts with countMin 0", () => {
    const state = createBattleReadyState(cardDb);
    const result = executeTrashFromHand(state, optionalTrash, "src", 0, cardDb, new Map<string, EffectResult>());
    expect(result.pendingPrompt).toBeDefined();
    const options = result.pendingPrompt!.options as { countMin?: number; countMax?: number };
    expect(options.countMin).toBe(0);
    expect(options.countMax).toBe(1);
  });

  it("selecting 0 cards trashes nothing and reports succeeded: false", () => {
    const state = createBattleReadyState(cardDb);
    const handBefore = state.players[0].hand.length;
    const result = executeTrashFromHand(state, optionalTrash, "src", 0, cardDb, new Map<string, EffectResult>(), []);
    expect(result.succeeded).toBe(false);
    expect(result.state.players[0].hand).toHaveLength(handBefore);
  });

  it("selecting a card trashes it and reports succeeded: true", () => {
    const state = createBattleReadyState(cardDb);
    const chosen = state.players[0].hand[0].instanceId;
    const result = executeTrashFromHand(state, optionalTrash, "src", 0, cardDb, new Map<string, EffectResult>(), [chosen]);
    expect(result.succeeded).toBe(true);
    expect(result.state.players[0].trash.some((c) => c.instanceId === chosen)).toBe(true);
  });

  it("mandatory trash with exactly `amount` candidates still auto-resolves without a prompt", () => {
    const state = createBattleReadyState(cardDb);
    const oneCardHand = { ...state, players: [
      { ...state.players[0], hand: state.players[0].hand.slice(0, 1) },
      state.players[1],
    ] as typeof state.players };
    const mandatory: Action = { type: "TRASH_FROM_HAND", params: { amount: 1 } };
    const result = executeTrashFromHand(oneCardHand, mandatory, "src", 0, cardDb, new Map<string, EffectResult>());
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.succeeded).toBe(true);
  });
});
