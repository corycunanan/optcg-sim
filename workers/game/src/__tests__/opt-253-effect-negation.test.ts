/**
 * OPT-253 (E7) — Effect-negation semantics.
 *
 * Negation (OP06-074 Zephyr, OP10-098 Liberation, …) suppresses a Character's
 * own schema-sourced behavior while the flag is live, without removing the
 * card, and without touching modifiers that came from other cards.
 *
 * Matrix (from the issue):
 *   1. [On Play] from a negated Character does NOT fire.
 *   2. External +2000 on a negated Character is preserved.
 *   3. Own-schema Rush is suppressed while negated (cannot attack turn played).
 *   4. Externally granted Rush (GRANT_KEYWORD) persists on a negated Character.
 *   5. "Characters with Blocker" filter excludes a negated own-Blocker Character.
 *   6. The same filter INCLUDES a negated Character whose Blocker is externally granted.
 *   7. Negation wears off at end of turn → effects resume immediately
 *      (schema triggers were never unregistered, just skipped).
 *   8. The E3 hasBaseEffect predicate is schema-level and stays `true` for
 *      a negated card — negated ≠ no_base_effect (§8-2-2).
 *   9. A negated Character's own passive buff on OTHER cards stops applying
 *      while negated, and resumes when negation expires.
 *  10. Previously-applied external buffs on the negated card are preserved.
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  CardInstance,
  GameEvent,
  GameState,
  Zone,
} from "../types.js";
import type { EffectSchema, RuntimeActiveEffect } from "../engine/effect-types.js";
import {
  getEffectivePower,
  isCardNegated,
} from "../engine/modifiers.js";
import { canAttackThisTurn } from "../engine/keywords.js";
import { hasBaseEffect, matchesFilter } from "../engine/conditions.js";
import { matchTriggersForEvent, registerTriggersForCard } from "../engine/triggers.js";
import { expireEndOfTurnEffects } from "../engine/duration-tracker.js";
import { CARDS, padChars } from "./helpers.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function makeInstance(
  cardId: string,
  zone: Zone,
  owner: 0 | 1,
  overrides: Partial<CardInstance> = {},
): CardInstance {
  return {
    instanceId: `inst-${cardId}-${owner}`,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
    ...overrides,
  };
}

function buildMinimalState(): GameState {
  const makePlayer = (idx: 0 | 1) => ({
    userId: `user-${idx}`,
    leader: makeInstance(CARDS.LEADER.id, "LEADER", idx, { instanceId: `leader-${idx}` }),
    characters: [null, null, null, null, null] as (CardInstance | null)[],
    stage: null,
    hand: [],
    deck: [],
    trash: [],
    life: [],
    removedFromGame: [],
    donDeck: [],
    donCostArea: [],
  });
  return {
    gameId: "test-opt-253",
    status: "IN_PROGRESS",
    winner: null,
    players: [makePlayer(0), makePlayer(1)],
    turn: {
      number: 3,
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
      actionsPerformedThisTurn: [],
      oncePerTurnUsed: {},
      extraTurnsPending: 0,
    },
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    effectStack: [],
    pendingPrompt: null,
    eventLog: [],
    winReason: null,
  } as unknown as GameState;
}

/**
 * Construct a NEGATE_EFFECTS_FLAG active effect targeting the given card.
 * Mirrors what `executeNegateEffects` registers, so tests can exercise the
 * query-side behavior without routing through the full pipeline.
 */
function negationEffect(
  targetInstanceId: string,
  opts: { sourceCardInstanceId?: string; controller?: 0 | 1; turn?: number } = {},
): RuntimeActiveEffect {
  const turn = opts.turn ?? 3;
  return {
    id: `neg-${targetInstanceId}`,
    sourceCardInstanceId: opts.sourceCardInstanceId ?? "negator",
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [{
      type: "NEGATE_EFFECTS_FLAG",
      params: {},
      duration: { type: "THIS_TURN" },
    }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn } as any,
    controller: opts.controller ?? 0,
    appliesTo: [targetInstanceId],
    timestamp: Date.now(),
  } as RuntimeActiveEffect;
}

function grantedKeyword(
  targetInstanceId: string,
  keyword: string,
  opts: { sourceCardInstanceId?: string; controller?: 0 | 1; turn?: number } = {},
): RuntimeActiveEffect {
  const turn = opts.turn ?? 3;
  return {
    id: `grant-${keyword}-${targetInstanceId}`,
    sourceCardInstanceId: opts.sourceCardInstanceId ?? "granter",
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [{
      type: "GRANT_KEYWORD",
      params: { keyword },
      duration: { type: "THIS_TURN" },
    }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn } as any,
    controller: opts.controller ?? 0,
    appliesTo: [targetInstanceId],
    timestamp: Date.now(),
  } as RuntimeActiveEffect;
}

function externalPowerBuff(
  targetInstanceId: string,
  amount: number,
  opts: { sourceCardInstanceId?: string; controller?: 0 | 1; turn?: number } = {},
): RuntimeActiveEffect {
  const turn = opts.turn ?? 3;
  return {
    id: `buff-${targetInstanceId}`,
    sourceCardInstanceId: opts.sourceCardInstanceId ?? "external-buff-source",
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [{
      type: "MODIFY_POWER",
      params: { amount },
      duration: { type: "THIS_TURN" },
    }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn } as any,
    controller: opts.controller ?? 0,
    appliesTo: [targetInstanceId],
    timestamp: Date.now(),
  } as RuntimeActiveEffect;
}

// ─── 1. Trigger suppression ──────────────────────────────────────────────────

describe("OPT-253: triggers from negated Characters do not fire", () => {
  it("skips an [On Play] trigger whose source is negated", () => {
    const schema: EffectSchema = {
      effects: [{
        id: "on-play",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      }],
    } as EffectSchema;
    const card = makeCard("TRIG", {
      effectText: "[On Play] Draw 1.",
      effectSchema: schema,
    });
    const cardDb = new Map<string, CardData>([
      [card.id, card],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);

    let state = buildMinimalState();
    const inst = makeInstance(card.id, "CHARACTER", 0, { instanceId: "trig-1" });
    state.players[0].characters = padChars([inst]);
    state = registerTriggersForCard(state, inst, card);

    const event: GameEvent = {
      type: "CARD_PLAYED",
      playerIndex: 0,
      payload: { cardId: card.id, cardInstanceId: inst.instanceId, zone: "CHARACTER", source: "HAND" },
      timestamp: Date.now(),
    } as GameEvent;

    expect(matchTriggersForEvent(state, event, cardDb)).toHaveLength(1);

    const negatedState = {
      ...state,
      activeEffects: [...state.activeEffects, negationEffect(inst.instanceId)] as any,
    };
    expect(matchTriggersForEvent(negatedState, event, cardDb)).toHaveLength(0);
  });

  it("resumes trigger firing after negation expires at end of turn", () => {
    const schema: EffectSchema = {
      effects: [{
        id: "on-play",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      }],
    } as EffectSchema;
    const card = makeCard("TRIG2", {
      effectText: "[On Play] Draw 1.",
      effectSchema: schema,
    });
    const cardDb = new Map<string, CardData>([
      [card.id, card],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);

    let state = buildMinimalState();
    const inst = makeInstance(card.id, "CHARACTER", 0, { instanceId: "trig-2" });
    state.players[0].characters = padChars([inst]);
    state = registerTriggersForCard(state, inst, card);
    state = {
      ...state,
      activeEffects: [negationEffect(inst.instanceId, { turn: state.turn.number })] as any,
    };

    // While negated: no match.
    const event: GameEvent = {
      type: "CARD_PLAYED",
      playerIndex: 0,
      payload: { cardId: card.id, cardInstanceId: inst.instanceId, zone: "CHARACTER", source: "HAND" },
      timestamp: Date.now(),
    } as GameEvent;
    expect(matchTriggersForEvent(state, event, cardDb)).toHaveLength(0);

    // End of turn expires the THIS_TURN negation flag.
    const resumed = expireEndOfTurnEffects(state);
    expect(isCardNegated(inst, resumed, cardDb)).toBe(false);
    expect(matchTriggersForEvent(resumed, event, cardDb)).toHaveLength(1);
  });
});

// ─── 2, 10. External modifier preservation ───────────────────────────────────

describe("OPT-253: external modifiers on a negated Character are preserved", () => {
  it("an external +2000 MODIFY_POWER still applies while the target is negated", () => {
    const card = makeCard("TARGET", { power: 4000 });
    const cardDb = new Map<string, CardData>([
      [card.id, card],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const state = buildMinimalState();
    const inst = makeInstance(card.id, "CHARACTER", 0, { instanceId: "target" });
    state.players[0].characters = padChars([inst]);

    const withBuff = {
      ...state,
      activeEffects: [externalPowerBuff(inst.instanceId, 2000)] as any,
    };
    expect(getEffectivePower(inst, card, withBuff, cardDb)).toBe(6000);

    const withBuffAndNegation = {
      ...withBuff,
      activeEffects: [...withBuff.activeEffects, negationEffect(inst.instanceId)] as any,
    };
    expect(isCardNegated(inst, withBuffAndNegation, cardDb)).toBe(true);
    expect(getEffectivePower(inst, card, withBuffAndNegation, cardDb)).toBe(6000);
  });
});

// ─── 3, 4. Own-schema vs externally granted keyword ─────────────────────────

describe("OPT-253: printed keywords are suppressed while negated; external grants persist", () => {
  it("printed [Rush] is suppressed under negation — the Character cannot attack turn played", () => {
    const card = makeCard("RUSHER", {
      cost: 2, power: 3000,
      keywords: { ...noKeywords(), rush: true },
      effectText: "[Rush] (This Character can attack on the turn in which it is played.)",
    });
    const cardDb = new Map<string, CardData>([
      [card.id, card],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const state = buildMinimalState();
    const inst = makeInstance(card.id, "CHARACTER", 0, {
      instanceId: "rusher",
      turnPlayed: state.turn.number,
    });
    state.players[0].characters = padChars([inst]);

    expect(canAttackThisTurn(inst, card, state, cardDb)).toBe(true);

    const negated = {
      ...state,
      activeEffects: [negationEffect(inst.instanceId)] as any,
    };
    expect(canAttackThisTurn(inst, card, negated, cardDb)).toBe(false);
  });

  it("externally granted [Rush] (GRANT_KEYWORD) persists on a negated Character", () => {
    // Vanilla card with no printed Rush; Rush arrives via external grant.
    const card = makeCard("VANILLA-TARGET", { cost: 2, power: 3000 });
    const cardDb = new Map<string, CardData>([
      [card.id, card],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const state = buildMinimalState();
    const inst = makeInstance(card.id, "CHARACTER", 0, {
      instanceId: "granted-rush",
      turnPlayed: state.turn.number,
    });
    state.players[0].characters = padChars([inst]);

    const withGrantAndNegation = {
      ...state,
      activeEffects: [
        grantedKeyword(inst.instanceId, "RUSH"),
        negationEffect(inst.instanceId),
      ] as any,
    };
    expect(isCardNegated(inst, withGrantAndNegation, cardDb)).toBe(true);
    expect(canAttackThisTurn(inst, card, withGrantAndNegation, cardDb)).toBe(true);
  });
});

// ─── 5, 6. Keyword filter match on negated Character ─────────────────────────

describe("OPT-253: keyword filters consult runtime keyword state", () => {
  it("`keywords: [BLOCKER]` excludes a negated Character whose Blocker was own-schema", () => {
    const card = makeCard("B-OWN", {
      keywords: { ...noKeywords(), blocker: true },
      effectText: "[Blocker] (After your opponent declares an attack...)",
    });
    const cardDb = new Map<string, CardData>([
      [card.id, card],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const state = buildMinimalState();
    const inst = makeInstance(card.id, "CHARACTER", 0, { instanceId: "b-own" });
    state.players[0].characters = padChars([inst]);

    expect(matchesFilter(inst, { keywords: ["BLOCKER"] } as any, cardDb, state)).toBe(true);

    const negated = {
      ...state,
      activeEffects: [negationEffect(inst.instanceId)] as any,
    };
    expect(matchesFilter(inst, { keywords: ["BLOCKER"] } as any, cardDb, negated)).toBe(false);
  });

  it("`keywords: [BLOCKER]` still matches a negated Character with externally granted Blocker", () => {
    // Vanilla card; Blocker is grantedKeyword, not printed.
    const card = makeCard("B-GRANTED");
    const cardDb = new Map<string, CardData>([
      [card.id, card],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const state = buildMinimalState();
    const inst = makeInstance(card.id, "CHARACTER", 0, { instanceId: "b-granted" });
    state.players[0].characters = padChars([inst]);

    const withGrantAndNegation = {
      ...state,
      activeEffects: [
        grantedKeyword(inst.instanceId, "BLOCKER"),
        negationEffect(inst.instanceId),
      ] as any,
    };
    expect(matchesFilter(inst, { keywords: ["BLOCKER"] } as any, cardDb, withGrantAndNegation)).toBe(true);
  });
});

// ─── 8. E3 interaction ───────────────────────────────────────────────────────

describe("OPT-253: negation does not rewrite the card's base-effect status", () => {
  it("hasBaseEffect stays true for a negated Character (§8-2-2, schema-level)", () => {
    // hasBaseEffect reads CardData only; even if we build up a runtime
    // NEGATE_EFFECTS_FLAG, the predicate must not flip. This guards against
    // future refactors that might be tempted to consult runtime state here.
    const card = makeCard("ONPLAY", { effectText: "[On Play] Draw 1." });
    expect(hasBaseEffect(card)).toBe(true);
    // And matchesFilter's no_base_effect predicate concurs — a negated
    // [On Play] Character still does NOT match `no_base_effect: true`.
    const cardDb = new Map<string, CardData>([
      [card.id, card],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const state = buildMinimalState();
    const inst = makeInstance(card.id, "CHARACTER", 0, { instanceId: "onplay" });
    state.players[0].characters = padChars([inst]);
    const negated = {
      ...state,
      activeEffects: [negationEffect(inst.instanceId)] as any,
    };
    expect(matchesFilter(inst, { no_base_effect: true } as any, cardDb, negated)).toBe(false);
  });
});

// ─── 9. Negated Character's own passive to OTHERS ───────────────────────────

describe("OPT-253: a negated Character's own passive buff to other cards pauses", () => {
  it("a MODIFY_POWER effect sourced BY the negated card stops applying, then resumes after expiry", () => {
    const buffer = makeCard("BUFFER", { effectText: "Your other Characters gain +2000." });
    const ally = makeCard("ALLY", { power: 3000 });
    const cardDb = new Map<string, CardData>([
      [buffer.id, buffer],
      [ally.id, ally],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const state = buildMinimalState();
    const bufferInst = makeInstance(buffer.id, "CHARACTER", 0, { instanceId: "buffer" });
    const allyInst = makeInstance(ally.id, "CHARACTER", 0, { instanceId: "ally" });
    state.players[0].characters = padChars([bufferInst, allyInst]);

    // Active effect sourced BY the buffer, targeting the ally.
    const buffEffect: RuntimeActiveEffect = {
      id: "buffer-aura",
      sourceCardInstanceId: bufferInst.instanceId,
      sourceEffectBlockId: "",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 2000 }, duration: { type: "THIS_TURN" } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "NEVER" } as any,
      controller: 0,
      appliesTo: [allyInst.instanceId],
      timestamp: Date.now(),
    } as RuntimeActiveEffect;

    const withAura = { ...state, activeEffects: [buffEffect] as any };
    expect(getEffectivePower(allyInst, ally, withAura, cardDb)).toBe(5000);

    // Negate the buffer → its aura pauses.
    const negated = {
      ...withAura,
      activeEffects: [...withAura.activeEffects, negationEffect(bufferInst.instanceId, { turn: state.turn.number })] as any,
    };
    expect(isCardNegated(bufferInst, negated, cardDb)).toBe(true);
    expect(getEffectivePower(allyInst, ally, negated, cardDb)).toBe(3000);

    // After end-of-turn, the negation expires — aura resumes without re-resolution.
    const resumed = expireEndOfTurnEffects(negated);
    expect(isCardNegated(bufferInst, resumed, cardDb)).toBe(false);
    expect(getEffectivePower(allyInst, ally, resumed, cardDb)).toBe(5000);
  });
});
