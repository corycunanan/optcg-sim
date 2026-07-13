/**
 * Effect-KO replacements — the effect-KO path must scan the general removal
 * replacement events (WOULD_BE_REMOVED_FROM_FIELD / WOULD_LEAVE_FIELD), not
 * just WOULD_BE_KO: KO-by-effect is a removal from the field.
 *
 * OP16-014 Marco: "If one of your Characters would be removed from the field
 * by your opponent's effect, you may K.O. this Character instead." Before
 * this fix Marco intercepted bounce/tuck but never opponent KO effects.
 */

import { describe, expect, it } from "vitest";
import { executeKO } from "../engine/effect-resolver/actions/removal.js";
import "../engine/effect-resolver/resolver.js";
import type { Action, EffectResult } from "../engine/effect-types.js";
import { resumeReplacementBatch, type ReplacementBatchResumeContext } from "../engine/replacements.js";
import { OP16_014_MARCO } from "../engine/schemas/op16.js";
import { registerReplacementsForCard } from "../engine/triggers.js";
import type { CardData, CardInstance, GameState, KeywordSet, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function noKeywords(): KeywordSet {
  return {
    rush: false, rushCharacter: false, doubleAttack: false, banish: false,
    blocker: false, trigger: false, unblockable: false,
  };
}

function makeCharacter(id: string, name: string, effectSchema: CardData["effectSchema"] = null): CardData {
  return {
    id, name, type: "Character", color: ["Blue"], cost: 4, power: 5000,
    counter: null, life: null, attribute: [], types: ["Whitebeard Pirates"],
    effectText: "", triggerText: null, keywords: noKeywords(), effectSchema, imageUrl: null,
  };
}

function fieldInstance(cardId: string, instanceId: string): CardInstance {
  return {
    instanceId, cardId, zone: "CHARACTER", state: "ACTIVE",
    attachedDon: [], turnPlayed: 1, controller: 0, owner: 0,
  };
}

describe("effect-KO scans removal-from-field replacements", () => {
  it("OP16-014 Marco may be K.O.'d instead of an ally targeted by an opponent KO effect", () => {
    const cardDb = createTestCardDb();
    const marco = makeCharacter("OP16-014", "Marco", OP16_014_MARCO);
    const ally = makeCharacter("ALLY", "Protected Ally");
    cardDb.set(marco.id, marco);
    cardDb.set(ally.id, ally);

    const base = createBattleReadyState(cardDb);
    const marcoInst = fieldInstance(marco.id, "marco");
    const allyInst = fieldInstance(ally.id, "ally");
    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([marcoInst, allyInst]) };
    const stateWithCards: GameState = { ...base, players };
    const state = registerReplacementsForCard(stateWithCards, marcoInst, marco);

    // Opponent (player 1) resolves "K.O. 1 opposing Character" targeting the ally.
    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeKO(
      state, action, "opponent-effect-source", 1, cardDb,
      new Map<string, EffectResult>(), [allyInst.instanceId],
    );

    // Marco's replacement is optional — the owner must be prompted.
    expect(promptResult.pendingPrompt).toBeDefined();
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);

    // Accepting: Marco is K.O.'d instead; the ally stays on the field.
    const remainingIds = resumed.state.players[0].characters.filter(Boolean).map((c) => c!.instanceId);
    expect(remainingIds).toEqual([allyInst.instanceId]);
    expect(resumed.state.players[0].trash.some((c) => c.instanceId === marcoInst.instanceId)).toBe(false);
  });

  it("declining leaves the original KO to resolve", () => {
    const cardDb = createTestCardDb();
    const marco = makeCharacter("OP16-014", "Marco", OP16_014_MARCO);
    const ally = makeCharacter("ALLY", "Protected Ally");
    cardDb.set(marco.id, marco);
    cardDb.set(ally.id, ally);

    const base = createBattleReadyState(cardDb);
    const marcoInst = fieldInstance(marco.id, "marco");
    const allyInst = fieldInstance(ally.id, "ally");
    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([marcoInst, allyInst]) };
    const state = registerReplacementsForCard({ ...base, players }, marcoInst, marco);

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeKO(
      state, action, "opponent-effect-source", 1, cardDb,
      new Map<string, EffectResult>(), [allyInst.instanceId],
    );
    expect(promptResult.pendingPrompt).toBeDefined();
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, false, cardDb);

    const remainingIds = resumed.state.players[0].characters.filter(Boolean).map((c) => c!.instanceId);
    expect(remainingIds).toEqual([marcoInst.instanceId]);
    expect(resumed.state.players[0].trash.some((c) => c.instanceId === allyInst.instanceId)).toBe(false);
  });
});
