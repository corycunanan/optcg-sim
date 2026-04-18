/**
 * OPT-260 — NEGATE_TRIGGER_TYPE path audit (OP09-081 Marshall.D.Teach).
 *
 * Distinct from OPT-253's per-instance `NEGATE_EFFECTS_FLAG`:
 *   * OPT-253 silences one specific Character's effects.
 *   * OPT-260 blocks an entire trigger keyword (e.g., every [On Play]) under
 *     a given controller for a duration — controller-scoped, prospective,
 *     and independent of which Character fires it.
 *
 * Two sources produce a trigger-type negation:
 *   * `NEGATE_TRIGGER_TYPE` action → writes a RuntimeProhibition whose
 *     `scope.triggerType` carries the keyword (OP09-081 Activate-Main).
 *   * `TRIGGER_TYPE_NEGATION` rule_modification on a Leader's schema —
 *     always active while that card is the Leader (OP09-081 passive).
 *
 * Matrix covered:
 *   1. Activate-Main ON_PLAY negation suppresses opponent's [On Play].
 *   2. Same negation leaves [When Attacking] alone (scope is per-keyword).
 *   3. Expiry at end of turn restores [On Play] firing.
 *   4. Leader rule-mod on SELF controller silences your own [On Play]
 *      Characters while Teach is your Leader.
 *   5. The leader rule does NOT affect the opponent's [On Play].
 *   6. A compound trigger's non-negated branch still fires when one branch
 *      is negated (per-keyword, not per-block).
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  CardInstance,
  GameEvent,
  GameState,
  Zone,
} from "../types.js";
import type {
  EffectSchema,
  RuntimeProhibition,
} from "../engine/effect-types.js";
import {
  matchTriggersForEvent,
  registerTriggersForCard,
} from "../engine/triggers.js";
import { expireEndOfTurnEffects, expireProhibitions } from "../engine/duration-tracker.js";
import { CARDS, padChars } from "./helpers.js";

// ─── Fixtures (minimal — mirrors opt-253 helpers) ────────────────────────────

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

function buildMinimalState(leaderP0: CardInstance, leaderP1: CardInstance): GameState {
  const makePlayer = (idx: 0 | 1, leader: CardInstance) => ({
    userId: `user-${idx}`,
    leader,
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
    gameId: "test-opt-260",
    status: "IN_PROGRESS",
    winner: null,
    players: [makePlayer(0, leaderP0), makePlayer(1, leaderP1)],
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
 * Construct a RuntimeProhibition that mirrors what `executeNegateTriggerType`
 * writes for a given keyword and target controller. Lets tests exercise
 * matching behavior without routing through the full resolver.
 */
function triggerTypeProhibition(
  triggerType: string,
  targetController: 0 | 1,
  opts: { turn?: number } = {},
): RuntimeProhibition {
  const turn = opts.turn ?? 3;
  return {
    id: `prohib-${triggerType}`,
    sourceCardInstanceId: "leader-0",
    sourceEffectBlockId: "",
    prohibitionType: "CANNOT_ACTIVATE_ON_PLAY",
    scope: { triggerType } as any,
    duration: { type: "THIS_TURN" },
    controller: targetController,
    appliesTo: [],
    usesRemaining: null,
    // End-of-turn expiry so `expireEndOfTurnEffects` clears it.
    expiresAt: { wave: "END_OF_TURN", turn } as any,
  } as unknown as RuntimeProhibition;
}

// ─── Helpers to build common test scaffolding ────────────────────────────────

function onPlaySchema(): EffectSchema {
  return {
    effects: [{
      id: "on-play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    }],
  } as EffectSchema;
}

function whenAttackingSchema(): EffectSchema {
  return {
    effects: [{
      id: "when-attacking",
      category: "auto",
      trigger: { keyword: "WHEN_ATTACKING" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    }],
  } as EffectSchema;
}

// OP09-081 Leader: "Your [On Play] effects are negated."
const TEACH_LEADER: CardData = makeCard("OP09-081", {
  type: "Leader",
  color: ["Black"],
  effectText: "Your [On Play] effects are negated.",
  effectSchema: {
    effects: [{
      id: "self_on_play_negation",
      category: "rule_modification",
      rule: {
        rule_type: "TRIGGER_TYPE_NEGATION",
        trigger_type: "ON_PLAY",
        affected_controller: "SELF",
      },
    }],
  } as EffectSchema,
});

// ─── 1 & 2. Activate-Main prohibition: scope is per-keyword ─────────────────

describe("OPT-260: NEGATE_TRIGGER_TYPE prohibition scope (OP09-081 Activate-Main)", () => {
  it("suppresses opponent's [On Play] trigger while the prohibition is active", () => {
    const p1OnPlay = makeCard("P1-ONPLAY", { effectText: "[On Play] Draw 1.", effectSchema: onPlaySchema() });
    const cardDb = new Map<string, CardData>([
      [p1OnPlay.id, p1OnPlay],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const p0Leader = makeInstance(CARDS.LEADER.id, "LEADER", 0, { instanceId: "leader-0" });
    const p1Leader = makeInstance(CARDS.LEADER.id, "LEADER", 1, { instanceId: "leader-1" });
    let state = buildMinimalState(p0Leader, p1Leader);

    const inst = makeInstance(p1OnPlay.id, "CHARACTER", 1, { instanceId: "p1-onplay" });
    state.players[1].characters = padChars([inst]);
    state = registerTriggersForCard(state, inst, p1OnPlay);

    const event: GameEvent = {
      type: "CARD_PLAYED",
      playerIndex: 1,
      payload: { cardId: p1OnPlay.id, cardInstanceId: inst.instanceId, zone: "CHARACTER", source: "HAND" },
      timestamp: Date.now(),
    } as GameEvent;

    // Baseline: On Play fires.
    expect(matchTriggersForEvent(state, event, cardDb)).toHaveLength(1);

    // Negate opponent [On Play] for this turn — the opponent is player 1.
    const negated = {
      ...state,
      prohibitions: [triggerTypeProhibition("ON_PLAY", 1, { turn: state.turn.number })] as any,
    };
    expect(matchTriggersForEvent(negated, event, cardDb)).toHaveLength(0);
  });

  it("does not suppress a [When Attacking] trigger — prohibition is keyword-scoped", () => {
    const attacker = makeCard("P1-WA", { effectText: "[When Attacking] Draw 1.", effectSchema: whenAttackingSchema() });
    const cardDb = new Map<string, CardData>([
      [attacker.id, attacker],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const p0Leader = makeInstance(CARDS.LEADER.id, "LEADER", 0, { instanceId: "leader-0" });
    const p1Leader = makeInstance(CARDS.LEADER.id, "LEADER", 1, { instanceId: "leader-1" });
    let state = buildMinimalState(p0Leader, p1Leader);

    const inst = makeInstance(attacker.id, "CHARACTER", 1, { instanceId: "p1-attacker" });
    state.players[1].characters = padChars([inst]);
    state = registerTriggersForCard(state, inst, attacker);
    state = {
      ...state,
      // ON_PLAY negation; the attacker's trigger is WHEN_ATTACKING — unaffected.
      prohibitions: [triggerTypeProhibition("ON_PLAY", 1, { turn: state.turn.number })] as any,
    };

    const event: GameEvent = {
      type: "ATTACK_DECLARED",
      playerIndex: 1,
      payload: { attackerInstanceId: inst.instanceId, targetInstanceId: "leader-0" },
      timestamp: Date.now(),
    } as unknown as GameEvent;

    expect(matchTriggersForEvent(state, event, cardDb)).toHaveLength(1);
  });

  it("resumes [On Play] firing once the end-of-turn expiry clears the prohibition", () => {
    const p1OnPlay = makeCard("P1-ONPLAY2", { effectText: "[On Play] Draw 1.", effectSchema: onPlaySchema() });
    const cardDb = new Map<string, CardData>([
      [p1OnPlay.id, p1OnPlay],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const p0Leader = makeInstance(CARDS.LEADER.id, "LEADER", 0, { instanceId: "leader-0" });
    const p1Leader = makeInstance(CARDS.LEADER.id, "LEADER", 1, { instanceId: "leader-1" });
    let state = buildMinimalState(p0Leader, p1Leader);

    const inst = makeInstance(p1OnPlay.id, "CHARACTER", 1, { instanceId: "p1-onplay-2" });
    state.players[1].characters = padChars([inst]);
    state = registerTriggersForCard(state, inst, p1OnPlay);
    state = {
      ...state,
      prohibitions: [triggerTypeProhibition("ON_PLAY", 1, { turn: state.turn.number })] as any,
    };

    const event: GameEvent = {
      type: "CARD_PLAYED",
      playerIndex: 1,
      payload: { cardId: p1OnPlay.id, cardInstanceId: inst.instanceId, zone: "CHARACTER", source: "HAND" },
      timestamp: Date.now(),
    } as GameEvent;

    expect(matchTriggersForEvent(state, event, cardDb)).toHaveLength(0);

    // End-of-turn runs two passes: active-effects expiry and prohibitions
    // expiry (see phases.ts). Both are needed to fully resume firing.
    let expired = expireEndOfTurnEffects(state);
    expired = expireProhibitions(expired, "END_OF_TURN", { turn: state.turn.number });
    expect(matchTriggersForEvent(expired, event, cardDb)).toHaveLength(1);
  });
});

// ─── 3 & 4. Leader rule_modification: passive while Teach is the Leader ─────

describe("OPT-260: TRIGGER_TYPE_NEGATION rule_modification from Leader schema (OP09-081 passive)", () => {
  it("suppresses your own Characters' [On Play] while Teach is your Leader", () => {
    const onPlay = makeCard("MY-ONPLAY", { effectText: "[On Play] Draw 1.", effectSchema: onPlaySchema() });
    const cardDb = new Map<string, CardData>([
      [onPlay.id, onPlay],
      [TEACH_LEADER.id, TEACH_LEADER],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);

    const teachInst = makeInstance(TEACH_LEADER.id, "LEADER", 0, { instanceId: "teach-leader" });
    const oppLeaderInst = makeInstance(CARDS.LEADER.id, "LEADER", 1, { instanceId: "opp-leader" });
    let state = buildMinimalState(teachInst, oppLeaderInst);

    const inst = makeInstance(onPlay.id, "CHARACTER", 0, { instanceId: "my-onplay" });
    state.players[0].characters = padChars([inst]);
    state = registerTriggersForCard(state, inst, onPlay);

    const event: GameEvent = {
      type: "CARD_PLAYED",
      playerIndex: 0,
      payload: { cardId: onPlay.id, cardInstanceId: inst.instanceId, zone: "CHARACTER", source: "HAND" },
      timestamp: Date.now(),
    } as GameEvent;

    expect(matchTriggersForEvent(state, event, cardDb)).toHaveLength(0);
  });

  it("leaves the opponent's [On Play] alone — affected_controller is SELF for the passive", () => {
    const oppOnPlay = makeCard("OPP-ONPLAY", { effectText: "[On Play] Draw 1.", effectSchema: onPlaySchema() });
    const cardDb = new Map<string, CardData>([
      [oppOnPlay.id, oppOnPlay],
      [TEACH_LEADER.id, TEACH_LEADER],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);

    const teachInst = makeInstance(TEACH_LEADER.id, "LEADER", 0, { instanceId: "teach-leader" });
    const oppLeaderInst = makeInstance(CARDS.LEADER.id, "LEADER", 1, { instanceId: "opp-leader" });
    let state = buildMinimalState(teachInst, oppLeaderInst);

    const inst = makeInstance(oppOnPlay.id, "CHARACTER", 1, { instanceId: "opp-onplay" });
    state.players[1].characters = padChars([inst]);
    state = registerTriggersForCard(state, inst, oppOnPlay);

    const event: GameEvent = {
      type: "CARD_PLAYED",
      playerIndex: 1,
      payload: { cardId: oppOnPlay.id, cardInstanceId: inst.instanceId, zone: "CHARACTER", source: "HAND" },
      timestamp: Date.now(),
    } as GameEvent;

    expect(matchTriggersForEvent(state, event, cardDb)).toHaveLength(1);
  });
});

// ─── 5. Compound trigger: only the negated branch drops ─────────────────────

describe("OPT-260: compound trigger keeps non-negated branches live", () => {
  it("fires on [When Attacking] even when the paired [On Play] branch is negated", () => {
    // A single effect block triggered by EITHER [On Play] OR [When Attacking].
    // Under an ON_PLAY-only prohibition, the block still fires on attack.
    const compound = makeCard("COMPOUND", {
      effectText: "[On Play] / [When Attacking] Draw 1.",
      effectSchema: {
        effects: [{
          id: "compound-draw",
          category: "auto",
          trigger: { any_of: [{ keyword: "ON_PLAY" }, { keyword: "WHEN_ATTACKING" }] },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }],
      } as EffectSchema,
    });

    const cardDb = new Map<string, CardData>([
      [compound.id, compound],
      [CARDS.LEADER.id, CARDS.LEADER],
    ]);
    const p0Leader = makeInstance(CARDS.LEADER.id, "LEADER", 0, { instanceId: "leader-0" });
    const p1Leader = makeInstance(CARDS.LEADER.id, "LEADER", 1, { instanceId: "leader-1" });
    let state = buildMinimalState(p0Leader, p1Leader);

    const inst = makeInstance(compound.id, "CHARACTER", 1, { instanceId: "compound-1" });
    state.players[1].characters = padChars([inst]);
    state = registerTriggersForCard(state, inst, compound);
    state = {
      ...state,
      prohibitions: [triggerTypeProhibition("ON_PLAY", 1, { turn: state.turn.number })] as any,
    };

    // Play event: ON_PLAY branch is blocked → no match.
    const playEvent: GameEvent = {
      type: "CARD_PLAYED",
      playerIndex: 1,
      payload: { cardId: compound.id, cardInstanceId: inst.instanceId, zone: "CHARACTER", source: "HAND" },
      timestamp: Date.now(),
    } as GameEvent;
    expect(matchTriggersForEvent(state, playEvent, cardDb)).toHaveLength(0);

    // Attack event: WHEN_ATTACKING branch is not affected → still fires.
    const attackEvent: GameEvent = {
      type: "ATTACK_DECLARED",
      playerIndex: 1,
      payload: { attackerInstanceId: inst.instanceId, targetInstanceId: "leader-0" },
      timestamp: Date.now(),
    } as unknown as GameEvent;
    expect(matchTriggersForEvent(state, attackEvent, cardDb)).toHaveLength(1);
  });
});
