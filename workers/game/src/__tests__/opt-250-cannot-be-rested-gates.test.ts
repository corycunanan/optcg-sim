/**
 * OPT-250 — E4: "Cannot be rested" gates every rest-inducing path.
 *
 * Bandai rulings (qa_op13.md:73-87, OP13-032 Nico Robin):
 *   • Cannot attack (declaring an attack rests the attacker)
 *   • Cannot activate [Blocker] (blocker activation rests the blocker)
 *   • Cannot activate [Activate: Main] rest-self effects
 *   • Cannot be rested by other cards' effects (own or opponent's)
 *
 * The prohibition was registered but inert before this change — only
 * consulted by the OPT-232 replacement feasibility gate. These tests
 * confirm the full rest-path audit is now wired:
 *   • prohibitions.ts — DECLARE_ATTACK / DECLARE_BLOCKER vetoes
 *   • cost-handler.ts — REST_SELF unpayable, REST_CARDS/REST_NAMED_CARD
 *     candidate filtering
 *   • actions/play.ts — executeSetRest strips prohibited targets
 */

import { describe, it, expect } from "vitest";
import { checkProhibitions } from "../engine/prohibitions.js";
import { computeCostTargets, isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { executeSetRest } from "../engine/effect-resolver/actions/play.js";
import type { Action, Cost, EffectResult } from "../engine/effect-types.js";
import type { CardInstance, GameAction, GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb, padChars, CARDS } from "./helpers.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function prohibitionFor(
  targetInstanceId: string,
  controller: 0 | 1 = 1,
): GameState["prohibitions"][number] {
  return {
    id: `prohib-${targetInstanceId}`,
    sourceCardInstanceId: `src-${controller}`,
    sourceEffectBlockId: "block-cannot-be-rested",
    prohibitionType: "CANNOT_BE_RESTED",
    controller,
    appliesTo: [targetInstanceId],
    scope: {},
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    usesRemaining: null,
    conditionalOverride: null,
    timestamp: Date.now(),
  } as unknown as GameState["prohibitions"][number];
}

/**
 * Install a CANNOT_BE_RESTED prohibition on the given instanceId. Default is
 * the first player-0 character ("char-0-v1" from createBattleReadyState).
 */
function withProhibitionOn(state: GameState, targetInstanceId: string): GameState {
  return { ...state, prohibitions: [...state.prohibitions, prohibitionFor(targetInstanceId)] };
}

// ─── DECLARE_ATTACK veto ────────────────────────────────────────────────────

describe("OPT-250 — DECLARE_ATTACK vetoed when attacker is under CANNOT_BE_RESTED", () => {
  it("vetoes when the attacker is in the prohibition's appliesTo", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const attackerId = base.players[0].characters[0]!.instanceId;
    const targetId = base.players[1].leader.instanceId;
    const state = withProhibitionOn(base, attackerId);

    const action: GameAction = {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attackerId,
      targetInstanceId: targetId,
    };
    const veto = checkProhibitions(state, action, cardDb, 0);
    expect(veto).toMatch(/cannot be rested/i);
  });

  it("does NOT veto when a different card is the attacker", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const protectedId = base.players[0].characters[0]!.instanceId;
    const otherAttackerId = base.players[0].characters[1]!.instanceId;
    const targetId = base.players[1].leader.instanceId;
    const state = withProhibitionOn(base, protectedId);

    const action: GameAction = {
      type: "DECLARE_ATTACK",
      attackerInstanceId: otherAttackerId,
      targetInstanceId: targetId,
    };
    expect(checkProhibitions(state, action, cardDb, 0)).toBeNull();
  });
});

// ─── DECLARE_BLOCKER veto ───────────────────────────────────────────────────

describe("OPT-250 — DECLARE_BLOCKER vetoed when blocker is under CANNOT_BE_RESTED", () => {
  it("vetoes when the blocker is in the prohibition's appliesTo", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    // Use player 1's first Character as would-be blocker
    const blockerId = base.players[1].characters[0]!.instanceId;
    const state = withProhibitionOn(base, blockerId);

    const action: GameAction = {
      type: "DECLARE_BLOCKER",
      blockerInstanceId: blockerId,
    };
    // The defender is the inactive player (1). Pass actingPlayerIndex=1.
    const veto = checkProhibitions(state, action, cardDb, 1);
    expect(veto).toMatch(/cannot be rested/i);
  });

  it("does NOT veto when a different card is the blocker", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const protectedId = base.players[1].characters[0]!.instanceId;
    const otherBlockerId = base.players[1].characters[1]!.instanceId;
    const state = withProhibitionOn(base, protectedId);

    const action: GameAction = {
      type: "DECLARE_BLOCKER",
      blockerInstanceId: otherBlockerId,
    };
    expect(checkProhibitions(state, action, cardDb, 1)).toBeNull();
  });
});

// ─── REST_SELF cost gating ──────────────────────────────────────────────────

describe("OPT-250 — REST_SELF cost unpayable when source is under CANNOT_BE_RESTED", () => {
  it("isCostPayable returns false when the source is prohibited", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const sourceId = base.players[0].characters[0]!.instanceId;
    const state = withProhibitionOn(base, sourceId);

    const cost: Cost = { type: "REST_SELF" };
    expect(isCostPayable(state, cost, 0, cardDb, sourceId)).toBe(false);
  });

  it("isCostPayable returns true when the source is not prohibited", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const sourceId = base.players[0].characters[0]!.instanceId;

    const cost: Cost = { type: "REST_SELF" };
    expect(isCostPayable(base, cost, 0, cardDb, sourceId)).toBe(true);
  });
});

// ─── REST_CARDS / REST_NAMED_CARD candidate filtering ───────────────────────

describe("OPT-250 — REST_CARDS and REST_NAMED_CARD candidate pools exclude prohibited cards", () => {
  it("REST_CARDS excludes a prohibited active character", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const prohibitedId = base.players[0].characters[0]!.instanceId;
    const freeId = base.players[0].characters[1]!.instanceId;
    const state = withProhibitionOn(base, prohibitedId);

    const cost: Cost = { type: "REST_CARDS", amount: 1 };
    const candidates = computeCostTargets(state, cost, 0, cardDb);
    expect(candidates).toContain(freeId);
    expect(candidates).not.toContain(prohibitedId);
  });

  it("REST_NAMED_CARD excludes a prohibited matching character", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const prohibitedId = base.players[0].characters[0]!.instanceId; // CHAR-VANILLA
    const state = withProhibitionOn(base, prohibitedId);

    const cost: Cost = {
      type: "REST_NAMED_CARD",
      filter: { name: CARDS.VANILLA.name },
    } as unknown as Cost;
    const candidates = computeCostTargets(state, cost, 0, cardDb);
    expect(candidates).not.toContain(prohibitedId);
  });

  it("isCostPayable(REST_CARDS, amount=2) fails when only 1 candidate remains after filtering", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    // createBattleReadyState gives player 0 exactly 2 characters.
    const prohibitedId = base.players[0].characters[0]!.instanceId;
    const state = withProhibitionOn(base, prohibitedId);

    const cost: Cost = { type: "REST_CARDS", amount: 2 };
    expect(isCostPayable(state, cost, 0, cardDb)).toBe(false);
  });
});

// ─── SET_REST action filtering ──────────────────────────────────────────────

describe("OPT-250 — SET_REST action strips prohibited targets from candidates", () => {
  it("preselected prohibited target is filtered → effect is no-op", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const protectedId = base.players[0].characters[0]!.instanceId;
    const state = withProhibitionOn(base, protectedId);

    const action: Action = {
      type: "SET_REST",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    } as unknown as Action;

    const result = executeSetRest(
      state,
      action,
      "src-effect",
      1,
      cardDb,
      new Map<string, EffectResult>(),
      [protectedId],
    );

    // Target stripped → no rest, succeeded=false (no-op consequence).
    const target = result.state.players[0].characters.find(
      (c): c is CardInstance => c !== null && c.instanceId === protectedId,
    );
    expect(target?.state).toBe("ACTIVE");
    expect(result.succeeded).toBe(false);
  });

  it("multi-target: prohibited target filtered, others still rest", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const protectedId = base.players[0].characters[0]!.instanceId;
    const freeId = base.players[0].characters[1]!.instanceId;
    const state = withProhibitionOn(base, protectedId);

    const action: Action = {
      type: "SET_REST",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 2 } },
    } as unknown as Action;

    const result = executeSetRest(
      state,
      action,
      "src-effect",
      1,
      cardDb,
      new Map<string, EffectResult>(),
      [protectedId, freeId],
    );

    const protectedCard = result.state.players[0].characters.find(
      (c): c is CardInstance => c !== null && c.instanceId === protectedId,
    );
    const freeCard = result.state.players[0].characters.find(
      (c): c is CardInstance => c !== null && c.instanceId === freeId,
    );
    expect(protectedCard?.state).toBe("ACTIVE");
    expect(freeCard?.state).toBe("RESTED");
    expect(result.succeeded).toBe(true);
  });
});

// ─── Already-rested: prohibition doesn't un-rest ────────────────────────────

describe("OPT-250 — an already-RESTED card under the prohibition stays RESTED", () => {
  it("executeSetRest is no-op on an already-rested target (whether or not prohibited)", () => {
    // This is covered by OPT-224's no-op-on-already-rested path; here we just
    // sanity-check the combination: rested + prohibition = still rested.
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const targetId = base.players[0].characters[0]!.instanceId;

    // Rest the target, then add the prohibition.
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars([
        { ...base.players[0].characters[0]!, state: "RESTED" },
        base.players[0].characters[1]!,
      ]),
    };
    const state = withProhibitionOn(
      { ...base, players: newPlayers },
      targetId,
    );

    const action: Action = {
      type: "SET_REST",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    } as unknown as Action;
    const result = executeSetRest(
      state,
      action,
      "src-effect",
      1,
      cardDb,
      new Map<string, EffectResult>(),
      [targetId],
    );

    const target = result.state.players[0].characters.find(
      (c): c is CardInstance => c !== null && c.instanceId === targetId,
    );
    expect(target?.state).toBe("RESTED"); // unchanged
  });
});
