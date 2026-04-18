/**
 * OPT-244 — D6: [On Your Opponent's Attack] declined → per-card lockout.
 *
 * Bandai ruling (PRB02-004 Jewelry Bonney): declining a [Once Per Turn] optional
 * trigger is irreversible for that card for the turn. A later opponent attack in
 * the same turn must NOT re-prompt the Bonney that already passed — but a *second*
 * Bonney (different instance) still gets its own prompt on that later attack.
 *
 * Wiring verified here:
 *   • `EffectFlags.lock_on_decline` exists and is set on PRB02-004's auto block
 *   • Dispatch gate (`matchTriggersForEvent`) filters a source whose (effectBlockId,
 *     instanceId) is already in `turn.oncePerTurnUsed`
 *   • `resumeFromStack` on AWAITING_OPTIONAL_RESPONSE + PASS marks the declined
 *     block/instance into `oncePerTurnUsed` when `lock_on_decline` is set
 *   • Blocks *without* `lock_on_decline` do NOT mark on decline (default behavior)
 *   • Locks clear between turns via `oncePerTurnUsed` reset
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
    payload: {
      attackerInstanceId: "char-0-v1",
      targetInstanceId: "leader-1",
      attackerPower: 5000,
    } as unknown as GameEvent["payload"],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("OPT-244 — [On Opp Attack] per-card lockout on decline", () => {
  it("PRB02-004 auto block carries lock_on_decline alongside once_per_turn + optional", () => {
    const block = PRB02_004_JEWELRY_BONNEY.effects.find(
      (e) => e.id === "on_opponent_attack_set_don_active",
    ) as EffectBlock;
    expect(block.flags?.once_per_turn).toBe(true);
    expect(block.flags?.optional).toBe(true);
    expect(block.flags?.lock_on_decline).toBe(true);
  });

  it("dispatch gate: a Bonney already in oncePerTurnUsed is filtered out on the next ATTACK_DECLARED", () => {
    const cardDb = createTestCardDb();
    const { state, bonney } = installBonneyOnDefender(cardDb);

    // Pre-seed the bag as though the player had declined (or accepted) earlier.
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

  it("end-to-end: declining Bonney marks oncePerTurnUsed, so a second attack does not re-prompt", () => {
    const cardDb = createTestCardDb();
    const { state, bonney } = installBonneyOnDefender(cardDb);

    const block = PRB02_004_JEWELRY_BONNEY.effects.find(
      (e) => e.id === "on_opponent_attack_set_don_active",
    ) as EffectBlock;

    // Sanity: the first attack matches Bonney before any decline.
    expect(
      matchTriggersForEvent(state, attackEvent(), cardDb)
        .some((m) => m.trigger.sourceCardInstanceId === bonney.instanceId),
    ).toBe(true);

    // Push the optional prompt onto the stack.
    const prompted = resolveEffect(state, block, bonney.instanceId, 1, cardDb);
    expect(prompted.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(prompted.state.effectStack.length).toBe(1);

    // Decline via PASS.
    const postState = { ...prompted.state, pendingPrompt: null };
    const declined = resumeFromStack(postState, { type: "PASS" }, cardDb);

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

    // Synthetic variant of Bonney's block with the lock flag stripped.
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

    // Simulate: Bonney declined this turn, then the turn rolled over.
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
