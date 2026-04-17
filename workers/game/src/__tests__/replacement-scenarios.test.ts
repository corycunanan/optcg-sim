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
import "../engine/effect-resolver/resolver.js"; // installs replacement dispatcher
import type { Action, EffectResult, RuntimeActiveEffect } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

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
