/**
 * OPT-244 / OPT-814 — per-card once-per-turn lockout.
 * PRB02-004 FAQ: its auto activates mandatorily on the first opponent attack;
 * choosing zero DON still consumes it. It has no optional activation/decline.
 * Generic optional-effect decline behavior remains covered separately below.
 */

import { describe, it, expect } from "vitest";
import { PRB02_004_JEWELRY_BONNEY } from "../engine/schemas/prb02.js";
import { matchTriggersForEvent, registerTriggersForCard } from "../engine/triggers.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import type { EffectBlock } from "../engine/effect-types.js";
import type { CardData, CardInstance, DonInstance, GameEvent, GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeBonneyCard(): CardData {
  return {
    id: "PRB02-004",
    name: "Jewelry Bonney",
    type: "Character",
    color: ["Green"],
    cost: 3,
    power: 4000,
    counter: 1000,
    life: null,
    attribute: ["Strike"],
    types: ["Supernovas", "Pirate"],
    effectText:
      "[Blocker] [On Your Opponent's Attack] [Once Per Turn] Set up to 1 of your DON!! cards as active.",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: PRB02_004_JEWELRY_BONNEY,
    imageUrl: null,
  };
}

/**
 * Install one Bonney on player 1's field (attacker = player 0), register its
 * triggers, and leave turn state so an ATTACK_DECLARED would match.
 *
 * `suffix` distinguishes instanceIds when installing multiple Bonneys.
 */
function installBonneyOnDefender(
  cardDb: Map<string, CardData>,
  suffix = "b1",
): { state: GameState; bonney: CardInstance } {
  const bonneyCard = makeBonneyCard();
  cardDb.set(bonneyCard.id, bonneyCard);

  const base = createBattleReadyState(cardDb);

  const bonney: CardInstance = {
    instanceId: `bonney-${suffix}`,
    cardId: bonneyCard.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 0,
    controller: 1,
    owner: 1,
  };

  // Give player 1 some DON!! in cost area (in rested state) so SET_DON_ACTIVE
  // has something to target if the effect resolved (not strictly required for
  // the filter tests, but keeps the scenario physically coherent).
  const p1Don: DonInstance[] = Array.from({ length: 2 }, (_, i) => ({
    instanceId: `don-p1-oppatk-${i}`,
    state: "RESTED",
    attachedTo: null,
  }));

  const newPlayers = [...base.players] as [PlayerState, PlayerState];
  newPlayers[1] = {
    ...newPlayers[1],
    characters: padChars([bonney]),
    donCostArea: p1Don,
  };

  let state: GameState = { ...base, players: newPlayers };
  state = registerTriggersForCard(state, bonney, bonneyCard);
  return { state, bonney };
}

function attackEvent(): GameEvent {
  return {
    type: "ATTACK_DECLARED",
    playerIndex: 0,
    timestamp: 0,
    payload: {
      attackerInstanceId: "char-0-v1",
      targetInstanceId: "leader-1",
      attackerPower: 5000,
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("OPT-244 — [On Opp Attack] per-card once-per-turn lockout", () => {
  it("PRB02-004 is once-per-turn with mandatory activation and no decline flag", () => {
    const block = PRB02_004_JEWELRY_BONNEY.effects.find(
      (e) => e.id === "on_opponent_attack_set_don_active",
    ) as EffectBlock;
    expect(block.flags?.once_per_turn).toBe(true);
    expect(block.flags?.optional).toBeUndefined();
    expect(block.flags?.lock_on_decline).toBeUndefined();
  });

  it("dispatch gate: a Bonney already in oncePerTurnUsed is filtered out on the next ATTACK_DECLARED", () => {
    const cardDb = createTestCardDb();
    const { state, bonney } = installBonneyOnDefender(cardDb);

    // Pre-seed the bag as though the mandatory auto had activated earlier.
    const locked: GameState = {
      ...state,
      turn: {
        ...state.turn,
        oncePerTurnUsed: {
          ...state.turn.oncePerTurnUsed,
          on_opponent_attack_set_don_active: [bonney.instanceId],
        },
      },
    };

    const matched = matchTriggersForEvent(locked, attackEvent(), cardDb);
    expect(
      matched.some((m) => m.trigger.sourceCardInstanceId === bonney.instanceId),
    ).toBe(false);
  });

  it("dispatch gate: a second Bonney (different instance) still matches when the first is locked", () => {
    const cardDb = createTestCardDb();
    const bonneyCard = makeBonneyCard();
    cardDb.set(bonneyCard.id, bonneyCard);

    const base = createBattleReadyState(cardDb);
    const b1: CardInstance = {
      instanceId: "bonney-a",
      cardId: bonneyCard.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
      controller: 1,
      owner: 1,
    };
    const b2: CardInstance = { ...b1, instanceId: "bonney-b" };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], characters: padChars([b1, b2]) };
    let state: GameState = { ...base, players: newPlayers };
    state = registerTriggersForCard(state, b1, bonneyCard);
    state = registerTriggersForCard(state, b2, bonneyCard);

    // Only b1 is locked.
    state = {
      ...state,
      turn: {
        ...state.turn,
        oncePerTurnUsed: {
          ...state.turn.oncePerTurnUsed,
          on_opponent_attack_set_don_active: [b1.instanceId],
        },
      },
    };

    const matched = matchTriggersForEvent(state, attackEvent(), cardDb);
    const ids = matched.map((m) => m.trigger.sourceCardInstanceId);
    expect(ids).not.toContain(b1.instanceId);
    expect(ids).toContain(b2.instanceId);
  });

  it("resolution and dispatch: choosing zero with Bonney consumes once-per-turn", () => {
    const cardDb = createTestCardDb();
    const { state, bonney } = installBonneyOnDefender(cardDb);

    const block = PRB02_004_JEWELRY_BONNEY.effects.find(
      (e) => e.id === "on_opponent_attack_set_don_active",
    ) as EffectBlock;

    // The first attack matches before activation.
    expect(
      matchTriggersForEvent(state, attackEvent(), cardDb)
        .some((m) => m.trigger.sourceCardInstanceId === bonney.instanceId),
    ).toBe(true);

    // Mandatory activation directly asks the up-to quantity.
    const prompted = resolveEffect(state, block, bonney.instanceId, 1, cardDb);
    expect(prompted.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(prompted.state.effectStack.length).toBe(1);

    // Choose zero under rule1-3-5-1.
    const postState = { ...prompted.state, pendingPrompt: null };
    const declined = resumeFromStack(postState, { type: "PLAYER_CHOICE", choiceId: "choose-value:0" }, cardDb);

    // oncePerTurnUsed must now contain this Bonney against her block id.
    const usedSet = declined.state.turn.oncePerTurnUsed.on_opponent_attack_set_don_active;
    expect(usedSet).toBeDefined();
    expect(usedSet).toContain(bonney.instanceId);

    // A later attack in the SAME turn must not re-match Bonney.
    const secondMatch = matchTriggersForEvent(declined.state, attackEvent(), cardDb);
    expect(
      secondMatch.some((m) => m.trigger.sourceCardInstanceId === bonney.instanceId),
    ).toBe(false);
  });

  it("default (no lock_on_decline): declining does NOT mark oncePerTurnUsed — trigger re-arms on next event", () => {
    const cardDb = createTestCardDb();
    const { state, bonney } = installBonneyOnDefender(cardDb);

    // Synthetic optional block exercises the default decline contract.
    const unlockedBlock: EffectBlock = {
      id: "opt244-no-lock-on-decline",
      category: "auto",
      trigger: { keyword: "ON_OPPONENT_ATTACK" },
      flags: { once_per_turn: true, optional: true },
      actions: [{ type: "SET_DON_ACTIVE", params: { amount: 1 } }],
    };

    const prompted = resolveEffect(state, unlockedBlock, bonney.instanceId, 1, cardDb);
    expect(prompted.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const postState = { ...prompted.state, pendingPrompt: null };
    const declined = resumeFromStack(postState, { type: "PASS" }, cardDb);

    // Without lock_on_decline, the bag must not gain this block/instance pair.
    const usedSet = declined.state.turn.oncePerTurnUsed[unlockedBlock.id];
    expect(usedSet === undefined || !usedSet.includes(bonney.instanceId)).toBe(true);
  });

  it("turn reset: clearing oncePerTurnUsed re-arms Bonney for the next turn", () => {
    const cardDb = createTestCardDb();
    const { state, bonney } = installBonneyOnDefender(cardDb);

    // Simulate: Bonney activated this turn, then the turn rolled over.
    const rolled: GameState = {
      ...state,
      turn: {
        ...state.turn,
        // phases.ts clears oncePerTurnUsed at turn start.
        oncePerTurnUsed: {},
        number: state.turn.number + 1,
      },
    };

    const matched = matchTriggersForEvent(rolled, attackEvent(), cardDb);
    expect(
      matched.some((m) => m.trigger.sourceCardInstanceId === bonney.instanceId),
    ).toBe(true);
  });
});
