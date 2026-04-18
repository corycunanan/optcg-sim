/**
 * OPT-249 (E3) — "No base effect" predicate semantics.
 *
 * P-011 Uta and friends (OP02-026, OP02-039, OP02-045, OP03-091, EB02-022,
 * EB03-003/005/009/039/043) filter Characters "with no base effect". Per
 * Bandai rulings and comprehensive rules §2-8-5 / §2-11-2 / §8-2-2:
 *
 *   • Vanilla (no printed text) → NO base effect.
 *   • Trigger-only ([Trigger] body in triggerText, effectText empty) → NO base.
 *   • [Counter]-only (printed [Counter] effect) → HAS base effect.
 *   • [On Play] / [Main] / [Activate: Main] / etc. → HAS base effect.
 *   • Keyword-only printed body ("[Blocker] (...)", "[Rush] (...)") → HAS base.
 *   • Printed counter SYMBOL (data.counter = 2000 with empty effectText) → NO base
 *     (the symbol is a stat, not a [Counter] effect).
 *   • Runtime-negated [On Play] → STILL HAS base (§8-2-2, schema-level predicate).
 *
 * Exercised through all three call sites:
 *   1. NO_BASE_EFFECT simple condition            (conditions.ts: evaluateCondition)
 *   2. TargetFilter.no_base_effect                (conditions.ts: matchesFilter)
 *   3. EventFilter.no_base_effect                 (triggers.ts: event trigger filter)
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  Zone,
} from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import {
  evaluateCondition,
  hasBaseEffect,
  matchesFilter,
  type ConditionContext,
} from "../engine/conditions.js";
import { matchTriggersForEvent, registerTriggersForCard } from "../engine/triggers.js";
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
    instanceId: `inst-${cardId}`,
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
    characters: [null, null, null, null, null],
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
    gameId: "test-opt-249",
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

// ─── Scenarios — pure predicate (hasBaseEffect) ──────────────────────────────

describe("OPT-249: hasBaseEffect predicate", () => {
  it("vanilla card (no effectText) → no base effect", () => {
    const card = makeCard("V", { effectText: "" });
    expect(hasBaseEffect(card)).toBe(false);
  });

  it("trigger-only card (effectText empty, triggerText populated, kw.trigger set) → no base effect", () => {
    const card = makeCard("T", {
      effectText: "",
      triggerText: "Draw 1 card.",
      keywords: { ...noKeywords(), trigger: true },
    });
    expect(hasBaseEffect(card)).toBe(false);
  });

  it("[Counter] effect (printed [Counter] in effectText) → has base effect", () => {
    const card = makeCard("C", { effectText: "[Counter] +2000 power during this battle." });
    expect(hasBaseEffect(card)).toBe(true);
  });

  it("[On Play] effect → has base effect", () => {
    const card = makeCard("P", { effectText: "[On Play] Draw 1 card." });
    expect(hasBaseEffect(card)).toBe(true);
  });

  it("keyword-only printed body (`[Blocker] (...)`) → has base effect", () => {
    const card = makeCard("B", {
      effectText: "[Blocker] (After your opponent declares an attack, you may rest this Character to make it the new target of the attack.)",
      keywords: { ...noKeywords(), blocker: true },
    });
    expect(hasBaseEffect(card)).toBe(true);
  });

  it("printed counter SYMBOL (data.counter = 2000, empty effectText) → no base effect", () => {
    // The printed counter value is a stat, not a [Counter] effect — it does
    // not appear in effectText, so the predicate correctly reports no base.
    const card = makeCard("S", { effectText: "", counter: 2000 });
    expect(hasBaseEffect(card)).toBe(false);
  });

  it("is purely schema-level: ignores runtime state (§8-2-2)", () => {
    // A Character whose [On Play] was runtime-negated still has a base
    // effect; the effect is suppressed (ActiveEffect cleared), not absent
    // from the card's schema.
    const card = makeCard("N", { effectText: "[On Play] Draw 1 card." });
    expect(hasBaseEffect(card)).toBe(true);
    // The helper takes CardData, not CardInstance — it cannot consult
    // activeEffects / effect-stack state by construction.
  });
});

// ─── Scenarios — exercised through the 3 call sites ──────────────────────────

describe("OPT-249: NO_BASE_EFFECT simple condition", () => {
  it.each([
    ["vanilla", { effectText: "" }, true],
    ["trigger-only", { effectText: "", triggerText: "Draw 1.", keywords: { ...noKeywords(), trigger: true } }, true],
    ["counter-only", { effectText: "[Counter] +2000." }, false],
    ["on-play", { effectText: "[On Play] Draw 1." }, false],
    ["blocker-bodied", { effectText: "[Blocker] (...)", keywords: { ...noKeywords(), blocker: true } }, false],
    ["printed counter symbol only", { effectText: "", counter: 2000 }, true],
  ])("%s → NO_BASE_EFFECT returns %s", (_label, overrides, expected) => {
    const card = makeCard("SOURCE", overrides as Partial<CardData>);
    const cardDb = new Map<string, CardData>([
      [card.id, card],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const state = buildMinimalState();
    const inst = makeInstance(card.id, "CHARACTER", 0, { instanceId: "src" });
    state.players[0].characters = padChars([inst]);

    const ctx: ConditionContext = {
      sourceCardInstanceId: "src",
      controller: 0,
      cardDb,
    };
    expect(evaluateCondition(state, { type: "NO_BASE_EFFECT" }, ctx)).toBe(expected);
  });
});

describe("OPT-249: TargetFilter.no_base_effect (matchesFilter)", () => {
  it.each([
    ["vanilla", { effectText: "" }, true],
    ["trigger-only", { effectText: "", triggerText: "Draw 1.", keywords: { ...noKeywords(), trigger: true } }, true],
    ["counter-only", { effectText: "[Counter] +2000." }, false],
    ["on-play", { effectText: "[On Play] Draw 1." }, false],
    ["blocker-bodied", { effectText: "[Blocker] (...)", keywords: { ...noKeywords(), blocker: true } }, false],
    ["printed counter symbol only", { effectText: "", counter: 2000 }, true],
  ])("%s → no_base_effect:true matches = %s", (_label, overrides, expected) => {
    const card = makeCard("TARGET", overrides as Partial<CardData>);
    const cardDb = new Map<string, CardData>([
      [card.id, card],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const state = buildMinimalState();
    const inst = makeInstance(card.id, "CHARACTER", 0, { instanceId: "tgt" });
    state.players[0].characters = padChars([inst]);

    expect(matchesFilter(inst, { no_base_effect: true }, cardDb, state)).toBe(expected);
  });

  it("is unaffected by runtime-negating activeEffects (§8-2-2)", () => {
    // Simulate a card whose [On Play] has been "negated" — our engine clears
    // the sourced ActiveEffects, which is orthogonal to the schema-level
    // hasBaseEffect predicate. The card still matches `no_base_effect:false`.
    const card = makeCard("NEG", { effectText: "[On Play] Draw 1." });
    const cardDb = new Map<string, CardData>([
      [card.id, card],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const state = buildMinimalState();
    const inst = makeInstance(card.id, "CHARACTER", 0, { instanceId: "neg" });
    state.players[0].characters = padChars([inst]);
    // Even with zero activeEffects (as if all were cleared by NEGATE_EFFECTS),
    // the card still has a base effect.
    expect(state.activeEffects).toHaveLength(0);
    expect(matchesFilter(inst, { no_base_effect: true }, cardDb, state)).toBe(false);
  });
});

describe("OPT-249: EventFilter.no_base_effect (trigger matching)", () => {
  // Mirrors the OP02-026 pattern: an auto trigger that fires on CHARACTER_PLAYED
  // where the played Character has no base effect.
  function buildWatcher(): CardData {
    return makeCard("WATCH", {
      effectSchema: {
        effects: [{
          id: "w",
          category: "auto",
          trigger: {
            event: "CHARACTER_PLAYED",
            filter: { controller: "SELF", no_base_effect: true },
          },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }],
      } as EffectSchema,
    });
  }

  it.each([
    ["vanilla", { effectText: "" }, 1],
    ["trigger-only", { effectText: "", triggerText: "Draw 1.", keywords: { ...noKeywords(), trigger: true } }, 1],
    ["counter-only", { effectText: "[Counter] +2000." }, 0],
    ["on-play", { effectText: "[On Play] Draw 1." }, 0],
    ["blocker-bodied", { effectText: "[Blocker] (...)", keywords: { ...noKeywords(), blocker: true } }, 0],
    ["printed counter symbol only", { effectText: "", counter: 2000 }, 1],
  ])("%s play → matches %d trigger(s)", (_label, overrides, expectedCount) => {
    const watcher = buildWatcher();
    const played = makeCard("PLAYED", overrides as Partial<CardData>);
    const cardDb = new Map<string, CardData>([
      [watcher.id, watcher],
      [played.id, played],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);

    let state = buildMinimalState();
    const watcherInst = makeInstance(watcher.id, "CHARACTER", 0, { instanceId: "watcher" });
    const playedInst = makeInstance(played.id, "CHARACTER", 0, { instanceId: "played" });
    state.players[0].characters = padChars([watcherInst, playedInst]);
    state = registerTriggersForCard(state, watcherInst, watcher);

    const matches = matchTriggersForEvent(state, {
      type: "CARD_PLAYED",
      playerIndex: 0,
      payload: {
        cardInstanceId: "played",
        cardId: played.id,
        zone: "CHARACTER" as Zone,
        source: "FROM_HAND",
      },
      timestamp: Date.now(),
    }, cardDb);

    expect(matches.length).toBe(expectedCount);
  });
});
