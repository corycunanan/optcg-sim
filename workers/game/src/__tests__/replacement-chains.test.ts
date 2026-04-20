/**
 * OPT-160: replacement-chain coverage gaps.
 *
 * replacement-scenarios.test.ts (OPT-221 / OPT-232 / OPT-233) covers the
 * single-replacement batch flow thoroughly. This file extends it to the two
 * OPT-160 gaps it does not assert:
 *
 *  1. Multiple DIFFERENT replacement effects matching the same event. Two
 *     sources protecting different subsets of the same KO batch: both
 *     substitutes must run, in registration order, and neither's protected
 *     targets should be KO'd. Optional-on-each-prompt drives a per-effect
 *     decision path.
 *
 *  2. Replacement suppresses the triggered event. When WOULD_BE_KO is replaced
 *     by a non-KO substitute (SET_REST / TRASH_CARD), the downstream ON_KO
 *     trigger MUST NOT fire — the replaced event never becomes CARD_KO, so
 *     any [On K.O.] auto effect on the protected card stays dormant.
 */

import { describe, it, expect } from "vitest";
import { executeKO } from "../engine/effect-resolver/actions/removal.js";
import {
  resumeReplacementBatch,
  type ReplacementBatchResumeContext,
} from "../engine/replacements.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import "../engine/effect-resolver/resolver.js"; // installs replacement dispatcher
import type { Action, EffectResult, EffectSchema, RuntimeActiveEffect } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── 1. Multiple different replacement effects on the same KO batch ──────────

describe("multiple replacement effects on the same KO batch", () => {
  /**
   * Build a state where P0 owns two guardians, each a REPLACEMENT source:
   *   - Guardian A replaces WOULD_BE_KO on ally A (trash-self substitute).
   *   - Guardian B replaces WOULD_BE_KO on ally B (trash-self substitute).
   *
   * Both guardians are non-optional so the batch resolves without prompting.
   * An opponent effect tries to KO both allies at once. Registration order is
   * A then B; scanReplacementsForBatch must return both matches in that order
   * and applyBatchReplacement must run each substitute once.
   */
  function buildState(cardDb: Map<string, CardData>) {
    const guardianA = makeCharCard("GUARD-A", "Guardian A");
    const guardianB = makeCharCard("GUARD-B", "Guardian B");
    const allyA = makeCharCard("ALLY-A", "Ally A");
    const allyB = makeCharCard("ALLY-B", "Ally B");
    for (const c of [guardianA, guardianB, allyA, allyB]) cardDb.set(c.id, c);

    const base = createBattleReadyState(cardDb);
    const gaInst = fieldInstance(guardianA.id, 0, "ga");
    const gbInst = fieldInstance(guardianB.id, 0, "gb");
    const aaInst = fieldInstance(allyA.id, 0, "aa");
    const abInst = fieldInstance(allyB.id, 0, "ab");

    function makeEffect(sourceId: string, protectedAllyId: string, id: string): RuntimeActiveEffect {
      return {
        id,
        sourceCardInstanceId: sourceId,
        sourceEffectBlockId: `${id}-block`,
        category: "replacement",
        modifiers: [{
          type: "REPLACEMENT_EFFECT",
          params: {
            trigger: "WOULD_BE_KO",
            cause_filter: { by: "OPPONENT_EFFECT" },
            target_filter: null,
            replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
            optional: false,
            once_per_turn: false,
          },
        }],
        duration: { type: "PERMANENT" },
        expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
        controller: 0,
        // Whitelist which ally this guardian covers.
        appliesTo: [protectedAllyId],
        timestamp: Date.now(),
      };
    }

    const effectA = makeEffect(gaInst.instanceId, aaInst.instanceId, "repl-A");
    const effectB = makeEffect(gbInst.instanceId, abInst.instanceId, "repl-B");

    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([gaInst, gbInst, aaInst, abInst]),
    };
    const state: GameState = {
      ...base,
      players,
      activeEffects: [effectA as never, effectB as never],
    };
    return {
      state,
      ids: {
        ga: gaInst.instanceId,
        gb: gbInst.instanceId,
        aa: aaInst.instanceId,
        ab: abInst.instanceId,
      },
    };
  }

  it("both substitutes run: each guardian is self-trashed, both allies survive", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildState(cardDb);

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 2 } },
    };
    const result = executeKO(
      state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(),
      [ids.aa, ids.ab],
    );

    // Both replacements are non-optional → no prompt.
    expect(result.pendingPrompt).toBeUndefined();

    // Neither ally is KO'd; both survive.
    const p0 = result.state.players[0];
    expect(p0.characters.some((c) => c?.instanceId === ids.aa)).toBe(true);
    expect(p0.characters.some((c) => c?.instanceId === ids.ab)).toBe(true);

    // Both guardians self-trashed — neither still on the field.
    expect(p0.characters.some((c) => c?.instanceId === ids.ga)).toBe(false);
    expect(p0.characters.some((c) => c?.instanceId === ids.gb)).toBe(false);
    expect(p0.trash.some((c) => c.instanceId === ids.ga)).toBe(true);
    expect(p0.trash.some((c) => c.instanceId === ids.gb)).toBe(true);

    // The KO action reports zero targets KO'd (everything was replaced).
    expect(result.result?.targetInstanceIds ?? []).toEqual([]);
  });

  it("optional replacements chain prompts: accept-A then decline-B → only ally A survives", () => {
    const cardDb = createTestCardDb();
    const { state, ids } = buildState(cardDb);

    // Flip both effects to optional for this scenario.
    const optionalEffects = (state.activeEffects as RuntimeActiveEffect[]).map((e) => ({
      ...e,
      modifiers: e.modifiers.map((m) =>
        m.type === "REPLACEMENT_EFFECT"
          ? { ...m, params: { ...(m.params as Record<string, unknown>), optional: true } }
          : m,
      ),
    }));
    const optState: GameState = { ...state, activeEffects: optionalEffects as never };

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 2 } },
    };

    // First prompt: effect A asking about ally A.
    const first = executeKO(
      optState, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(),
      [ids.aa, ids.ab],
    );
    expect(first.pendingPrompt).toBeDefined();
    const ctx1 = first.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    expect(ctx1.pendingMatches).toHaveLength(2);
    expect(ctx1.currentMatchIndex).toBe(0);
    expect(ctx1.pendingMatches[0].matchedTargetIds).toEqual([ids.aa]);
    expect(ctx1.pendingMatches[1].matchedTargetIds).toEqual([ids.ab]);

    // Accept A.
    const afterAccept = resumeReplacementBatch(first.state, ctx1, true, cardDb);
    expect(afterAccept.pendingPrompt).toBeDefined();
    const ctx2 = afterAccept.pendingPrompt!.resumeContext as unknown as ReplacementBatchResumeContext;
    expect(ctx2.currentMatchIndex).toBe(1);
    // Ally A is already in the protected set.
    expect(ctx2.protectedIds).toContain(ids.aa);

    // Decline B.
    const final = resumeReplacementBatch(afterAccept.state, ctx2, false, cardDb);
    expect(final.pendingPrompt).toBeUndefined();

    // Ally A survived (guardian A trashed); ally B was KO'd (guardian B still on field).
    const p0 = final.state.players[0];
    expect(p0.characters.some((c) => c?.instanceId === ids.aa)).toBe(true);
    expect(p0.characters.some((c) => c?.instanceId === ids.ab)).toBe(false);
    expect(p0.trash.some((c) => c.instanceId === ids.ab)).toBe(true);
    expect(p0.characters.some((c) => c?.instanceId === ids.ga)).toBe(false);
    expect(p0.characters.some((c) => c?.instanceId === ids.gb)).toBe(true);

    // Final bookkeeping: finalized list = only ally B.
    expect(final.finalizedIds).toEqual([ids.ab]);
    expect(final.protectedIds).toEqual([ids.aa]);
  });
});

// ─── 2. Replacement suppresses downstream ON_KO trigger ──────────────────────

describe("replacement suppresses the triggered event", () => {
  /**
   * Character has BOTH an [On K.O.] auto trigger AND a self-protecting
   * replacement (trash-instead-of-KO). When the replacement fires, the card
   * moves to trash via CARD_TRASHED — not CARD_KO — so [On K.O.] must NOT
   * fire. Asserts the trigger pipeline is keyed on the finalized event, not
   * on the pre-replacement intent.
   */
  it("Ivankov-style trash-instead-of-KO does not trigger the card's own [On K.O.]", () => {
    const cardDb = createTestCardDb();

    // [On K.O.] Draw 1 — the observable effect we don't want to fire.
    const onKoSchema: EffectSchema = {
      card_id: "IVAN",
      card_name: "Ivan",
      card_type: "Character",
      effects: [{
        id: "ivan-on-ko",
        category: "auto",
        trigger: { keyword: "ON_KO" },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      }],
    };
    const ivan = makeCharCard("IVAN", "Ivan", { color: ["Green"], effectSchema: onKoSchema });
    cardDb.set(ivan.id, ivan);

    const base = createBattleReadyState(cardDb);
    const ivanInst = fieldInstance(ivan.id, 0, "ivan");

    // Self-protecting replacement: WOULD_BE_KO → TRASH_CARD self.
    const replacement: RuntimeActiveEffect = {
      id: "repl-ivan-self-trash",
      sourceCardInstanceId: ivanInst.instanceId,
      sourceEffectBlockId: "ivan-repl-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
          target_filter: null,
          replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
          optional: false,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [ivanInst.instanceId],
      timestamp: Date.now(),
    };

    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([ivanInst]) };
    let state: GameState = {
      ...base,
      players,
      activeEffects: [replacement as never],
    };
    state = registerTriggersForCard(state, ivanInst, ivan);

    const p0HandBefore = state.players[0].hand.length;
    const p0DeckBefore = state.players[0].deck.length;

    const action: Action = {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    };
    const result = executeKO(
      state, action, "opp-source", 1, cardDb, new Map<string, EffectResult>(),
      [ivanInst.instanceId],
    );

    expect(result.pendingPrompt).toBeUndefined();

    // Ivan is in trash via CARD_TRASHED, not CARD_KO.
    const p0 = result.state.players[0];
    expect(p0.characters.some((c) => c?.instanceId === ivanInst.instanceId)).toBe(false);
    expect(p0.trash.some((c) => c.instanceId === ivanInst.instanceId)).toBe(true);

    const trashedEvents = result.events.filter((e) => e.type === "CARD_TRASHED");
    const koEvents = result.events.filter((e) => e.type === "CARD_KO");
    expect(trashedEvents.length).toBeGreaterThan(0);
    expect(koEvents).toHaveLength(0);

    // No draw happened — [On K.O.] was suppressed.
    expect(p0.hand.length).toBe(p0HandBefore);
    expect(p0.deck.length).toBe(p0DeckBefore);
  });
});
