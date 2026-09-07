import { describe, expect, it } from "vitest";
import type { Action } from "../engine/effect-types.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

const FULL =
  "[On Play] K.O. up to 1 of your opponent's Characters.\n[Trigger] Draw 1 card.";
const CLAUSE = "[On Play] K.O. up to 1 of your opponent's Characters.";
const KO: Action = {
  type: "KO",
  target: {
    type: "CHARACTER",
    controller: "OPPONENT",
    count: { up_to: 1 },
  },
};

describe("OPT-765 nested choice prompt descriptions", () => {
  it("uses the chain description for a prompt inside an auto-selected choice", () => {
    const cardDb = createTestCardDb();
    cardDb.set(CARDS.LEADER.id, { ...CARDS.LEADER, effectText: FULL });
    const state = createBattleReadyState(cardDb);
    const leaderId = state.players[0].leader.instanceId;

    const nested = executeActionChain(
      state,
      [{ type: "PLAYER_CHOICE", params: { options: [[KO]] } }],
      leaderId,
      0,
      cardDb,
      undefined,
      CLAUSE,
    );

    const prompt = nested.pendingPrompt?.options;
    expect(prompt?.promptType).toBe("SELECT_TARGET");
    if (!prompt || prompt.promptType !== "SELECT_TARGET") {
      throw new Error("Expected a target-selection prompt");
    }
    expect(prompt.effectDescription).toBe(CLAUSE);
  });

  it("preserves the prompt description when the chain has no description", () => {
    const cardDb = createTestCardDb();
    cardDb.set(CARDS.LEADER.id, { ...CARDS.LEADER, effectText: FULL });
    const state = createBattleReadyState(cardDb);
    const leaderId = state.players[0].leader.instanceId;

    const nested = executeActionChain(
      state,
      [{ type: "PLAYER_CHOICE", params: { options: [[KO]] } }],
      leaderId,
      0,
      cardDb,
      undefined,
      undefined,
    );

    const prompt = nested.pendingPrompt?.options;
    expect(prompt?.promptType).toBe("SELECT_TARGET");
    if (!prompt || prompt.promptType !== "SELECT_TARGET") {
      throw new Error("Expected a target-selection prompt");
    }
    expect(prompt.effectDescription).toBe(FULL);
  });
});
