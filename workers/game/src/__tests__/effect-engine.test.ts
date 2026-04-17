/**
 * M4 Effect Engine Tests
 *
 * Tests for conditions, triggers, effect resolver, prohibitions,
 * replacements, duration tracker, and updated modifiers.
 */

import { describe, it, expect } from "vitest";
import { evaluateCondition, matchesFilter, type ConditionContext } from "../engine/conditions.js";
import { registerTriggersForCard, matchTriggersForEvent, orderMatchedTriggers, deregisterTriggersForCard } from "../engine/triggers.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { checkProhibitions, isProhibitedForCard } from "../engine/prohibitions.js";
import { checkReplacementForKO, checkReplacementForRemoval, resumeReplacement } from "../engine/replacements.js";
import { expireEndOfTurnEffects, expireBattleEffects, expireSourceLeftZone, processScheduledActions } from "../engine/duration-tracker.js";
import { getEffectivePower, hasGrantedKeyword } from "../engine/modifiers.js";
import type { GameState, CardData, CardInstance, GameEvent } from "../types.js";
import type { RuntimeActiveEffect, EffectSchema, EffectBlock, RuntimeProhibition, RuntimeRegisteredTrigger, ExpiryTiming } from "../engine/effect-types.js";
import { setupGame, CARDS, padChars } from "./helpers.js";
import { runPipeline } from "../engine/pipeline.js";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function createInitialGameState(): GameState {
  return setupGame().state;
}

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function makeCardDb(...entries: CardData[]): Map<string, CardData> {
  return new Map(entries.map((c) => [c.id, c]));
}

function makeCondCtx(
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
): ConditionContext {
  return { sourceCardInstanceId, controller, cardDb };
}

const VANILLA_CARD: CardData = {
  ...CARDS.VANILLA,
  id: "OP01-006",
};

const LUFFY_CARD: CardData = {
  id: "OP01-003",
  name: "Monkey.D.Luffy",
  type: "Character",
  color: ["Red"],
  cost: 5,
  power: 6000,
  counter: null,
  life: null,
  attribute: ["Strike"],
  types: ["Straw Hat Crew"],
  effectText: "[On Play] Draw 1 card",
  triggerText: null,
  keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
  effectSchema: null,
  imageUrl: null,
};

const NAMI_CARD: CardData = {
  id: "OP01-016",
  name: "Nami",
  type: "Character",
  color: ["Red"],
  cost: 1,
  power: 1000,
  counter: 1000,
  life: null,
  attribute: ["Special"],
  types: ["Straw Hat Crew"],
  effectText: "",
  triggerText: null,
  keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
  effectSchema: null,
  imageUrl: null,
};

const EVENT_CARD: CardData = {
  id: "OP01-029",
  name: "Gum-Gum Jet Pistol",
  type: "Event",
  color: ["Red"],
  cost: 4,
  power: null,
  counter: null,
  life: null,
  attribute: [],
  types: ["Straw Hat Crew"],
  effectText: "[Main] KO up to 1 of your opponent's Characters with 5000 power or less.",
  triggerText: null,
  keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
  effectSchema: null,
  imageUrl: null,
};

// ─── Condition Evaluator Tests ────────────────────────────────────────────────

describe("Condition Evaluator", () => {
  it("evaluates LIFE_COUNT conditions", () => {
    const state = createInitialGameState();
    const cardDb = makeCardDb(VANILLA_CARD);
    const ctx = makeCondCtx("leader-p1", 0, cardDb);

    // Player 0 starts with 5 life
    expect(evaluateCondition(state, {
      type: "LIFE_COUNT",
      controller: "SELF",
      operator: "==",
      value: 5,
    }, ctx)).toBe(true);

    expect(evaluateCondition(state, {
      type: "LIFE_COUNT",
      controller: "SELF",
      operator: "<=",
      value: 3,
    }, ctx)).toBe(false);
  });

  it("evaluates HAND_COUNT conditions", () => {
    const state = createInitialGameState();
    const cardDb = makeCardDb(VANILLA_CARD);
    const ctx = makeCondCtx("leader-p1", 0, cardDb);

    expect(evaluateCondition(state, {
      type: "HAND_COUNT",
      controller: "SELF",
      operator: ">=",
      value: 1,
    }, ctx)).toBe(true); // 5-card opening hand
  });

  it("evaluates compound conditions (all_of, any_of, not)", () => {
    const state = createInitialGameState();
    const cardDb = makeCardDb(VANILLA_CARD);
    const ctx = makeCondCtx("leader-p1", 0, cardDb);

    // all_of: both true
    expect(evaluateCondition(state, {
      all_of: [
        { type: "LIFE_COUNT", controller: "SELF", operator: "==", value: 5 },
        { type: "HAND_COUNT", controller: "SELF", operator: ">=", value: 1 },
      ],
    }, ctx)).toBe(true);

    // all_of: one false
    expect(evaluateCondition(state, {
      all_of: [
        { type: "LIFE_COUNT", controller: "SELF", operator: "==", value: 5 },
        { type: "LIFE_COUNT", controller: "SELF", operator: "==", value: 3 },
      ],
    }, ctx)).toBe(false);

    // any_of
    expect(evaluateCondition(state, {
      any_of: [
        { type: "LIFE_COUNT", controller: "SELF", operator: "==", value: 3 },
        { type: "LIFE_COUNT", controller: "SELF", operator: "==", value: 5 },
      ],
    }, ctx)).toBe(true);

    // not
    expect(evaluateCondition(state, {
      not: { type: "LIFE_COUNT", controller: "SELF", operator: "==", value: 3 },
    }, ctx)).toBe(true);
  });

  it("evaluates CARD_ON_FIELD conditions", () => {
    const state = createInitialGameState();
    // Add a character to player 0
    const char: CardInstance = {
      instanceId: "char-1",
      cardId: LUFFY_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    state.players[0].characters = padChars([char]);

    const cardDb = makeCardDb(LUFFY_CARD);
    const ctx = makeCondCtx("leader-p1", 0, cardDb);

    expect(evaluateCondition(state, {
      type: "CARD_ON_FIELD",
      controller: "SELF",
      filter: { name: "Monkey.D.Luffy" },
    }, ctx)).toBe(true);

    expect(evaluateCondition(state, {
      type: "CARD_ON_FIELD",
      controller: "SELF",
      filter: { name: "Nami" },
    }, ctx)).toBe(false);
  });

  it("evaluates SELF_STATE condition", () => {
    const state = createInitialGameState();
    const cardDb = makeCardDb(VANILLA_CARD);

    // Use the actual leader instanceId
    const leaderInstanceId = state.players[0].leader.instanceId;
    const ctx = makeCondCtx(leaderInstanceId, 0, cardDb);
    expect(evaluateCondition(state, {
      type: "SELF_STATE",
      required_state: "ACTIVE",
    }, ctx)).toBe(true);
  });
});

// ─── Filter Matching Tests ──────────────────────────────────────────────────

describe("matchesFilter", () => {
  const cardDb = makeCardDb(LUFFY_CARD, NAMI_CARD);

  const luffyInstance: CardInstance = {
    instanceId: "luffy-1",
    cardId: LUFFY_CARD.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };

  const namiInstance: CardInstance = {
    instanceId: "nami-1",
    cardId: NAMI_CARD.id,
    zone: "CHARACTER",
    state: "RESTED",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };

  it("matches by name", () => {
    const state = createInitialGameState();
    expect(matchesFilter(luffyInstance, { name: "Monkey.D.Luffy" }, cardDb, state)).toBe(true);
    expect(matchesFilter(luffyInstance, { name: "Nami" }, cardDb, state)).toBe(false);
  });

  it("matches by cost range", () => {
    const state = createInitialGameState();
    expect(matchesFilter(luffyInstance, { cost_max: 5 }, cardDb, state)).toBe(true);
    expect(matchesFilter(luffyInstance, { cost_max: 4 }, cardDb, state)).toBe(false);
    expect(matchesFilter(namiInstance, { cost_min: 2 }, cardDb, state)).toBe(false);
  });

  it("matches by color", () => {
    const state = createInitialGameState();
    expect(matchesFilter(luffyInstance, { color: "RED" }, cardDb, state)).toBe(true);
    expect(matchesFilter(luffyInstance, { color: "BLUE" }, cardDb, state)).toBe(false);
  });

  it("matches by trait", () => {
    const state = createInitialGameState();
    expect(matchesFilter(luffyInstance, { traits: ["Straw Hat Crew"] }, cardDb, state)).toBe(true);
    expect(matchesFilter(luffyInstance, { traits: ["Navy"] }, cardDb, state)).toBe(false);
  });

  it("matches by state", () => {
    const state = createInitialGameState();
    expect(matchesFilter(luffyInstance, { is_active: true }, cardDb, state)).toBe(true);
    expect(matchesFilter(namiInstance, { is_rested: true }, cardDb, state)).toBe(true);
    expect(matchesFilter(luffyInstance, { is_rested: true }, cardDb, state)).toBe(false);
  });
});

// ─── Updated Modifier Layer Tests ─────────────────────────────────────────────

describe("Modifier Layers (M4)", () => {
  it("applies MODIFY_POWER from active effects", () => {
    const state = createInitialGameState();
    const char: CardInstance = {
      instanceId: "char-1",
      cardId: LUFFY_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };

    // Add an active effect that gives +2000 power
    const effect: RuntimeActiveEffect = {
      id: "eff-1",
      sourceCardInstanceId: "leader-p1",
      sourceEffectBlockId: "block-1",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 2000 } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: 1 },
      controller: 0,
      appliesTo: ["char-1"],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const power = getEffectivePower(char, LUFFY_CARD, state);
    expect(power).toBe(8000); // 6000 base + 2000 from effect
  });

  it("applies SET_POWER overriding base", () => {
    const state = createInitialGameState();
    const char: CardInstance = {
      instanceId: "char-1",
      cardId: LUFFY_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };

    const effect: RuntimeActiveEffect = {
      id: "eff-1",
      sourceCardInstanceId: "some-card",
      sourceEffectBlockId: "block-1",
      category: "auto",
      modifiers: [{ type: "SET_POWER", params: { value: 0 } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: 1 },
      controller: 1,
      appliesTo: ["char-1"],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const power = getEffectivePower(char, LUFFY_CARD, state);
    expect(power).toBe(0); // Base overridden to 0
  });

  it("detects granted keywords", () => {
    const state = createInitialGameState();
    const char: CardInstance = {
      instanceId: "char-1",
      cardId: NAMI_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };

    const effect: RuntimeActiveEffect = {
      id: "eff-1",
      sourceCardInstanceId: "leader-p1",
      sourceEffectBlockId: "block-1",
      category: "auto",
      modifiers: [{ type: "GRANT_KEYWORD", params: { keyword: "RUSH" } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: 1 },
      controller: 0,
      appliesTo: ["char-1"],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    expect(hasGrantedKeyword(char, "RUSH", state)).toBe(true);
    expect(hasGrantedKeyword(char, "BLOCKER", state)).toBe(false);
  });
});

// ─── Effect Resolver Tests ────────────────────────────────────────────────────

describe("Effect Resolver", () => {
  it("resolves a DRAW action", () => {
    const state = createInitialGameState();
    const cardDb = makeCardDb(LUFFY_CARD);

    const block: EffectBlock = {
      id: "draw-block",
      category: "auto",
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    };

    const result = resolveEffect(state, block, "leader-p1", 0, cardDb);
    expect(result.resolved).toBe(true);

    // Player 0 should have drawn 2 cards
    const handDiff = result.state.players[0].hand.length - state.players[0].hand.length;
    const deckDiff = state.players[0].deck.length - result.state.players[0].deck.length;
    expect(handDiff).toBe(2);
    expect(deckDiff).toBe(2);
  });

  it("fails when conditions are not met", () => {
    const state = createInitialGameState();
    const cardDb = makeCardDb(LUFFY_CARD);

    const block: EffectBlock = {
      id: "cond-block",
      category: "auto",
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 0,
      },
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    };

    const result = resolveEffect(state, block, "leader-p1", 0, cardDb);
    expect(result.resolved).toBe(false);
    expect(result.state.players[0].hand.length).toBe(state.players[0].hand.length);
  });

  it("resolves MODIFY_POWER and creates active effect", () => {
    const state = createInitialGameState();
    const char: CardInstance = {
      instanceId: "char-target",
      cardId: LUFFY_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    state.players[0].characters = padChars([char]);

    const cardDb = makeCardDb(LUFFY_CARD);

    const block: EffectBlock = {
      id: "power-block",
      category: "auto",
      actions: [{
        type: "MODIFY_POWER",
        params: { amount: 3000 },
        target: { type: "CHARACTER", controller: "SELF" },
        duration: { type: "THIS_TURN" },
      }],
    };

    const result = resolveEffect(state, block, "leader-p1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.activeEffects.length).toBe(1);

    // Effective power should now include the buff
    const power = getEffectivePower(char, LUFFY_CARD, result.state);
    expect(power).toBe(9000); // 6000 + 3000
  });

  it("resolves KO action on opponent character", () => {
    const state = createInitialGameState();
    const oppChar: CardInstance = {
      instanceId: "opp-char-1",
      cardId: NAMI_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 1,
      owner: 1,
    };
    state.players[1].characters = padChars([oppChar]);

    const cardDb = makeCardDb(NAMI_CARD);

    const block: EffectBlock = {
      id: "ko-block",
      category: "auto",
      actions: [{
        type: "KO",
        target: { type: "CHARACTER", controller: "OPPONENT" },
      }],
    };

    const result = resolveEffect(state, block, "leader-p1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[1].characters.filter(Boolean).length).toBe(0);
    expect(result.state.players[1].trash.length).toBeGreaterThan(0);
  });
});

// ─── Prohibition Tests ────────────────────────────────────────────────────────

describe("Prohibitions", () => {
  it("vetoes CANNOT_ATTACK on specific card", () => {
    const state = createInitialGameState();
    const cardDb = makeCardDb(LUFFY_CARD);

    // Add a prohibition
    const prohibition: RuntimeProhibition = {
      id: "p-1",
      sourceCardInstanceId: "some-card",
      sourceEffectBlockId: "block-1",
      prohibitionType: "CANNOT_ATTACK",
      scope: {},
      duration: { type: "THIS_TURN" },
      controller: 0,
      appliesTo: ["char-1"],
      usesRemaining: null,
    };
    state.prohibitions = [prohibition as any];

    const veto = checkProhibitions(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: "char-1",
      targetInstanceId: "leader-p2",
    }, cardDb, 0);

    expect(veto).not.toBeNull();
    expect(veto).toContain("cannot attack");
  });

  it("allows attack when prohibition doesn't match card", () => {
    const state = createInitialGameState();
    const cardDb = makeCardDb(LUFFY_CARD);

    const prohibition: RuntimeProhibition = {
      id: "p-1",
      sourceCardInstanceId: "some-card",
      sourceEffectBlockId: "block-1",
      prohibitionType: "CANNOT_ATTACK",
      scope: {},
      duration: { type: "THIS_TURN" },
      controller: 0,
      appliesTo: ["char-999"], // different card
      usesRemaining: null,
    };
    state.prohibitions = [prohibition as any];

    const veto = checkProhibitions(state, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: "char-1",
      targetInstanceId: "leader-p2",
    }, cardDb, 0);

    expect(veto).toBeNull();
  });

  it("checks CANNOT_BE_KO for specific card", () => {
    const state = createInitialGameState();
    const cardDb = makeCardDb(LUFFY_CARD);

    const prohibition: RuntimeProhibition = {
      id: "p-1",
      sourceCardInstanceId: "some-card",
      sourceEffectBlockId: "block-1",
      prohibitionType: "CANNOT_BE_KO",
      scope: {},
      duration: { type: "THIS_TURN" },
      controller: 0,
      appliesTo: ["char-1"],
      usesRemaining: null,
    };
    state.prohibitions = [prohibition as any];

    expect(isProhibitedForCard(state, "char-1", "CANNOT_BE_KO", cardDb)).toBe(true);
    expect(isProhibitedForCard(state, "char-2", "CANNOT_BE_KO", cardDb)).toBe(false);
  });
});

// ─── Duration Tracker Tests ───────────────────────────────────────────────────

describe("Duration Tracker", () => {
  it("expires THIS_TURN effects at end of turn", () => {
    const state = createInitialGameState();
    state.turn.number = 3;

    const effect: RuntimeActiveEffect = {
      id: "eff-1",
      sourceCardInstanceId: "leader-p1",
      sourceEffectBlockId: "block-1",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 2000 } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: 3 },
      controller: 0,
      appliesTo: ["char-1"],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const result = expireEndOfTurnEffects(state);
    expect(result.activeEffects.length).toBe(0);
  });

  it("keeps effects that expire on a later turn", () => {
    const state = createInitialGameState();
    state.turn.number = 3;

    const effect: RuntimeActiveEffect = {
      id: "eff-1",
      sourceCardInstanceId: "leader-p1",
      sourceEffectBlockId: "block-1",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 2000 } }],
      duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
      expiresAt: { wave: "REFRESH_PHASE", turn: 5 },
      controller: 0,
      appliesTo: ["char-1"],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const result = expireEndOfTurnEffects(state);
    expect(result.activeEffects.length).toBe(1);
  });

  it("expires battle-scoped effects", () => {
    const state = createInitialGameState();

    const effect: RuntimeActiveEffect = {
      id: "eff-1",
      sourceCardInstanceId: "leader-p1",
      sourceEffectBlockId: "block-1",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 2000 } }],
      duration: { type: "THIS_BATTLE" },
      expiresAt: { wave: "END_OF_BATTLE", battleId: "battle-123" },
      controller: 0,
      appliesTo: ["char-1"],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const result = expireBattleEffects(state, "battle-123");
    expect(result.activeEffects.length).toBe(0);
  });

  it("expires source-left-zone effects", () => {
    const state = createInitialGameState();

    const effect: RuntimeActiveEffect = {
      id: "eff-1",
      sourceCardInstanceId: "char-source",
      sourceEffectBlockId: "block-1",
      category: "auto",
      modifiers: [{ type: "GRANT_KEYWORD", params: { keyword: "RUSH" } }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: ["char-target"],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const result = expireSourceLeftZone(state, "char-source");
    expect(result.activeEffects.length).toBe(0);
  });

  it("processes scheduled actions", () => {
    const state = createInitialGameState();
    state.scheduledActions = [{
      id: "sched-1",
      timing: "END_OF_THIS_TURN",
      action: { type: "DRAW", params: { amount: 1 } },
      boundToInstanceId: null,
      sourceEffectId: "leader-p1",
      controller: 0,
    } as any];

    const result = processScheduledActions(state, "END_OF_THIS_TURN");
    expect(result.actionsToRun.length).toBe(1);
    expect(result.state.scheduledActions.length).toBe(0);
  });
});

// ─── Trigger System Tests ─────────────────────────────────────────────────────

describe("Trigger System", () => {
  it("registers triggers from card effectSchema", () => {
    const state = createInitialGameState();

    const schema: EffectSchema = {
      card_id: "OP01-003",
      card_name: "Monkey.D.Luffy",
      card_type: "Character",
      effects: [{
        id: "on-play-draw",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      }],
    };

    const cardData: CardData = { ...LUFFY_CARD, effectSchema: schema };
    const cardInstance: CardInstance = {
      instanceId: "luffy-1",
      cardId: LUFFY_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };

    const result = registerTriggersForCard(state, cardInstance, cardData);
    expect(result.triggerRegistry.length).toBe(1);
    expect((result.triggerRegistry[0] as RuntimeRegisteredTrigger).sourceCardInstanceId).toBe("luffy-1");
  });

  it("deregisters triggers for a card", () => {
    const state = createInitialGameState();
    state.triggerRegistry = [{
      id: "trig-1",
      sourceCardInstanceId: "luffy-1",
      effectBlockId: "on-play-draw",
      controller: 0,
    } as any];

    const result = deregisterTriggersForCard(state, "luffy-1");
    expect(result.triggerRegistry.length).toBe(0);
  });

  it("matches triggers for CARD_PLAYED event", () => {
    const state = createInitialGameState();

    const luffyInstance: CardInstance = {
      instanceId: "luffy-1",
      cardId: LUFFY_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    state.players[0].characters = padChars([luffyInstance]);

    const effectBlock: EffectBlock = {
      id: "on-play-draw",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };

    state.triggerRegistry = [{
      id: "trig-1",
      sourceCardInstanceId: "luffy-1",
      effectBlockId: "on-play-draw",
      trigger: { keyword: "ON_PLAY" },
      effectBlock,
      zone: "FIELD",
      controller: 0,
    } as any];

    const event: GameEvent = {
      type: "CARD_PLAYED",
      playerIndex: 0,
      payload: { cardInstanceId: "luffy-1", cardId: "test-card", zone: "CHARACTER" as const, source: "FROM_HAND" },
      timestamp: Date.now(),
    };

    const cardDb = makeCardDb(LUFFY_CARD);
    const matched = matchTriggersForEvent(state, event, cardDb);
    expect(matched.length).toBe(1);
  });

  it("orders triggers: turn player first", () => {
    const turnPlayerTrigger = {
      trigger: { controller: 0 } as any,
      effectBlock: { id: "a" } as any,
    };
    const nonTurnPlayerTrigger = {
      trigger: { controller: 1 } as any,
      effectBlock: { id: "b" } as any,
    };

    const ordered = orderMatchedTriggers([nonTurnPlayerTrigger, turnPlayerTrigger], 0);
    expect(ordered[0].effectBlock.id).toBe("a");
    expect(ordered[1].effectBlock.id).toBe("b");
  });
});

// ─── Replacement Effect Tests ─────────────────────────────────────────────────

describe("Replacement Effects", () => {
  it("prevents KO via non-optional replacement (trash from hand)", () => {
    const state = createInitialGameState();
    const char: CardInstance = {
      instanceId: "char-1",
      cardId: NAMI_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    state.players[0].characters = padChars([char]);
    // Give player 0 a card in hand so they can pay the cost
    state.players[0].hand = [{
      instanceId: "hand-1",
      cardId: NAMI_CARD.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    } as CardInstance];

    const effect: RuntimeActiveEffect = {
      id: "repl-1",
      sourceCardInstanceId: "char-1",
      sourceEffectBlockId: "block-1",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: null,
          target_filter: null,
          replacement_actions: [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }],
          optional: false,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: ["char-1"],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const cardDb = makeCardDb(NAMI_CARD);
    const result = checkReplacementForKO(state, "char-1", "effect", 1, cardDb);

    expect(result.replaced).toBe(true);
    // Character should still be on field (KO was prevented)
    expect(result.state.players[0].characters.filter(Boolean).length).toBe(1);
    // Hand card was trashed as cost
    expect(result.state.players[0].hand.length).toBe(0);
    expect(result.state.players[0].trash.length).toBe(1);
  });

  it("does not replace KO for non-matching card", () => {
    const state = createInitialGameState();
    const char: CardInstance = {
      instanceId: "char-2",
      cardId: NAMI_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 1,
      owner: 1,
    };
    state.players[1].characters = padChars([char]);

    const effect: RuntimeActiveEffect = {
      id: "repl-1",
      sourceCardInstanceId: "char-1",
      sourceEffectBlockId: "block-1",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: null,
          target_filter: null,
          replacement_actions: [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }],
          optional: false,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: ["char-1"], // different card
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const cardDb = makeCardDb(NAMI_CARD);
    const result = checkReplacementForKO(state, "char-2", "effect", 1, cardDb);

    expect(result.replaced).toBe(false);
  });

  it("returns prompt for optional replacement", () => {
    const state = createInitialGameState();
    const char: CardInstance = {
      instanceId: "char-1",
      cardId: NAMI_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    state.players[0].characters = padChars([char]);
    state.players[0].hand = [{
      instanceId: "hand-1",
      cardId: NAMI_CARD.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    } as CardInstance];

    const effect: RuntimeActiveEffect = {
      id: "repl-1",
      sourceCardInstanceId: "char-1",
      sourceEffectBlockId: "block-1",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: null,
          target_filter: null,
          replacement_actions: [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: ["char-1"],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const cardDb = makeCardDb(NAMI_CARD);
    const result = checkReplacementForKO(state, "char-1", "effect", 1, cardDb);

    // Should not auto-replace — returns a prompt instead
    expect(result.replaced).toBe(false);
    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt!.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(result.pendingPrompt!.respondingPlayer).toBe(0);
  });

  it("skips replacement when cost cannot be paid", () => {
    const state = createInitialGameState();
    const char: CardInstance = {
      instanceId: "char-1",
      cardId: NAMI_CARD.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    state.players[0].characters = padChars([char]);
    state.players[0].hand = []; // Empty hand — cannot pay cost

    const effect: RuntimeActiveEffect = {
      id: "repl-1",
      sourceCardInstanceId: "char-1",
      sourceEffectBlockId: "block-1",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: null,
          target_filter: null,
          replacement_actions: [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }],
          optional: false,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: ["char-1"],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const cardDb = makeCardDb(NAMI_CARD);
    const result = checkReplacementForKO(state, "char-1", "effect", 1, cardDb);

    expect(result.replaced).toBe(false);
    expect(result.pendingPrompt).toBeUndefined();
  });

  // ─── target_filter matching (OPT-217) ───────────────────────────────────────

  it("matches replacement against non-source target via target_filter (Tashigi-style)", () => {
    // Tashigi protects OTHER green characters. Register with appliesTo=[] (wildcard)
    // and target_filter that excludes Tashigi by name.
    const GREEN_ALLY: CardData = {
      ...NAMI_CARD,
      id: "GREEN-ALLY",
      name: "Green Ally",
      color: ["Green"],
    };
    const TASHIGI: CardData = {
      ...NAMI_CARD,
      id: "TASHIGI",
      name: "Tashigi",
      color: ["Green"],
    };

    const state = createInitialGameState();
    const tashigi: CardInstance = {
      instanceId: "tashigi-1",
      cardId: TASHIGI.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [], turnPlayed: 1, controller: 0, owner: 0,
    };
    const ally: CardInstance = {
      instanceId: "ally-1",
      cardId: GREEN_ALLY.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [], turnPlayed: 1, controller: 0, owner: 0,
    };
    state.players[0].characters = padChars([tashigi, ally]);

    const effect: RuntimeActiveEffect = {
      id: "repl-tashigi",
      sourceCardInstanceId: "tashigi-1",
      sourceEffectBlockId: "block-1",
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
      appliesTo: [], // wildcard — relies on target_filter
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const cardDb = makeCardDb(GREEN_ALLY, TASHIGI);

    // Opponent effect would remove the green ally → prompt fires for Tashigi
    const allyResult = checkReplacementForRemoval(state, "ally-1", 1, cardDb);
    expect(allyResult.pendingPrompt).toBeDefined();
    expect(allyResult.pendingPrompt!.respondingPlayer).toBe(0);

    // Opponent effect would remove Tashigi herself → no prompt (self-excluded)
    const selfResult = checkReplacementForRemoval(state, "tashigi-1", 1, cardDb);
    expect(selfResult.pendingPrompt).toBeUndefined();
    expect(selfResult.replaced).toBe(false);
  });

  it("does not match when target_filter rejects the target's color/trait", () => {
    const RED_ALLY: CardData = {
      ...NAMI_CARD,
      id: "RED-ALLY",
      name: "Red Ally",
      color: ["Red"],
    };
    const TASHIGI: CardData = {
      ...NAMI_CARD,
      id: "TASHIGI",
      name: "Tashigi",
      color: ["Green"],
    };

    const state = createInitialGameState();
    const redAlly: CardInstance = {
      instanceId: "red-1",
      cardId: RED_ALLY.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [], turnPlayed: 1, controller: 0, owner: 0,
    };
    state.players[0].characters = padChars([redAlly]);

    const effect: RuntimeActiveEffect = {
      id: "repl-tashigi",
      sourceCardInstanceId: "tashigi-1",
      sourceEffectBlockId: "block-1",
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
      appliesTo: [],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];

    const cardDb = makeCardDb(RED_ALLY, TASHIGI);
    const result = checkReplacementForRemoval(state, "red-1", 1, cardDb);
    expect(result.replaced).toBe(false);
    expect(result.pendingPrompt).toBeUndefined();
  });

  it("honors exclude_self on target_filter", () => {
    const ALLY: CardData = {
      ...NAMI_CARD,
      id: "ALLY",
      name: "Ally",
      color: ["Green"],
    };
    const state = createInitialGameState();
    const source: CardInstance = {
      instanceId: "source-1",
      cardId: ALLY.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [], turnPlayed: 1, controller: 0, owner: 0,
    };
    state.players[0].characters = padChars([source]);

    const effect: RuntimeActiveEffect = {
      id: "repl",
      sourceCardInstanceId: "source-1",
      sourceEffectBlockId: "block-1",
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
    state.activeEffects = [effect as any];

    const cardDb = makeCardDb(ALLY);
    const result = checkReplacementForKO(state, "source-1", "effect", 1, cardDb);
    expect(result.replaced).toBe(false);
    expect(result.pendingPrompt).toBeUndefined();
  });

  // ─── Substitute action dispatcher (OPT-218) ────────────────────────────────

  it("dispatches SET_REST substitute — Tashigi rests herself when accepting", () => {
    const TASHIGI: CardData = { ...NAMI_CARD, id: "TASHIGI", name: "Tashigi", color: ["Green"] };
    const GREEN_ALLY: CardData = { ...NAMI_CARD, id: "GREEN-ALLY", name: "Green Ally", color: ["Green"] };

    const state = createInitialGameState();
    const tashigi: CardInstance = {
      instanceId: "tashigi-1", cardId: TASHIGI.id, zone: "CHARACTER", state: "ACTIVE",
      attachedDon: [], turnPlayed: 1, controller: 0, owner: 0,
    };
    const ally: CardInstance = {
      instanceId: "ally-1", cardId: GREEN_ALLY.id, zone: "CHARACTER", state: "ACTIVE",
      attachedDon: [], turnPlayed: 1, controller: 0, owner: 0,
    };
    state.players[0].characters = padChars([tashigi, ally]);

    const effect: RuntimeActiveEffect = {
      id: "repl-tashigi",
      sourceCardInstanceId: "tashigi-1",
      sourceEffectBlockId: "block-1",
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
      appliesTo: [],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];
    const cardDb = makeCardDb(GREEN_ALLY, TASHIGI);

    // Player accepts the prompt; resumeReplacement applies the substitute.
    const result = resumeReplacement(
      state,
      { type: "REPLACEMENT", effectId: "repl-tashigi", targetInstanceId: "ally-1", event: "WOULD_BE_REMOVED_FROM_FIELD" },
      true,
      cardDb,
    );

    expect(result.replaced).toBe(true);
    const tashigiAfter = result.state.players[0].characters.find((c) => c?.instanceId === "tashigi-1");
    expect(tashigiAfter?.state).toBe("RESTED");
    // Ally remains untouched by the replacement itself (original removal is skipped by caller)
    const allyAfter = result.state.players[0].characters.find((c) => c?.instanceId === "ally-1");
    expect(allyAfter?.zone).toBe("CHARACTER");
  });

  it("dispatches TRASH_CARD substitute — Ivankov-style trashes himself", () => {
    const IVANKOV: CardData = { ...NAMI_CARD, id: "IVANKOV", name: "Emporio Ivankov" };

    const state = createInitialGameState();
    const ivankov: CardInstance = {
      instanceId: "ivankov-1", cardId: IVANKOV.id, zone: "CHARACTER", state: "ACTIVE",
      attachedDon: [], turnPlayed: 1, controller: 0, owner: 0,
    };
    state.players[0].characters = padChars([ivankov]);

    const effect: RuntimeActiveEffect = {
      id: "repl-ivankov",
      sourceCardInstanceId: "ivankov-1",
      sourceEffectBlockId: "block-1",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: null,
          target_filter: null,
          replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
          optional: false,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: ["ivankov-1"],
      timestamp: Date.now(),
    };
    state.activeEffects = [effect as any];
    const cardDb = makeCardDb(IVANKOV);

    const result = checkReplacementForKO(state, "ivankov-1", "effect", 1, cardDb);
    expect(result.replaced).toBe(true);
    // Ivankov trashed (not KO'd — no DON returned to deck)
    const onField = result.state.players[0].characters.filter(Boolean);
    expect(onField).toHaveLength(0);
    expect(result.state.players[0].trash.some((c) => c.instanceId === "ivankov-1")).toBe(true);
  });
});

// ─── ACTIVATE_EFFECT Pipeline Integration ──────────────────────────────────

describe("ACTIVATE_EFFECT via pipeline", () => {
  it("resolves [Activate: Main] effect through the full pipeline", () => {
    // Create a card with an Activate Main effect that draws a card
    const activateCard: CardData = {
      id: "TEST-ACTIVATE",
      name: "Test Activator",
      type: "Character",
      color: ["Red"],
      cost: 2,
      power: 3000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[Activate: Main] Draw 1 card.",
      triggerText: null,
      keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
      effectSchema: {
        card_id: "TEST-ACTIVATE",
        card_name: "Test Activator",
        card_type: "Character",
        effects: [
          {
            id: "activate_draw",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            actions: [
              { type: "DRAW", params: { amount: 1 } },
            ],
          },
        ],
      },
      imageUrl: null,
    };

    const { state: baseState, cardDb } = setupGame();
    cardDb.set("TEST-ACTIVATE", activateCard);

    // Set up: player 0 in MAIN phase with the activate card on the field
    const charInstance: CardInstance = {
      instanceId: "test-activate-char",
      cardId: "TEST-ACTIVATE",
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };

    const players = [...baseState.players] as [typeof baseState.players[0], typeof baseState.players[1]];
    players[0] = {
      ...players[0],
      characters: padChars([...players[0].characters.filter(Boolean) as CardInstance[], charInstance]),
    };

    const state: GameState = {
      ...baseState,
      players,
      turn: {
        ...baseState.turn,
        number: 2,
        activePlayerIndex: 0,
        phase: "MAIN",
        battleSubPhase: null,
        battle: null,
      },
    };

    const handBefore = state.players[0].hand.length;

    const result = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: "test-activate-char", effectId: "activate_draw" },
      cardDb,
      0,
    );

    expect(result.valid).toBe(true);
    expect(result.state.players[0].hand.length).toBe(handBefore + 1);
    expect(result.state.players[0].deck.length).toBe(state.players[0].deck.length - 1);
  });

  it("blocks once-per-turn ACTIVATE_EFFECT from activating twice", () => {
    const oncePerTurnCard: CardData = {
      id: "TEST-OPT",
      name: "Test Once Per Turn",
      type: "Character",
      color: ["Red"],
      cost: 2,
      power: 3000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "[Activate: Main] [Once Per Turn] Draw 1 card.",
      triggerText: null,
      keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
      effectSchema: {
        card_id: "TEST-OPT",
        card_name: "Test Once Per Turn",
        card_type: "Character",
        effects: [
          {
            id: "activate_opt_draw",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            actions: [
              { type: "DRAW", params: { amount: 1 } },
            ],
            flags: { once_per_turn: true },
          },
        ],
      },
      imageUrl: null,
    };

    const { state: baseState, cardDb } = setupGame();
    cardDb.set("TEST-OPT", oncePerTurnCard);

    const charInstance: CardInstance = {
      instanceId: "test-opt-char",
      cardId: "TEST-OPT",
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };

    const players = [...baseState.players] as [typeof baseState.players[0], typeof baseState.players[1]];
    players[0] = {
      ...players[0],
      characters: padChars([...players[0].characters.filter(Boolean) as CardInstance[], charInstance]),
    };

    const state: GameState = {
      ...baseState,
      players,
      turn: {
        ...baseState.turn,
        number: 2,
        activePlayerIndex: 0,
        phase: "MAIN",
        battleSubPhase: null,
        battle: null,
      },
    };

    const handBefore = state.players[0].hand.length;
    const deckBefore = state.players[0].deck.length;

    // First activation should succeed
    const result1 = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: "test-opt-char", effectId: "activate_opt_draw" },
      cardDb,
      0,
    );

    expect(result1.valid).toBe(true);
    expect(result1.state.players[0].hand.length).toBe(handBefore + 1);
    expect(result1.state.players[0].deck.length).toBe(deckBefore - 1);

    // Second activation on the same turn should be blocked
    const result2 = runPipeline(
      result1.state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: "test-opt-char", effectId: "activate_opt_draw" },
      cardDb,
      0,
    );

    // Hand and deck should not change on second activation
    expect(result2.state.players[0].hand.length).toBe(handBefore + 1);
    expect(result2.state.players[0].deck.length).toBe(deckBefore - 1);
  });

  it("rejects ACTIVATE_EFFECT outside of MAIN phase", () => {
    const { state: baseState, cardDb } = setupGame();

    const state: GameState = {
      ...baseState,
      turn: {
        ...baseState.turn,
        phase: "DON",
        battleSubPhase: null,
      },
    };

    const result = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: "whatever", effectId: "whatever" },
      cardDb,
      0,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Main Phase");
  });
});
