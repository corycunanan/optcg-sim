/**
 * OPT-444 — OP10-022 Trafalgar Law's pre-colon activation condition
 * "If the total cost of your Characters is 5 or more" was encoded as
 * CARD_ON_FIELD count >= 1, so a lone 2-cost Character made the ability
 * activatable. The engine had no total-character-cost predicate.
 *
 * Fix under test: the CHARACTER_TOTAL_COST condition (effective, post-modifier
 * cost per the OPT-247 convention) and OP10-022's re-encoded condition.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { RuntimeActiveEffect, RuntimeOneTimeModifier } from "../engine/effect-types.js";
import { evaluateCondition } from "../engine/conditions.js";
import { runPipeline } from "../engine/pipeline.js";
import { OP10_022_TRAFALGAR_LAW } from "../engine/schemas/op10.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";

function charInstance(cardId: string, suffix: string, owner: 0 | 1 = 0): CardInstance {
  return {
    instanceId: `char-${owner}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

function withCharacters(
  state: GameState,
  playerIdx: 0 | 1,
  chars: CardInstance[],
): GameState {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIdx] = { ...newPlayers[playerIdx], characters: padChars(chars) };
  return { ...state, players: newPlayers };
}

const CTX = { sourceCardInstanceId: "leader-0", controller: 0 as const };

describe("OPT-444: CHARACTER_TOTAL_COST condition", () => {
  it("meets the threshold at exactly the total (3 + 2 = 5)", () => {
    const cardDb = createTestCardDb();
    const state = withCharacters(createBattleReadyState(cardDb), 0, [
      charInstance(CARDS.VANILLA.id, "a"), // cost 3
      charInstance(CARDS.RUSH.id, "b"), // cost 2
    ]);
    expect(evaluateCondition(
      state,
      { type: "CHARACTER_TOTAL_COST", controller: "SELF", operator: ">=", value: 5 },
      { ...CTX, cardDb },
    )).toBe(true);
  });

  it("fails below the threshold (2 + 2 = 4)", () => {
    const cardDb = createTestCardDb();
    const state = withCharacters(createBattleReadyState(cardDb), 0, [
      charInstance(CARDS.RUSH.id, "a"), // cost 2
      charInstance(CARDS.BANISH.id, "b"), // cost 2
    ]);
    expect(evaluateCondition(
      state,
      { type: "CHARACTER_TOTAL_COST", controller: "SELF", operator: ">=", value: 5 },
      { ...CTX, cardDb },
    )).toBe(false);
  });

  it("an empty board totals 0", () => {
    const cardDb = createTestCardDb();
    const state = withCharacters(createBattleReadyState(cardDb), 0, []);
    expect(evaluateCondition(
      state,
      { type: "CHARACTER_TOTAL_COST", controller: "SELF", operator: ">=", value: 1 },
      { ...CTX, cardDb },
    )).toBe(false);
  });

  it("controller OPPONENT reads the opponent's board", () => {
    const cardDb = createTestCardDb();
    let state = withCharacters(createBattleReadyState(cardDb), 0, []);
    state = withCharacters(state, 1, [
      charInstance(CARDS.VANILLA.id, "a", 1), // cost 3
      charInstance(CARDS.VANILLA.id, "b", 1), // cost 3
    ]);
    expect(evaluateCondition(
      state,
      { type: "CHARACTER_TOTAL_COST", controller: "OPPONENT", operator: ">=", value: 5 },
      { ...CTX, cardDb },
    )).toBe(true);
  });

  it("sums the effective cost — a +2 modifier lifts a 4 total over the threshold", () => {
    const cardDb = createTestCardDb();
    const boosted = charInstance(CARDS.RUSH.id, "a"); // base cost 2
    const other = charInstance(CARDS.BANISH.id, "b"); // cost 2
    let state = withCharacters(createBattleReadyState(cardDb), 0, [boosted, other]);
    const modifier: RuntimeActiveEffect = {
      id: "opt444-cost-up",
      sourceCardInstanceId: "src-0",
      sourceEffectBlockId: "blk",
      category: "permanent",
      modifiers: [{ type: "MODIFY_COST", params: { amount: 2 } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: state.turn.number },
      controller: 0,
      appliesTo: [boosted.instanceId],
      timestamp: 0,
    };
    state = { ...state, activeEffects: [modifier as never] };
    expect(evaluateCondition(
      state,
      { type: "CHARACTER_TOTAL_COST", controller: "SELF", operator: ">=", value: 5 },
      { ...CTX, cardDb },
    )).toBe(true);
  });

  it("a pending play-time discount does not change the on-field total", () => {
    const cardDb = createTestCardDb();
    // 3 + 2 = 5 on the field; a pending "next play −1" one-time modifier
    // matching every character must not drag the field total to 4.
    let state = withCharacters(createBattleReadyState(cardDb), 0, [
      charInstance(CARDS.VANILLA.id, "a"), // cost 3
      charInstance(CARDS.RUSH.id, "b"), // cost 2
    ]);
    const pendingDiscount: RuntimeOneTimeModifier = {
      id: "opt444-next-play-discount",
      appliesTo: { action: "MODIFY_COST" as never },
      modification: { type: "MODIFY_COST", params: { amount: -1 } },
      expires: { type: "THIS_TURN" } as never,
      consumed: false,
      controller: 0,
    };
    state = { ...state, oneTimeModifiers: [pendingDiscount as never] };
    expect(evaluateCondition(
      state,
      { type: "CHARACTER_TOTAL_COST", controller: "SELF", operator: ">=", value: 5 },
      { ...CTX, cardDb },
    )).toBe(true);
  });
});

describe("OPT-444: OP10-022 activation gates on total character cost", () => {
  function lawState(chars: CardInstance[]): { state: GameState; cardDb: Map<string, CardData> } {
    const cardDb = createTestCardDb();
    const lawLeader: CardData = {
      ...CARDS.LEADER,
      id: "OP10-022",
      name: "Trafalgar Law",
      effectSchema: OP10_022_TRAFALGAR_LAW,
    };
    cardDb.set(lawLeader.id, lawLeader);

    let state = createBattleReadyState(cardDb);
    const leader = state.players[0].leader;
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      leader: {
        ...leader,
        cardId: lawLeader.id,
        // [DON!! x1] requirement
        attachedDon: [{ instanceId: "don-law", state: "RESTED", attachedTo: leader.instanceId }],
      },
    };
    state = { ...state, players: newPlayers };
    return { state: withCharacters(state, 0, chars), cardDb };
  }

  it("total cost 4 → the ability does not activate (pre-fix: activatable)", () => {
    const { state, cardDb } = lawState([
      charInstance(CARDS.RUSH.id, "a"), // 2
      charInstance(CARDS.BANISH.id, "b"), // 2
    ]);
    const result = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: state.players[0].leader.instanceId,
        effectId: "activate_reveal_life_play",
      },
      cardDb,
      0,
    );
    // Conditions fail inside the resolver: no optional-activation prompt opens.
    expect(result.pendingPrompt).toBeFalsy();
    expect(result.state.effectStack ?? []).toHaveLength(0);
  });

  it("total cost 5 → the optional activation prompt opens", () => {
    const { state, cardDb } = lawState([
      charInstance(CARDS.VANILLA.id, "a"), // 3
      charInstance(CARDS.RUSH.id, "b"), // 2
    ]);
    const result = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: state.players[0].leader.instanceId,
        effectId: "activate_reveal_life_play",
      },
      cardDb,
      0,
    );
    expect(result.valid).toBe(true);
    expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  });

  it("accepting the activation chains into the return-to-hand cost selection", async () => {
    const { state, cardDb } = lawState([
      charInstance(CARDS.VANILLA.id, "a"), // 3
      charInstance(CARDS.RUSH.id, "b"), // 2
    ]);
    const result = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: state.players[0].leader.instanceId,
        effectId: "activate_reveal_life_play",
      },
      cardDb,
      0,
    );
    expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const { resumeFromStack } = await import("../engine/effect-resolver/index.js");
    const accepted = resumeFromStack(
      result.state,
      { type: "PLAYER_CHOICE", choiceId: "activate" } as never,
      cardDb,
    );
    // The RETURN_OWN_CHARACTER_TO_HAND cost opens its target selection with
    // both characters offered — the activation chain is intact past the gate.
    expect(accepted.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(accepted.pendingPrompt?.options.validTargets).toEqual(
      expect.arrayContaining(["char-0-a", "char-0-b"]),
    );
  });
});
