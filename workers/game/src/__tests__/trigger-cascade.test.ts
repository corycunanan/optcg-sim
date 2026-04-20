/**
 * OPT-160: trigger cascade coverage.
 *
 * Complements OPT-172 (multi-target drain) and OPT-173 (no double-fire) with
 * integration assertions the existing suites do not express:
 *
 *  1. Depth bound: the effect-stack MAX depth cap (100) short-circuits a
 *     pathological cascade instead of infinite-looping. Effect-stack unit tests
 *     cover the helper directly; this spot-checks the bound at the stack type
 *     that every cascade relies on.
 *  2. Single-level cascade resolves to completion and leaves an empty effect
 *     stack — a common invariant that callers downstream of the pipeline rely
 *     on (e.g. GameSession.resumeFromPrompt assumes an empty stack == no
 *     outstanding frame).
 *  3. Terminal events don't re-cascade: CARD_DRAWN has no keyword mapping in
 *     triggers.ts, so draws emitted inside a cascade must not feed back into
 *     the trigger matcher (regression guard against future keyword additions
 *     accidentally turning every draw into a trigger source).
 */

import { describe, it, expect } from "vitest";
import { runPipeline } from "../engine/pipeline.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { pushFrame } from "../engine/effect-stack.js";
import type { EffectBlock, EffectSchema } from "../engine/effect-types.js";
import type { CardData, CardInstance, EffectStackFrame, GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const noKw = {
  rush: false,
  rushCharacter: false,
  doubleAttack: false,
  banish: false,
  blocker: false,
  trigger: false,
  unblockable: false,
};

function makeCharCard(id: string, schema: EffectSchema | null, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 2,
    power: 3000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: schema ? "[schema-driven]" : "",
    triggerText: null,
    keywords: noKw,
    effectSchema: schema,
    imageUrl: null,
    ...overrides,
  };
}

function fieldChar(cardId: string, owner: 0 | 1, suffix: string): CardInstance {
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

// ─── ON_PLAY → KO → ON_KO cascade leaves the stack empty ─────────────────────

describe("trigger cascade — stack invariants after resolution", () => {
  it("ON_PLAY → KO → ON_KO chain resolves fully and empties the effect stack", () => {
    const cardDb = createTestCardDb();

    // Victim: [On K.O.] Draw 1. Only one character on P1's field, so the root's
    // KO action has exactly one legal target and auto-resolves without a prompt.
    const victimSchema: EffectSchema = {
      card_id: "VICTIM",
      card_name: "Victim",
      card_type: "Character",
      effects: [{
        id: "victim-on-ko",
        category: "auto",
        trigger: { keyword: "ON_KO" },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      }],
    };
    const victimCard = makeCharCard("VICTIM", victimSchema, { power: 3000 });

    // Root: [On Play] KO 1 opponent Character.
    const rootSchema: EffectSchema = {
      card_id: "ROOT",
      card_name: "Root",
      card_type: "Character",
      effects: [{
        id: "root-on-play",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
        }],
      }],
    };
    const rootCard = makeCharCard("ROOT", rootSchema, { cost: 0, power: 1000 });

    cardDb.set(victimCard.id, victimCard);
    cardDb.set(rootCard.id, rootCard);

    const base = createBattleReadyState(cardDb);
    const victimInst = fieldChar(victimCard.id, 1, "victim");
    const rootInst: CardInstance = {
      instanceId: "root-hand",
      cardId: rootCard.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };

    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], hand: [...players[0].hand, rootInst], characters: padChars([]) };
    players[1] = { ...players[1], characters: padChars([victimInst]) };
    let state: GameState = { ...base, players };
    state = registerTriggersForCard(state, victimInst, victimCard);

    expect(state.effectStack).toHaveLength(0);

    const p1HandBefore = state.players[1].hand.length;

    const result = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: rootInst.instanceId }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.pendingPrompt).toBeUndefined();

    // Victim KO'd, its ON_KO drew exactly one card, and the chain terminated —
    // the effect stack must be empty or the next action pumped in would crash
    // pipeline invariants downstream.
    expect(result.state.players[1].characters.filter(Boolean)).toHaveLength(0);
    expect(result.state.players[1].trash.some((c) => c.cardId === victimCard.id)).toBe(true);
    expect(result.state.players[1].hand.length).toBe(p1HandBefore + 1);
    expect(result.state.effectStack).toHaveLength(0);
  });
});

// ─── Terminal events without a keyword mapping don't re-cascade ──────────────

describe("trigger cascade — events without a keyword mapping terminate the chain", () => {
  it("CARD_DRAWN is not a keyword-trigger target, so a chain of draws fires no further triggers", () => {
    const cardDb = createTestCardDb();

    const drawSchema: EffectSchema = {
      card_id: "DRAWER",
      card_name: "Drawer",
      card_type: "Character",
      effects: [{
        id: "drawer-on-play",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{ type: "DRAW", params: { amount: 2 } }],
      }],
    };
    const drawerCard = makeCharCard("DRAWER", drawSchema, { cost: 0, power: 1000 });
    cardDb.set(drawerCard.id, drawerCard);

    const base = createBattleReadyState(cardDb);
    const drawerInst: CardInstance = {
      instanceId: "drawer-hand",
      cardId: drawerCard.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], hand: [...players[0].hand, drawerInst], characters: padChars([]) };
    const state: GameState = { ...base, players };

    const p0HandBefore = state.players[0].hand.length;
    const p0DeckBefore = state.players[0].deck.length;

    const result = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: drawerInst.instanceId }, cardDb, 0);
    expect(result.valid).toBe(true);

    // Exactly 2 CARD_DRAWN events — no cascade from CARD_DRAWN itself.
    const drawEvents = result.state.eventLog.filter((e) => e.type === "CARD_DRAWN");
    expect(drawEvents).toHaveLength(2);
    // -1 (drawer played) + 2 (drawn) = +1 net.
    expect(result.state.players[0].hand.length).toBe(p0HandBefore - 1 + 2);
    expect(result.state.players[0].deck.length).toBe(p0DeckBefore - 2);
    expect(result.state.effectStack).toHaveLength(0);
  });
});

// ─── Depth bound as circular-trigger prevention ──────────────────────────────

describe("trigger cascade — depth cap prevents runaway recursion", () => {
  it("pushFrame declines past MAX_EFFECT_STACK_DEPTH (100) so a circular cascade is bounded", () => {
    // Effect-stack.test.ts exercises the helper directly; here we re-assert the
    // bound against a live-shape frame so regressions at either layer surface.
    const stubBlock: EffectBlock = { id: "stub", category: "activate", actions: [] };
    const frame: EffectStackFrame = {
      id: "f",
      sourceCardInstanceId: "src",
      controller: 0,
      effectBlock: stubBlock,
      phase: "AWAITING_COST_SELECTION",
      pausedAction: null,
      remainingActions: [],
      resultRefs: [],
      validTargets: [],
      costs: [],
      currentCostIndex: 0,
      costsPaid: false,
      oncePerTurnMarked: false,
      costResultRefs: [],
      pendingTriggers: [],
      simultaneousTriggers: [],
      accumulatedEvents: [],
    };

    let state: GameState = { effectStack: [] } as unknown as GameState;
    for (let i = 0; i < 150; i++) {
      state = pushFrame(state, { ...frame, id: `f${i}` });
    }
    expect(state.effectStack).toHaveLength(100);
    expect(state.effectStack[99].id).toBe("f99");
  });
});
