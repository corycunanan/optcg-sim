/**
 * First-pass schema smoke coverage for ST30 / OP16 encodings.
 */

import { describe, expect, it } from "vitest";
import { evaluateCondition } from "../engine/conditions.js";
import { executeReturnToHand } from "../engine/effect-resolver/actions/removal.js";
import "../engine/effect-resolver/resolver.js";
import type { Action, EffectResult, RuntimeActiveEffect } from "../engine/effect-types.js";
import { resumeReplacementBatch, type ReplacementBatchResumeContext } from "../engine/replacements.js";
import { ST30_009_LITTLEOARS_JR } from "../engine/schemas/st30.js";
import { registerReplacementsForCard } from "../engine/triggers.js";
import type { CardData, CardInstance, GameState, KeywordSet, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function noKeywords(): KeywordSet {
  return {
    rush: false,
    rushCharacter: false,
    doubleAttack: false,
    banish: false,
    blocker: false,
    trigger: false,
    unblockable: false,
  };
}

function makeCharacter(id: string, name: string, power: number, effectSchema: CardData["effectSchema"] = null): CardData {
  return {
    id,
    name,
    type: "Character",
    color: ["Green"],
    cost: 5,
    power,
    counter: null,
    life: null,
    attribute: [],
    types: ["Whitebeard Pirates"],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema,
    imageUrl: null,
  };
}

function fieldInstance(cardId: string, instanceId: string): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

describe("ST30 / OP16 first-pass schema smoke", () => {
  it("ST30-009 trashes itself and draws 1 instead of removing a protected 6000-base Character", () => {
    const cardDb = createTestCardDb();
    const littleOars = makeCharacter("ST30-009", "LittleOars Jr.", 6000, ST30_009_LITTLEOARS_JR);
    const protectedAlly = makeCharacter("ALLY-6000", "Protected Ally", 6000);
    cardDb.set(littleOars.id, littleOars);
    cardDb.set(protectedAlly.id, protectedAlly);

    const base = createBattleReadyState(cardDb);
    const littleOarsInst = fieldInstance(littleOars.id, "littleoars");
    const allyInst = fieldInstance(protectedAlly.id, "ally-6000");
    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([littleOarsInst, allyInst]),
    };
    const stateWithCard: GameState = { ...base, players };
    const state = registerReplacementsForCard(stateWithCard, littleOarsInst, littleOars);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeReturnToHand(
      state,
      action,
      "opponent-effect-source",
      1,
      cardDb,
      new Map<string, EffectResult>(),
      [allyInst.instanceId],
    );

    expect(promptResult.pendingPrompt).toBeDefined();
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);

    const remainingIds = resumed.state.players[0].characters.filter(Boolean).map((c) => c!.instanceId);
    expect(remainingIds).toEqual([allyInst.instanceId]);
    expect(resumed.state.players[0].trash.some((c) => c.instanceId === littleOarsInst.instanceId)).toBe(false);
    expect(resumed.state.players[0].hand.some((c) => c.instanceId === allyInst.instanceId)).toBe(false);
    expect(resumed.events.some((e) => e.type === "CARD_DRAWN")).toBe(true);
  });

  it("OP16 support conditions cover leader name includes and effective self cost", () => {
    const cardDb = createTestCardDb();
    const aceLeader: CardData = {
      ...makeCharacter("LEADER-ACE", "Portgas.D.Ace", 5000),
      type: "Leader",
      cost: null,
      life: 5,
    };
    const momonosuke = makeCharacter("MOMO-SELF-COST", "Kouzuki Momonosuke", 1);
    cardDb.set(aceLeader.id, aceLeader);
    cardDb.set(momonosuke.id, momonosuke);

    const base = createBattleReadyState(cardDb);
    const momoInst = fieldInstance(momonosuke.id, "momo-self-cost");
    const leaderInst: CardInstance = {
      instanceId: "ace-leader",
      cardId: aceLeader.id,
      zone: "LEADER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
      controller: 0,
      owner: 0,
    };
    const costBuff: RuntimeActiveEffect = {
      id: "momo-cost-buff",
      sourceCardInstanceId: momoInst.instanceId,
      sourceEffectBlockId: "test-cost-buff",
      category: "activate",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 19 },
        },
      ],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: base.turn.number },
      controller: 0,
      appliesTo: [momoInst.instanceId],
      timestamp: Date.now(),
    };
    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader: leaderInst,
      characters: padChars([momoInst]),
    };
    const state: GameState = { ...base, players, activeEffects: [costBuff] };
    const ctx = { sourceCardInstanceId: momoInst.instanceId, controller: 0 as const, cardDb };

    expect(evaluateCondition(state, { type: "LEADER_PROPERTY", controller: "SELF", property: { name_includes: "Ace" } }, ctx)).toBe(true);
    expect(evaluateCondition(state, { type: "LEADER_PROPERTY", controller: "SELF", property: { name_includes: "Luffy" } }, ctx)).toBe(false);
    expect(evaluateCondition(state, { type: "SELF_COST", operator: ">=", value: 20 }, ctx)).toBe(true);
  });
});
