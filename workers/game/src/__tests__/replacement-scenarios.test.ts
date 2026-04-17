/**
 * OPT-221: end-to-end replacement scenarios driving the action handlers
 * (executeKO / executeReturnToHand) through processBatchReplacements so we
 * exercise the same code paths the pipeline uses in a live game.
 *
 * Covers:
 *   - Tashigi (OP10-032) — single-target prompt, accept rests source / decline KOs ally
 *   - Ivankov-style TRASH_CARD substitute — source trashes itself
 *   - Koby-style (OP11-001) batch replacement — cost paid once, two Navy saved,
 *     non-Navy still returned; decline path; once-per-turn enforcement
 *   - OPT-232: SET_REST feasibility gate (prohibitions + rested filter targets)
 *   - OPT-233: Borsalino-style TRASH_FROM_HAND substitute — target survives,
 *     hand-trash payment emits CARD_TRASHED, empty-hand falls through; plus
 *     Ivankov-style event suppression (no CARD_KO for spared ally).
 *
 * Imports resolver.js for its side-effect: registering the replacement
 * action dispatcher via setReplacementDispatcher, which is required for
 * substitute actions (SET_REST, TRASH_CARD, RETURN_TO_DECK, ...) to run.
 */

import { describe, it, expect } from "vitest";
import { executeKO, executeReturnToHand } from "../engine/effect-resolver/actions/removal.js";
import { executeSetRest } from "../engine/effect-resolver/actions/play.js";
import { resumeReplacementBatch, type ReplacementBatchResumeContext } from "../engine/replacements.js";
import { registerReplacementsForCard } from "../engine/triggers.js";
import "../engine/effect-resolver/resolver.js"; // installs replacement dispatcher
import type { Action, EffectResult, RuntimeActiveEffect } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";
import { OP15_009_KOBY } from "../engine/schemas/op15.js";

// ─── Card data helpers ───────────────────────────────────────────────────────

function makeCharCard(id: string, name: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name,
    type: "Character",
    color: ["Green"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function fieldInstance(cardId: string, owner: 0 | 1, suffix: string): CardInstance {
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

// ─── Tashigi (OP10-032) ──────────────────────────────────────────────────────

describe("Tashigi — WOULD_BE_REMOVED_FROM_FIELD replacement prompts", () => {
  function buildTashigiState(cardDb: Map<string, CardData>) {
    const tashigi = makeCharCard("TASHIGI", "Tashigi", { color: ["Green"] });
    const greenAlly = makeCharCard("GREEN-ALLY", "GreenAlly", { color: ["Green"] });
    const redAlly = makeCharCard("RED-ALLY", "RedAlly", { color: ["Red"] });
    cardDb.set(tashigi.id, tashigi);
    cardDb.set(greenAlly.id, greenAlly);
    cardDb.set(redAlly.id, redAlly);

    const base = createBattleReadyState(cardDb);
    const tashigiInst = fieldInstance(tashigi.id, 0, "tashigi");
    const greenInst = fieldInstance(greenAlly.id, 0, "green");
    const redInst = fieldInstance(redAlly.id, 0, "red");

    const tashigiEffect: RuntimeActiveEffect = {
      id: "repl-tashigi",
      sourceCardInstanceId: tashigiInst.instanceId,
      sourceEffectBlockId: "tashigi-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_REMOVED_FROM_FIELD",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { color: "GREEN", exclude_name: "Tashigi", card_type: "CHARACTER" },
          replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [], // wildcard — target_filter decides
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([tashigiInst, greenInst, redInst]) };
    const state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [tashigiEffect as never],
    };
    return { state, ids: { tashigi: tashigiInst.instanceId, green: greenInst.instanceId, red: redInst.instanceId } };
  }

  it("prompts when opponent effect would return a green ally", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildTashigiState(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeReturnToHand(state, action, "opponent-source", 1, cardDb, new Map<string, EffectResult>(), [ids.green]);

    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt?.respondingPlayer).toBe(0);
    expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  });

  it("accepting rests Tashigi and spares the green ally", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildTashigiState(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeReturnToHand(state, action, "opponent-source", 1, cardDb, new Map<string, EffectResult>(), [ids.green]);
    expect(promptResult.pendingPrompt).toBeDefined();

    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);

    const tashigi = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.tashigi);
    const green = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.green);
    expect(tashigi?.state).toBe("RESTED");
    expect(green?.zone).toBe("CHARACTER"); // still on field
    expect(resumed.finalizedIds).toEqual([]);
  });

  it("declining returns the green ally to hand and leaves Tashigi active", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildTashigiState(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeReturnToHand(state, action, "opponent-source", 1, cardDb, new Map<string, EffectResult>(), [ids.green]);
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, false, cardDb);

    const tashigi = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.tashigi);
    expect(tashigi?.state).toBe("ACTIVE");
    expect(resumed.finalizedIds).toEqual([ids.green]);
    const green = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.green);
    expect(green).toBeUndefined(); // removed from field
    const greenInHand = resumed.state.players[0].hand.some((c) => c.instanceId === ids.green);
    expect(greenInHand).toBe(true);
  });

  it("does not prompt when the non-green target is hit (filter rejects)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildTashigiState(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeReturnToHand(state, action, "opponent-source", 1, cardDb, new Map<string, EffectResult>(), [ids.red]);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.result?.targetInstanceIds).toEqual([ids.red]);
  });

  it("does not prompt when Tashigi herself is the target (self-excluded)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildTashigiState(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeReturnToHand(state, action, "opponent-source", 1, cardDb, new Map<string, EffectResult>(), [ids.tashigi]);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.result?.targetInstanceIds).toEqual([ids.tashigi]);
  });
});

// ─── Ivankov-style (TRASH_CARD substitute) ──────────────────────────────────

describe("Ivankov-style — TRASH_CARD self substitute on WOULD_BE_KO", () => {
  function buildIvankovState(cardDb: Map<string, CardData>) {
    const ivankov = makeCharCard("IVANKOV", "Emporio Ivankov", { color: ["Green"] });
    const ally = makeCharCard("REV-ALLY", "RevAlly", { color: ["Green"] });
    cardDb.set(ivankov.id, ivankov);
    cardDb.set(ally.id, ally);

    const base = createBattleReadyState(cardDb);
    const ivankovInst = fieldInstance(ivankov.id, 0, "ivan");
    const allyInst = fieldInstance(ally.id, 0, "rev");

    const effect: RuntimeActiveEffect = {
      id: "repl-ivankov",
      sourceCardInstanceId: ivankovInst.instanceId,
      sourceEffectBlockId: "ivan-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER", exclude_self: true },
          replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([ivankovInst, allyInst]) };
    const state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [effect as never],
    };
    return { state, ids: { ivankov: ivankovInst.instanceId, ally: allyInst.instanceId } };
  }

  it("accepting trashes Ivankov and spares the ally", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildIvankovState(cardDb);

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.ally]);
    expect(promptResult.pendingPrompt).toBeDefined();

    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);

    const ivan = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.ivankov);
    const ally = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.ally);
    expect(ivan).toBeUndefined(); // trashed off the field
    expect(ally?.zone).toBe("CHARACTER"); // survived
    const inTrash = resumed.state.players[0].trash.some((c) => c.instanceId === ids.ivankov);
    expect(inTrash).toBe(true);
  });
});

// ─── Koby-style batch replacement (OPT-219) ─────────────────────────────────
//
// Koby (OP11-001) reads: "once per turn, when your Navy ≤7000 characters would
// leave the field by your opponent's effect, you may return 3 cards from your
// trash to the bottom of your deck, and they don't leave instead". The engine
// invariants under test here:
//
//   1. One prompt, one substitute invocation per event — even when multiple
//      targets match (rule 6-6-3 + OP11 Koby FAQ).
//   2. Only matching targets (Navy ≤7000) are protected; the rest proceed.
//   3. `once_per_turn` is marked exactly once per accepted prompt (the engine-
//      visible proxy for "cost paid once").
//
// The substitute here is `SET_REST` on SELF (rest the Koby leader). A real
// Koby moves 3 trash → deck bottom, but `returnToDeck` in card-mutations only
// handles field → deck today. Verifying the batch flow only requires an
// observable state change; the exact substitute isn't the contract we're
// testing, and swapping in SET_REST keeps the test focused on batch behaviour.

describe("Koby-style — batch replacement with cost paid once", () => {
  function buildKobyState(cardDb: Map<string, CardData>) {
    const kobyLeader = makeCharCard("KOBY-LEADER", "Koby", { type: "Leader", color: ["Red"], power: 5000, cost: null, life: 5 });
    const navyA = makeCharCard("NAVY-A", "NavyA", { types: ["Navy"], power: 6000 });
    const navyB = makeCharCard("NAVY-B", "NavyB", { types: ["Navy"], power: 7000 });
    const nonNavy = makeCharCard("NON-NAVY", "NonNavy", { types: ["Straw Hat Crew"], power: 4000 });
    for (const c of [kobyLeader, navyA, navyB, nonNavy]) cardDb.set(c.id, c);

    const base = createBattleReadyState(cardDb);
    const navyAInst = fieldInstance(navyA.id, 0, "navy-a");
    const navyBInst = fieldInstance(navyB.id, 0, "navy-b");
    const nonNavyInst = fieldInstance(nonNavy.id, 0, "non-navy");

    const kobyLeaderInst: CardInstance = {
      instanceId: "koby-leader",
      cardId: kobyLeader.id,
      zone: "LEADER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
      controller: 0,
      owner: 0,
    };

    const effect: RuntimeActiveEffect = {
      id: "repl-koby",
      sourceCardInstanceId: kobyLeaderInst.instanceId,
      sourceEffectBlockId: "koby-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_REMOVED_FROM_FIELD",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER", traits: ["Navy"], base_power_max: 7000 },
          replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
          optional: true,
          once_per_turn: true,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      leader: kobyLeaderInst,
      characters: padChars([navyAInst, navyBInst, nonNavyInst]),
    };
    const state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [effect as never],
    };
    return {
      state,
      ids: {
        navyA: navyAInst.instanceId,
        navyB: navyBInst.instanceId,
        nonNavy: nonNavyInst.instanceId,
        koby: kobyLeaderInst.instanceId,
      },
    };
  }

  function findEffect(state: GameState, effectId: string): RuntimeActiveEffect | undefined {
    return (state.activeEffects as RuntimeActiveEffect[]).find((e) => e.id === effectId);
  }

  function getUsedOnTurn(state: GameState, effectId: string): number | undefined {
    const effect = findEffect(state, effectId);
    const mod = effect?.modifiers?.find((m) => m.type === "REPLACEMENT_EFFECT");
    return (mod?.params as Record<string, unknown> | undefined)?.usedOnTurn as number | undefined;
  }

  it("scans the whole target set once and prompts exactly once for 2 Navy matches", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildKobyState(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 3 } },
    };
    const result = executeReturnToHand(
      state, action, "kaido-source", 1, cardDb, new Map<string, EffectResult>(),
      [ids.navyA, ids.navyB, ids.nonNavy],
    );

    expect(result.pendingPrompt).toBeDefined();
    const ctx = result.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    expect(ctx.type).toBe("REPLACEMENT_BATCH");
    expect(ctx.pendingMatches).toHaveLength(1);
    expect(ctx.pendingMatches[0].matchedTargetIds.sort()).toEqual([ids.navyA, ids.navyB].sort());
    expect(ctx.allTargetIds).toHaveLength(3);
  });

  it("accepting pays cost once and saves both Navy characters; non-Navy is still returned", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildKobyState(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 3 } },
    };
    const promptResult = executeReturnToHand(
      state, action, "kaido-source", 1, cardDb, new Map<string, EffectResult>(),
      [ids.navyA, ids.navyB, ids.nonNavy],
    );
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);

    // Both Navy saved; non-Navy returned
    const remainingIds = resumed.state.players[0].characters.filter(Boolean).map((c) => c!.instanceId).sort();
    expect(remainingIds).toEqual([ids.navyA, ids.navyB].sort());
    expect(resumed.state.players[0].hand.some((c) => c.instanceId === ids.nonNavy)).toBe(true);

    // Cost paid once — the Koby leader was rested once and the replacement is
    // marked as used on the current turn, regardless of match count.
    expect(resumed.state.players[0].leader?.state).toBe("RESTED");
    expect(getUsedOnTurn(resumed.state, "repl-koby")).toBe(state.turn.number);
  });

  it("declining returns all three characters, leaves Koby active, does not mark as used", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildKobyState(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 3 } },
    };
    const promptResult = executeReturnToHand(
      state, action, "kaido-source", 1, cardDb, new Map<string, EffectResult>(),
      [ids.navyA, ids.navyB, ids.nonNavy],
    );
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, false, cardDb);

    // All three removed from field and now in hand
    expect(resumed.state.players[0].characters.filter(Boolean)).toHaveLength(0);
    for (const id of [ids.navyA, ids.navyB, ids.nonNavy]) {
      expect(resumed.state.players[0].hand.some((c) => c.instanceId === id)).toBe(true);
    }
    expect(resumed.state.players[0].leader?.state).toBe("ACTIVE");
    expect(getUsedOnTurn(resumed.state, "repl-koby")).toBeUndefined();
  });
});

// ─── Batch replacement cost count is independent of target count ────────────

describe("Batch replacement — cost paid once no matter how many targets", () => {
  function buildSingleTargetKoby(cardDb: Map<string, CardData>) {
    const kobyLeader = makeCharCard("KOBY-LEADER", "Koby", { type: "Leader", color: ["Red"], power: 5000, cost: null, life: 5 });
    const navyA = makeCharCard("NAVY-A", "NavyA", { types: ["Navy"], power: 6000 });
    for (const c of [kobyLeader, navyA]) cardDb.set(c.id, c);

    const base = createBattleReadyState(cardDb);
    const navyAInst = fieldInstance(navyA.id, 0, "na");
    const kobyLeaderInst: CardInstance = {
      instanceId: "koby-leader", cardId: kobyLeader.id, zone: "LEADER",
      state: "ACTIVE", attachedDon: [], turnPlayed: 0, controller: 0, owner: 0,
    };
    const effect: RuntimeActiveEffect = {
      id: "repl-koby", sourceCardInstanceId: kobyLeaderInst.instanceId, sourceEffectBlockId: "koby-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_REMOVED_FROM_FIELD",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER", traits: ["Navy"], base_power_max: 7000 },
          replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
          optional: true,
          once_per_turn: true,
        },
      }],
      duration: { type: "PERMANENT" }, expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0, appliesTo: [], timestamp: Date.now(),
    };
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      leader: kobyLeaderInst,
      characters: padChars([navyAInst]),
    };
    const state: GameState = { ...base, players: newPlayers, activeEffects: [effect as never] };
    return { state, navyA: navyAInst.instanceId };
  }

  it("substitute fires exactly once whether 1 or many Navy targets match", () => {
    const cardDb = createTestCardDb();
    const { state, navyA } = buildSingleTargetKoby(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeReturnToHand(
      state, action, "kaido-source", 1, cardDb, new Map<string, EffectResult>(),
      [navyA],
    );
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);

    expect(resumed.state.players[0].leader?.state).toBe("RESTED");
    const effect = (resumed.state.activeEffects as RuntimeActiveEffect[]).find((e) => e.id === "repl-koby");
    const mod = effect?.modifiers?.find((m) => m.type === "REPLACEMENT_EFFECT");
    expect((mod?.params as Record<string, unknown>)?.usedOnTurn).toBe(state.turn.number);
  });
});

// ─── PRB02-006 Roronoa Zoro — WOULD_BE_RESTED (OPT-222) ─────────────────────
//
// "[Opponent's Turn] If this Character would be rested by your opponent's
// Character's effect, you may rest 1 of your other Characters instead."
//
// Wires the WOULD_BE_RESTED replacement path through executeSetRest. The
// batch flow is reused (actionKind "SET_REST") so single- and multi-target
// rest effects both run through one scan with decline semantics that fall
// through to the normal per-frame rest loop.

describe("Roronoa Zoro (PRB02-006) — WOULD_BE_RESTED replacement", () => {
  function buildZoroState(cardDb: Map<string, CardData>) {
    const zoro = makeCharCard("PRB02-006", "Roronoa Zoro", { color: ["Green"], power: 5000 });
    const ally = makeCharCard("GREEN-ALLY", "GreenAlly", { color: ["Green"], power: 4000 });
    cardDb.set(zoro.id, zoro);
    cardDb.set(ally.id, ally);

    const base = createBattleReadyState(cardDb);
    const zoroInst = fieldInstance(zoro.id, 0, "zoro");
    const allyInst = fieldInstance(ally.id, 0, "ally");

    const effect: RuntimeActiveEffect = {
      id: "repl-zoro",
      sourceCardInstanceId: zoroInst.instanceId,
      sourceEffectBlockId: "rest_replacement",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_RESTED",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: null,
          replacement_actions: [{
            type: "SET_REST",
            target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 }, filter: { exclude_self: true } },
          }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [zoroInst.instanceId], // self-only: no target_filter → whitelist Zoro
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([zoroInst, allyInst]) };
    const state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [effect as never],
    };
    return { state, ids: { zoro: zoroInst.instanceId, ally: allyInst.instanceId } };
  }

  it("prompts Zoro's controller when an opponent effect would rest Zoro", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildZoroState(cardDb);

    const action: Action = {
      type: "SET_REST",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeSetRest(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.zoro]);

    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt?.respondingPlayer).toBe(0);
    const ctx = result.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    expect(ctx.type).toBe("REPLACEMENT_BATCH");
    expect(ctx.actionKind).toBe("SET_REST");
    expect(ctx.pendingMatches).toHaveLength(1);
    expect(ctx.pendingMatches[0].matchedTargetIds).toEqual([ids.zoro]);
  });

  it("accepting keeps Zoro active and rests the chosen other character instead", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildZoroState(cardDb);

    const action: Action = {
      type: "SET_REST",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeSetRest(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.zoro]);
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);

    const zoro = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.zoro);
    const ally = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.ally);
    expect(zoro?.state).toBe("ACTIVE");
    expect(ally?.state).toBe("RESTED");
  });

  it("declining rests Zoro normally and leaves the ally active", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildZoroState(cardDb);

    const action: Action = {
      type: "SET_REST",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeSetRest(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.zoro]);
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, false, cardDb);

    const zoro = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.zoro);
    const ally = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.ally);
    expect(zoro?.state).toBe("RESTED");
    expect(ally?.state).toBe("ACTIVE");
    expect(resumed.finalizedIds).toEqual([ids.zoro]);
  });

  it("does not prompt when the source is a self effect (cause_filter rejects)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildZoroState(cardDb);

    // Self-initiated rest: controller = 0, same as Zoro's owner → OPPONENT_EFFECT denies.
    const action: Action = {
      type: "SET_REST",
      target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } },
    };
    const result = executeSetRest(state, action, "self-source", 0, cardDb, new Map<string, EffectResult>(), [ids.zoro]);

    expect(result.pendingPrompt).toBeUndefined();
    const zoro = result.state.players[0].characters.find((c) => c?.instanceId === ids.zoro);
    expect(zoro?.state).toBe("RESTED");
  });
});

// ─── OPT-232: replacement-action feasibility gate ────────────────────────────
//
// Rules §6-6-3: a replacement only applies if its substitute can actually
// resolve. For rest-instead-of-KO replacements that means the source must be
// ACTIVE and not under a CANNOT_BE_RESTED prohibition. Infeasible matches must
// fall through to the original consequence without surfacing a prompt.

describe("Feasibility gate — rest-instead-of-KO declines when SET_REST cannot succeed", () => {
  function buildTashigiReplacementOnState(
    cardDb: Map<string, CardData>,
    opts: { tashigiState: "ACTIVE" | "RESTED"; tashigiProhibited?: boolean },
  ) {
    const tashigi = makeCharCard("TASHIGI", "Tashigi", { color: ["Green"] });
    const greenAlly = makeCharCard("GREEN-ALLY", "GreenAlly", { color: ["Green"] });
    cardDb.set(tashigi.id, tashigi);
    cardDb.set(greenAlly.id, greenAlly);

    const base = createBattleReadyState(cardDb);
    const tashigiInst: CardInstance = { ...fieldInstance(tashigi.id, 0, "tashigi"), state: opts.tashigiState };
    const greenInst = fieldInstance(greenAlly.id, 0, "green");

    const tashigiEffect: RuntimeActiveEffect = {
      id: "repl-tashigi",
      sourceCardInstanceId: tashigiInst.instanceId,
      sourceEffectBlockId: "tashigi-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { color: "GREEN", exclude_name: "Tashigi", card_type: "CHARACTER" },
          replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const prohibitions = opts.tashigiProhibited
      ? [{
          id: "prohib-no-rest",
          sourceCardInstanceId: "src",
          sourceEffectBlockId: "block",
          prohibitionType: "CANNOT_BE_RESTED" as const,
          controller: 1 as 0 | 1,
          appliesTo: [tashigiInst.instanceId],
          scope: {},
          duration: { type: "PERMANENT" as const },
          expiresAt: { wave: "SOURCE_LEAVES_ZONE" as const },
          usesRemaining: null,
          conditionalOverride: null,
          timestamp: Date.now(),
        }]
      : [];

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([tashigiInst, greenInst]) };
    const state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [tashigiEffect as never],
      prohibitions: prohibitions as never,
    };
    return { state, ids: { tashigi: tashigiInst.instanceId, green: greenInst.instanceId } };
  }

  it("falls through to KO when Tashigi is already RESTED (no prompt)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildTashigiReplacementOnState(cardDb, { tashigiState: "RESTED" });

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.green]);

    expect(result.pendingPrompt).toBeUndefined();
    // Green ally KO'd normally.
    expect(result.state.players[0].characters.find((c) => c?.instanceId === ids.green)).toBeUndefined();
    expect(result.state.players[0].trash.some((c) => c.instanceId === ids.green)).toBe(true);
    // Tashigi unchanged by the replacement.
    const tashigi = result.state.players[0].characters.find((c) => c?.instanceId === ids.tashigi);
    expect(tashigi?.state).toBe("RESTED");
  });

  it("falls through to KO when Tashigi is under CANNOT_BE_RESTED (no prompt)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildTashigiReplacementOnState(cardDb, {
      tashigiState: "ACTIVE",
      tashigiProhibited: true,
    });

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.green]);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].characters.find((c) => c?.instanceId === ids.green)).toBeUndefined();
    const tashigi = result.state.players[0].characters.find((c) => c?.instanceId === ids.tashigi);
    expect(tashigi?.state).toBe("ACTIVE");
  });

  it("still prompts when Tashigi is ACTIVE (regression guard)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildTashigiReplacementOnState(cardDb, { tashigiState: "ACTIVE" });

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.green]);

    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt?.respondingPlayer).toBe(0);
  });
});

describe("Feasibility gate — Pica-style filter-target rest falls through with no candidates", () => {
  // Pica (OP05-032): "if this Character would be K.O.'d, you may rest up to 1
  // of your Characters with cost 3+ other than [Pica] instead." If no eligible
  // ally exists, the replacement must decline and Pica is K.O.'d.
  function buildPicaState(
    cardDb: Map<string, CardData>,
    opts: { allyCost: number; allyState: "ACTIVE" | "RESTED" },
  ) {
    const pica = makeCharCard("PICA", "Pica", { color: ["Purple"], cost: 5 });
    const ally = makeCharCard("ALLY", "AllyDude", { color: ["Purple"], cost: opts.allyCost });
    cardDb.set(pica.id, pica);
    cardDb.set(ally.id, ally);

    const base = createBattleReadyState(cardDb);
    const picaInst = fieldInstance(pica.id, 0, "pica");
    const allyInst: CardInstance = { ...fieldInstance(ally.id, 0, "ally"), state: opts.allyState };

    const effect: RuntimeActiveEffect = {
      id: "repl-pica",
      sourceCardInstanceId: picaInst.instanceId,
      sourceEffectBlockId: "pica-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "ANY" },
          target_filter: null,
          replacement_actions: [{
            type: "SET_REST",
            target: {
              type: "CHARACTER",
              controller: "SELF",
              count: { up_to: 1 },
              filter: { cost_min: 3, exclude_name: "Pica" },
            },
          }],
          optional: true,
          once_per_turn: true,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [picaInst.instanceId], // self-protect
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([picaInst, allyInst]) };
    const state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [effect as never],
    };
    return { state, ids: { pica: picaInst.instanceId, ally: allyInst.instanceId } };
  }

  it("declines when the only ally is below cost_min (no prompt)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildPicaState(cardDb, { allyCost: 2, allyState: "ACTIVE" });

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.pica]);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].characters.find((c) => c?.instanceId === ids.pica)).toBeUndefined();
  });

  it("declines when every eligible ally is already RESTED (no prompt)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildPicaState(cardDb, { allyCost: 4, allyState: "RESTED" });

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.pica]);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].characters.find((c) => c?.instanceId === ids.pica)).toBeUndefined();
  });

  it("prompts when at least one ACTIVE ally meets cost_min (regression guard)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildPicaState(cardDb, { allyCost: 4, allyState: "ACTIVE" });

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.pica]);

    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt?.respondingPlayer).toBe(0);
  });
});

// ─── OPT-233: Borsalino-style TRASH_FROM_HAND replacement ────────────────────
//
// B3 pattern from rules §6-6-3: "If this Character would be removed from the
// field by your opponent's effect, trash 1 card from your hand instead." The
// character is NOT K.O.'d/removed — so no CARD_KO / CARD_RETURNED_TO_HAND
// event fires and ON_KO watchers don't see it. The only state change is the
// hand-trash payment.
//
// Invariants locked in here:
//   1. Accepting the replacement keeps the target on the field in its prior
//      state and emits zero removal events for it.
//   2. The hand-trash payment emits CARD_TRASHED for the discarded hand card.
//   3. Empty hand → canPayReplacementCost rejects → no prompt, removal
//      proceeds as written (B2 fall-through).

describe("Borsalino-style — TRASH_FROM_HAND substitute on WOULD_BE_REMOVED_FROM_FIELD", () => {
  function buildBorsalinoState(cardDb: Map<string, CardData>, handSize: number) {
    const borsalino = makeCharCard("BORSALINO", "Borsalino", { color: ["Yellow"], types: ["Navy"] });
    const handFiller = makeCharCard("HAND-FILLER", "HandFiller", { color: ["Yellow"] });
    cardDb.set(borsalino.id, borsalino);
    cardDb.set(handFiller.id, handFiller);

    const base = createBattleReadyState(cardDb);
    const borsalinoInst = fieldInstance(borsalino.id, 0, "bors");

    const handCards: CardInstance[] = Array.from({ length: handSize }, (_, i) => ({
      instanceId: `hand-p0-${i}`,
      cardId: handFiller.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
      controller: 0,
      owner: 0,
    }));

    const effect: RuntimeActiveEffect = {
      id: "repl-borsalino",
      sourceCardInstanceId: borsalinoInst.instanceId,
      sourceEffectBlockId: "bors-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_REMOVED_FROM_FIELD",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER" },
          replacement_actions: [{
            type: "TRASH_FROM_HAND",
            target: { type: "CARD_IN_HAND", controller: "SELF", count: { exact: 1 } },
            params: { amount: 1 },
          }],
          optional: true,
          once_per_turn: true,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([borsalinoInst]), hand: handCards };
    const state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [effect as never],
    };
    return { state, ids: { borsalino: borsalinoInst.instanceId, handCards: handCards.map((c) => c.instanceId) } };
  }

  it("accepting keeps Borsalino on field, trashes a hand card, emits no removal events", () => {
    const cardDb = createTestCardDb();
    // Hand size 1 so the nested TRASH_FROM_HAND auto-selects without prompting
    // (the replacement batch resolver doesn't chain a secondary prompt within
    // a single substitute step).
    const { state, ids } = buildBorsalinoState(cardDb, 1);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeReturnToHand(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.borsalino]);
    expect(promptResult.pendingPrompt).toBeDefined();

    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);

    // Borsalino survives on the field in its prior state.
    const bors = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.borsalino);
    expect(bors?.zone).toBe("CHARACTER");
    expect(bors?.state).toBe("ACTIVE");

    // Hand emptied; trash gained the hand card.
    expect(resumed.state.players[0].hand).toHaveLength(0);
    expect(resumed.state.players[0].trash).toHaveLength(1);
    expect(resumed.state.players[0].trash[0].instanceId).toBe(ids.handCards[0]);

    // No CARD_RETURNED_TO_HAND / CARD_KO for the protected target.
    const allEvents = [...promptResult.events, ...resumed.events];
    const removedForBors = allEvents.some((e) => {
      if (e.type !== "CARD_RETURNED_TO_HAND" && e.type !== "CARD_KO") return false;
      const payload = e.payload as { cardInstanceId?: string } | undefined;
      return payload?.cardInstanceId === ids.borsalino;
    });
    expect(removedForBors).toBe(false);

    // Hand-trash payment emits a CARD_TRASHED event.
    const trashedEvent = resumed.events.find((e) => e.type === "CARD_TRASHED");
    expect(trashedEvent).toBeDefined();
  });

  it("declining returns Borsalino to hand normally and leaves the trash untouched", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildBorsalinoState(cardDb, 1);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeReturnToHand(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.borsalino]);
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, false, cardDb);

    // Borsalino left the field and entered the hand; trash untouched.
    const bors = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.borsalino);
    expect(bors).toBeUndefined();
    expect(resumed.state.players[0].hand).toHaveLength(2); // 1 filler + Borsalino
    expect(resumed.state.players[0].trash).toHaveLength(0);
  });

  it("empty hand falls through: no prompt, Borsalino returned to hand as written", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildBorsalinoState(cardDb, 0);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeReturnToHand(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.borsalino]);

    expect(result.pendingPrompt).toBeUndefined();
    const bors = result.state.players[0].characters.find((c) => c?.instanceId === ids.borsalino);
    expect(bors).toBeUndefined();
    const returned = result.events.some((e) => {
      if (e.type !== "CARD_RETURNED_TO_HAND") return false;
      const payload = e.payload as { cardInstanceId?: string } | undefined;
      return payload?.cardInstanceId === ids.borsalino;
    });
    expect(returned).toBe(true);
  });
});

// ─── OPT-233: event suppression for self-trash replacements ─────────────────
//
// Extends the Ivankov-style coverage: when the ally is spared by a replacement,
// the engine must not emit CARD_KO for that ally. ON_KO triggers key off
// CARD_KO events (see triggers.ts), so their non-firing is a direct consequence
// of event suppression.

describe("OPT-233 — spared targets emit no CARD_KO event", () => {
  it("Ivankov-style: ally saved, no CARD_KO event for ally, no KO event for Ivankov", () => {
    const cardDb = createTestCardDb();
    const ivankov = makeCharCard("IVANKOV-233", "Emporio Ivankov", { color: ["Green"] });
    const ally = makeCharCard("REV-ALLY-233", "RevAlly", { color: ["Green"] });
    cardDb.set(ivankov.id, ivankov);
    cardDb.set(ally.id, ally);

    const base = createBattleReadyState(cardDb);
    const ivankovInst = fieldInstance(ivankov.id, 0, "ivan233");
    const allyInst = fieldInstance(ally.id, 0, "rev233");

    const effect: RuntimeActiveEffect = {
      id: "repl-ivankov-233",
      sourceCardInstanceId: ivankovInst.instanceId,
      sourceEffectBlockId: "ivan-233-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER", exclude_self: true },
          replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([ivankovInst, allyInst]) };
    const state: GameState = { ...base, players: newPlayers, activeEffects: [effect as never] };

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeKO(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [allyInst.instanceId]);
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);

    const allEvents = [...promptResult.events, ...resumed.events];
    const koEvents = allEvents.filter((e) => e.type === "CARD_KO");
    // The ally was spared; Ivankov is trashed via TRASH_CARD (not KO).
    for (const e of koEvents) {
      const payload = e.payload as { cardInstanceId?: string } | undefined;
      expect(payload?.cardInstanceId).not.toBe(allyInst.instanceId);
      expect(payload?.cardInstanceId).not.toBe(ivankovInst.instanceId);
    }
  });
});

// ─── OPT-234: Flip-Life-instead-of-removal feasibility gate ─────────────────
//
// Shirahoshi (OP12-102) / Bonney (OP13-109) pattern: "If this Character would
// be removed from the field by your opponent's effect, you may turn 1 card
// from the top of your Life cards face-up instead." Per the Bandai ruling
// cited in OPT-234, the replacement is infeasible when every Life card is
// already face-up (or the Life pile is empty) — the removal must then proceed
// without surfacing a prompt.

describe("Feasibility gate — flip-Life-instead-of-removal declines without face-down Life", () => {
  function buildShirahoshiState(
    cardDb: Map<string, CardData>,
    opts: { faceDownCount: number; faceUpCount: number },
  ) {
    const shirahoshi = makeCharCard("OP12-102-TEST", "Shirahoshi", { color: ["Yellow"], cost: 2 });
    const ally = makeCharCard("NEPTUNIAN-ALLY", "NeptAlly", { color: ["Yellow"], cost: 4 });
    cardDb.set(shirahoshi.id, shirahoshi);
    cardDb.set(ally.id, ally);

    const base = createBattleReadyState(cardDb);
    const shirahoshiInst = fieldInstance(shirahoshi.id, 0, "shirahoshi");
    const allyInst = fieldInstance(ally.id, 0, "nept-ally");

    const life = [
      ...Array.from({ length: opts.faceDownCount }, (_, i) => ({
        instanceId: `life-p0-down-${i}`,
        cardId: ally.id,
        face: "DOWN" as const,
      })),
      ...Array.from({ length: opts.faceUpCount }, (_, i) => ({
        instanceId: `life-p0-up-${i}`,
        cardId: ally.id,
        face: "UP" as const,
      })),
    ];

    const effect: RuntimeActiveEffect = {
      id: "repl-shirahoshi",
      sourceCardInstanceId: shirahoshiInst.instanceId,
      sourceEffectBlockId: "OP12-102_replacement",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_REMOVED_FROM_FIELD",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER", base_cost_max: 6 },
          replacement_actions: [{ type: "TURN_LIFE_FACE_UP", params: { amount: 1, position: "TOP" } }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars([shirahoshiInst, allyInst]),
      life,
    };
    const state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [effect as never],
    };
    return { state, ids: { shirahoshi: shirahoshiInst.instanceId, ally: allyInst.instanceId } };
  }

  it("prompts when at least one face-down Life exists (regression guard)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildShirahoshiState(cardDb, { faceDownCount: 3, faceUpCount: 0 });

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeReturnToHand(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.ally]);

    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt?.respondingPlayer).toBe(0);
  });

  it("accepting flips the top Life face-up and spares the character", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildShirahoshiState(cardDb, { faceDownCount: 3, faceUpCount: 0 });

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const promptResult = executeReturnToHand(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.ally]);
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);

    // Ally stayed on the field; Life[0] flipped face-up; remainder still face-down.
    const ally = resumed.state.players[0].characters.find((c) => c?.instanceId === ids.ally);
    expect(ally?.zone).toBe("CHARACTER");
    expect(resumed.state.players[0].life[0].face).toBe("UP");
    expect(resumed.state.players[0].life.slice(1).every((l) => l.face === "DOWN")).toBe(true);
    expect(resumed.finalizedIds).toEqual([]);
  });

  it("falls through to removal when every Life is already face-up (no prompt)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildShirahoshiState(cardDb, { faceDownCount: 0, faceUpCount: 3 });

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeReturnToHand(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.ally]);

    expect(result.pendingPrompt).toBeUndefined();
    // Ally removed from field and returned to hand normally.
    expect(result.state.players[0].characters.find((c) => c?.instanceId === ids.ally)).toBeUndefined();
    expect(result.state.players[0].hand.some((c) => c.instanceId === ids.ally)).toBe(true);
    // Life untouched.
    expect(result.state.players[0].life.every((l) => l.face === "UP")).toBe(true);
    expect(result.state.players[0].life).toHaveLength(3);
  });

  it("falls through to removal when the Life pile is empty (no prompt)", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildShirahoshiState(cardDb, { faceDownCount: 0, faceUpCount: 0 });

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeReturnToHand(state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.ally]);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].characters.find((c) => c?.instanceId === ids.ally)).toBeUndefined();
    expect(result.state.players[0].life).toHaveLength(0);
  });

  it("still prompts when only a bottom Life is face-down (global face-down predicate)", () => {
    // Bandai's infeasibility wording is "all Life face-up" — a single face-down
    // card anywhere in the pile keeps the replacement feasible, even if the
    // substitute's position=TOP would flip an already face-up card.
    const cardDb = createTestCardDb();
    const { state, ids } = buildShirahoshiState(cardDb, { faceDownCount: 0, faceUpCount: 2 });
    const stateWithOneDown: GameState = {
      ...state,
      players: [
        {
          ...state.players[0],
          life: [
            ...state.players[0].life,
            { instanceId: "life-p0-tail-down", cardId: "anything", face: "DOWN" as const },
          ],
        },
        state.players[1],
      ],
    };

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeReturnToHand(stateWithOneDown, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(), [ids.ally]);

    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt?.respondingPlayer).toBe(0);
  });
});

// ─── OPT-231: "pay once, save both" beyond what Koby covers ─────────────────
//
// OPT-219 shipped the batch scan (one replacement covers many targets, cost
// paid once). The Koby tests above lock that in for the common case where the
// replacement source is OFF the target set. This section exercises three
// scenarios the earlier tests don't reach:
//
//   1. Self-inclusion — the replacement source itself matches the filter and
//      sits inside the removal batch. The substitute must still fire exactly
//      once, and the source must survive along with the other matches.
//   2. Two back-to-back removal events. A replacement WITHOUT once_per_turn
//      fires independently for each event (two payments). A replacement WITH
//      once_per_turn fires on the first event only; the second falls through.
//   3. Real-schema round trip — OP15-009 Koby is encoded as
//      `category: "replacement"` in op15.ts. This test drives its schema
//      through `registerReplacementsForCard` so we lock in the
//      encoding → runtime path rather than relying on hand-built
//      RuntimeActiveEffects.

describe("OPT-231 — self-inclusion in batch replacement", () => {
  // Laboon-style: "If your Character with 7000 base power or less would be
  // removed from the field by your opponent's effect, you may rest 2 of your
  // cards instead." Laboon itself is a low-power Character, so it's inside
  // its own filter — and if the batch includes Laboon, the batch scan should
  // cover it, not exclude the source.
  function buildLaboonState(cardDb: Map<string, CardData>) {
    const laboon = makeCharCard("LABOON", "Laboon", { color: ["Green"], power: 1000 });
    const ally = makeCharCard("WEAK-ALLY", "WeakAlly", { color: ["Green"], power: 3000 });
    cardDb.set(laboon.id, laboon);
    cardDb.set(ally.id, ally);

    const base = createBattleReadyState(cardDb);
    const laboonInst = fieldInstance(laboon.id, 0, "laboon");
    const allyAInst = fieldInstance(ally.id, 0, "ally-a");
    const allyBInst = fieldInstance(ally.id, 0, "ally-b");

    const effect: RuntimeActiveEffect = {
      id: "repl-laboon",
      sourceCardInstanceId: laboonInst.instanceId,
      sourceEffectBlockId: "laboon-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_REMOVED_FROM_FIELD",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER", base_power_max: 7000 },
          // Substitute targets the leader instead of chars, so running it once
          // has no bearing on which chars in the batch get protected — we can
          // read `protectedIds` cleanly as the save contract.
          replacement_actions: [{
            type: "MODIFY_POWER",
            target: { type: "YOUR_LEADER" },
            params: { amount: -2000 },
            duration: { type: "THIS_TURN" },
          }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [], // target_filter present → wildcard at registration
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars([laboonInst, allyAInst, allyBInst]),
    };
    const state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [effect as never],
    };
    return {
      state,
      ids: {
        laboon: laboonInst.instanceId,
        allyA: allyAInst.instanceId,
        allyB: allyBInst.instanceId,
      },
    };
  }

  it("includes the replacement source in matchedTargetIds when the filter catches it", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildLaboonState(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 3 } },
    };
    const result = executeReturnToHand(
      state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(),
      [ids.laboon, ids.allyA, ids.allyB],
    );

    expect(result.pendingPrompt).toBeDefined();
    const ctx = result.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    expect(ctx.pendingMatches).toHaveLength(1);
    expect(ctx.pendingMatches[0].matchedTargetIds.sort()).toEqual(
      [ids.laboon, ids.allyA, ids.allyB].sort(),
    );
  });

  it("accepting saves every matched target including the source; substitute fires once", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildLaboonState(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 3 } },
    };
    const promptResult = executeReturnToHand(
      state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(),
      [ids.laboon, ids.allyA, ids.allyB],
    );
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);

    // All three chars survive — Laboon was in the batch but the replacement
    // covered itself, so protectedIds contains the source.
    expect(resumed.protectedIds.sort()).toEqual([ids.laboon, ids.allyA, ids.allyB].sort());
    expect(resumed.finalizedIds).toEqual([]);
    const remaining = resumed.state.players[0].characters.filter(Boolean).map((c) => c!.instanceId).sort();
    expect(remaining).toEqual([ids.laboon, ids.allyA, ids.allyB].sort());

    // Substitute fired exactly once — one MODIFY_POWER active effect was added.
    const modifyPowerEffects = (resumed.state.activeEffects as RuntimeActiveEffect[]).filter(
      (e) => e.modifiers?.some((m) => m.type === "MODIFY_POWER"),
    );
    expect(modifyPowerEffects).toHaveLength(1);
  });
});

describe("OPT-231 — back-to-back removal events trigger independently per event", () => {
  function buildBatchReplacementState(
    cardDb: Map<string, CardData>,
    opts: { oncePerTurn: boolean },
  ) {
    const source = makeCharCard("REPL-SRC", "ReplSource", { color: ["Green"], power: 4000 });
    const target = makeCharCard("REPL-TGT", "ReplTarget", { color: ["Green"], power: 3000 });
    cardDb.set(source.id, source);
    cardDb.set(target.id, target);

    const base = createBattleReadyState(cardDb);
    const sourceInst = fieldInstance(source.id, 0, "src");
    const targetAInst = fieldInstance(target.id, 0, "tgt-a");
    const targetBInst = fieldInstance(target.id, 0, "tgt-b");

    const effect: RuntimeActiveEffect = {
      id: "repl-b2b",
      sourceCardInstanceId: sourceInst.instanceId,
      sourceEffectBlockId: "b2b-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_REMOVED_FROM_FIELD",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: { card_type: "CHARACTER", exclude_self: true },
          replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
          optional: true,
          once_per_turn: opts.oncePerTurn,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: Date.now(),
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars([sourceInst, targetAInst, targetBInst]),
    };
    const state: GameState = {
      ...base,
      players: newPlayers,
      activeEffects: [effect as never],
    };
    return {
      state,
      ids: { source: sourceInst.instanceId, targetA: targetAInst.instanceId, targetB: targetBInst.instanceId },
    };
  }

  function runBatchAccept(
    state: GameState,
    cardDb: Map<string, CardData>,
    targetIds: string[],
  ): ReturnType<typeof resumeReplacementBatch> {
    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: targetIds.length } },
    };
    const promptResult = executeReturnToHand(
      state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(),
      targetIds,
    );
    if (!promptResult.pendingPrompt) {
      return {
        state: promptResult.state,
        events: promptResult.events,
        protectedIds: [],
        finalizedIds: [],
        unprotectedIds: [],
      };
    }
    const ctx = promptResult.pendingPrompt.resumeContext as unknown as ReplacementBatchResumeContext;
    return resumeReplacementBatch(promptResult.state, ctx, true, cardDb);
  }

  it("without once_per_turn: each event prompts and each acceptance rests the source again", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildBatchReplacementState(cardDb, { oncePerTurn: false });

    // Event 1: remove targetA — replacement fires, source rests.
    const firstResumed = runBatchAccept(state, cardDb, [ids.targetA]);
    expect(firstResumed.protectedIds).toEqual([ids.targetA]);
    expect(firstResumed.state.players[0].characters.find((c) => c?.instanceId === ids.source)?.state).toBe("RESTED");

    // Reset the source to ACTIVE so we can observe the second rest-from-
    // replacement without the first run's residue. The replacement infra
    // itself is unchanged.
    const rewoundChars = firstResumed.state.players[0].characters.map((c) =>
      c?.instanceId === ids.source ? { ...c, state: "ACTIVE" as const } : c,
    );
    const betweenPlayer0: PlayerState = {
      ...firstResumed.state.players[0],
      characters: rewoundChars as PlayerState["characters"],
    };
    const betweenEvents: GameState = {
      ...firstResumed.state,
      players: [betweenPlayer0, firstResumed.state.players[1]],
    };

    // Event 2: remove targetB — replacement fires again in the same turn.
    const secondResumed = runBatchAccept(betweenEvents, cardDb, [ids.targetB]);
    expect(secondResumed.protectedIds).toEqual([ids.targetB]);
    expect(secondResumed.state.players[0].characters.find((c) => c?.instanceId === ids.source)?.state).toBe("RESTED");
  });

  it("with once_per_turn: the second event falls through; only the first pays", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildBatchReplacementState(cardDb, { oncePerTurn: true });

    // Event 1: accept — source rests, effect marked usedOnTurn.
    const firstResumed = runBatchAccept(state, cardDb, [ids.targetA]);
    expect(firstResumed.protectedIds).toEqual([ids.targetA]);
    const effectAfter1 = (firstResumed.state.activeEffects as RuntimeActiveEffect[]).find((e) => e.id === "repl-b2b");
    const params1 = effectAfter1?.modifiers.find((m) => m.type === "REPLACEMENT_EFFECT")?.params as Record<string, unknown>;
    expect(params1.usedOnTurn).toBe(state.turn.number);

    // Event 2: no prompt — once_per_turn gate filters the effect out and the
    // removal proceeds as written.
    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const second = executeReturnToHand(
      firstResumed.state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(),
      [ids.targetB],
    );
    expect(second.pendingPrompt).toBeUndefined();
    expect(second.state.players[0].characters.find((c) => c?.instanceId === ids.targetB)).toBeUndefined();
    expect(second.state.players[0].hand.some((c) => c.instanceId === ids.targetB)).toBe(true);
  });
});

describe("OPT-231 — real-schema round trip via registerReplacementsForCard", () => {
  // Drives OP15-009 Koby's actual schema through the registration → batch-scan
  // path. If the encoded schema drifts from what the runtime expects
  // (target_filter shape, flags, substitute target types), this is the test
  // that flips first.
  function buildKobyFromSchema(cardDb: Map<string, CardData>) {
    // Koby's schema filters on `base_power_max: 7000`. Give the test Koby a
    // base power ≤ 7000 so her own filter catches her if she ends up in the
    // batch — the self-inclusion invariant riding on top of the round trip.
    const kobyData: CardData = {
      id: OP15_009_KOBY.card_id,
      name: OP15_009_KOBY.card_name,
      type: "Character",
      color: ["Blue"],
      cost: 4,
      power: 5000,
      counter: null,
      life: null,
      attribute: [],
      types: ["Navy"],
      effectText: "",
      triggerText: null,
      keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
      effectSchema: OP15_009_KOBY as unknown as CardData["effectSchema"],
      imageUrl: null,
    };
    const allyData: CardData = {
      ...kobyData,
      id: "OP15-ALLY",
      name: "KobyAlly",
      power: 4000,
      effectSchema: null,
      types: [],
    };
    cardDb.set(kobyData.id, kobyData);
    cardDb.set(allyData.id, allyData);

    const base = createBattleReadyState(cardDb);
    const kobyInst = fieldInstance(kobyData.id, 0, "koby");
    const allyInst = fieldInstance(allyData.id, 0, "ally");

    // Register the replacement exactly the way the live pipeline does.
    const registered = registerReplacementsForCard(base, kobyInst, kobyData);

    const newPlayers = [...registered.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([kobyInst, allyInst]) };
    const state: GameState = { ...registered, players: newPlayers };
    return { state, ids: { koby: kobyInst.instanceId, ally: allyInst.instanceId } };
  }

  it("registers one REPLACEMENT_EFFECT matching Koby's schema", () => {
    const cardDb = createTestCardDb();
    const { state } = buildKobyFromSchema(cardDb);

    const effects = (state.activeEffects as RuntimeActiveEffect[]).filter((e) =>
      e.modifiers?.some((m) => m.type === "REPLACEMENT_EFFECT"),
    );
    expect(effects).toHaveLength(1);
    const params = effects[0].modifiers.find((m) => m.type === "REPLACEMENT_EFFECT")!.params as Record<string, unknown>;
    expect(params.trigger).toBe("WOULD_BE_REMOVED_FROM_FIELD");
    expect(params.optional).toBe(true);
    // target_filter present → registration should leave appliesTo empty (wildcard).
    expect(effects[0].appliesTo).toEqual([]);
  });

  it("batch return-to-hand of Koby + ally prompts once and saves both on accept", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildKobyFromSchema(cardDb);

    const action: Action = {
      type: "RETURN_TO_HAND",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 2 } },
    };
    const promptResult = executeReturnToHand(
      state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(),
      [ids.koby, ids.ally],
    );

    expect(promptResult.pendingPrompt).toBeDefined();
    const ctx = promptResult.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    expect(ctx.pendingMatches).toHaveLength(1);
    expect(ctx.pendingMatches[0].matchedTargetIds.sort()).toEqual([ids.koby, ids.ally].sort());

    const resumed = resumeReplacementBatch(promptResult.state, ctx, true, cardDb);
    expect(resumed.protectedIds.sort()).toEqual([ids.koby, ids.ally].sort());
    expect(resumed.finalizedIds).toEqual([]);

    // Both chars still on field; neither ended up in hand.
    const remaining = resumed.state.players[0].characters.filter(Boolean).map((c) => c!.instanceId).sort();
    expect(remaining).toEqual([ids.koby, ids.ally].sort());
    expect(resumed.state.players[0].hand.some((c) => c.instanceId === ids.koby || c.instanceId === ids.ally)).toBe(false);

    // Koby's substitute is MODIFY_POWER on YOUR_LEADER — verify the leader-
    // targeted power modifier landed exactly once regardless of match count.
    const leaderPowerMods = (resumed.state.activeEffects as RuntimeActiveEffect[]).filter((e) =>
      e.appliesTo.includes(state.players[0].leader.instanceId) &&
      e.modifiers.some((m) => m.type === "MODIFY_POWER"),
    );
    expect(leaderPowerMods).toHaveLength(1);
  });
});
