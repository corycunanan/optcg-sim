/**
 * OPT-1019 — SELECT_TARGET correctness at resume time.
 *
 * OPT-920: a dual_targets slot whose count is `exact` but which has no
 * candidate must not force the player to fill it. Rules: an effect does as
 * much as it can, so an `exact: 1` slot with zero candidates selects 0. Before
 * the fix the prompt advertised the unclamped minimum and the resolver
 * rejected every reply, softlocking the game (the session layer, since
 * OPT-870, already clamped and accepted the reply).
 *
 * OPT-880: the generic SELECT_TARGET resume trusted the prompt's saved
 * validTargets. A candidate that stopped matching the target filter while the
 * prompt was pending was still accepted. The reply is now checked against a
 * fresh resolution of the prompt's target; a stale reply is rejected without
 * mutating state and the same choice is asked again with current candidates.
 *
 * Card text (docs/cards/EB-03.md): EB03-026 "[Activate: Main] [Once Per
 * Turn] You may place 1 of your Characters at the bottom of the owner's deck:
 * Give up to 1 rested DON!! card each to your Leader and 1 of your
 * Characters." — authored as two `exact: 1` slots (Leader, Character).
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameState } from "../types.js";
import type { Action, EffectBlock } from "../engine/effect-types.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import {
  maxFillableSlotMinimums,
  validateTargetConstraints,
} from "../engine/effect-resolver/target-resolver.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function card(id: string, cost: number): CardData {
  return { ...CARDS.VANILLA, id, name: id, cost };
}

function onField(cardId: string, owner: 0 | 1, instanceId: string): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

function fixture(opponentCards: string[]) {
  const cardDb = createTestCardDb();
  for (const cost of [2, 3, 5, 7]) cardDb.set(`COST-${cost}`, card(`COST-${cost}`, cost));
  const state = createBattleReadyState(cardDb);
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars(
    opponentCards.map((cardId, i) => onField(cardId, 1, `opp-${i}`)),
  );
  return { state, cardDb };
}

function block(action: Action): EffectBlock {
  return {
    id: "opt-1019",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    actions: [action],
  } as EffectBlock;
}

function selectOptions(result: { pendingPrompt?: GameState["pendingPrompt"] | null }) {
  const options = result.pendingPrompt?.options;
  if (options?.promptType !== "SELECT_TARGET") throw new Error("expected SELECT_TARGET");
  return options;
}

function select(state: GameState, ids: string[], cardDb: Map<string, CardData>) {
  return resumeFromStack(state, { type: "SELECT_TARGET", selectedInstanceIds: ids }, cardDb);
}

function charState(state: GameState, instanceId: string) {
  return state.players[1].characters.find((c) => c?.instanceId === instanceId)?.state;
}

const SOURCE = "leader-source";

// ─── OPT-920 ────────────────────────────────────────────────────────────────

const REST_DISJOINT: Action = {
  type: "SET_REST",
  target: {
    type: "CHARACTER",
    controller: "OPPONENT",
    dual_targets: [
      { filter: { cost_min: 6 }, count: { exact: 1 } },
      { filter: { cost_max: 3 }, count: { up_to: 1 } },
    ],
  },
} as Action;

describe("OPT-920 dual_targets slot minimums are clamped to each slot's candidates", () => {
  it("the exact slot is empty: the prompt asks for 0..1 and either reply resolves", () => {
    for (const reply of [["opp-0"], []]) {
      const { state, cardDb } = fixture(["COST-2"]);
      const prompt = resolveEffect(state, block(REST_DISJOINT), state.players[0].leader.instanceId, 0, cardDb);
      const options = selectOptions(prompt);
      expect(options.countMin).toBe(0);
      expect(options.countMax).toBe(1);
      expect(options.dualTargets!.slots.map((s) => [s.countMin, s.countMax])).toEqual([[0, 0], [0, 1]]);

      const resolved = select(prompt.state, reply, cardDb);
      expect(resolved.rejected).toBeFalsy();
      expect(resolved.pendingPrompt).toBeFalsy();
      expect(charState(resolved.state, "opp-0")).toBe(reply.length ? "RESTED" : "ACTIVE");
    }
  });

  it("the up_to slot is empty: the exact slot is still required", () => {
    const { state, cardDb } = fixture(["COST-7"]);
    const prompt = resolveEffect(state, block(REST_DISJOINT), state.players[0].leader.instanceId, 0, cardDb);
    const options = selectOptions(prompt);
    expect(options.countMin).toBe(1);
    expect(options.countMax).toBe(1);

    const empty = select(prompt.state, [], cardDb);
    expect(empty.rejected).toBe(true);

    const resolved = select(prompt.state, ["opp-0"], cardDb);
    expect(resolved.rejected).toBeFalsy();
    expect(charState(resolved.state, "opp-0")).toBe("RESTED");
  });

  it("both slots are empty: no prompt is issued and the effect resolves", () => {
    const { state, cardDb } = fixture(["COST-5"]);
    const result = resolveEffect(state, block(REST_DISJOINT), state.players[0].leader.instanceId, 0, cardDb);
    expect(result.pendingPrompt).toBeFalsy();
    expect(charState(result.state, "opp-0")).toBe("ACTIVE");
  });

  it("EB03-026 shape: with no Character, giving DON!! to the Leader alone is accepted", () => {
    const { state, cardDb } = fixture([]);
    state.players[0].donCostArea = state.players[0].donCostArea.map((d) => ({ ...d, state: "RESTED" as const }));
    const leader = state.players[0].leader.instanceId;
    const action = {
      type: "DISTRIBUTE_DON",
      target: {
        type: "LEADER_OR_CHARACTER",
        controller: "SELF",
        dual_targets: [
          { filter: { card_type: "LEADER" }, count: { exact: 1 } },
          { filter: { card_type: "CHARACTER" }, count: { exact: 1 } },
        ],
      },
      params: { amount_per_target: 1, don_state: "RESTED" },
    } as Action;
    const prompt = resolveEffect(state, block(action), leader, 0, cardDb);
    const options = selectOptions(prompt);
    expect(options.validTargets).toEqual([leader]);
    expect(options.countMin).toBe(1);

    const resolved = select(prompt.state, [leader], cardDb);
    expect(resolved.rejected).toBeFalsy();
    expect(resolved.pendingPrompt).toBeFalsy();
    expect(resolved.state.players[0].leader.attachedDon).toHaveLength(1);
  });

  it("overlapping exact slots with one shared candidate need only that card", () => {
    const { state, cardDb } = fixture(["COST-2"]);
    const action = {
      type: "SET_REST",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        dual_targets: [
          { filter: {}, count: { exact: 1 } },
          { filter: { cost_max: 3 }, count: { exact: 1 } },
        ],
      },
    } as Action;
    const prompt = resolveEffect(state, block(action), state.players[0].leader.instanceId, 0, cardDb);
    expect(selectOptions(prompt).countMin).toBe(1);
    const resolved = select(prompt.state, ["opp-0"], cardDb);
    expect(resolved.rejected).toBeFalsy();
    expect(charState(resolved.state, "opp-0")).toBe("RESTED");
  });

  it("without a context every slot minimum stays required (replacement probing)", () => {
    const { state, cardDb } = fixture(["COST-2"]);
    expect(validateTargetConstraints([], REST_DISJOINT.target!, state, cardDb)).toBe(false);
    expect(
      validateTargetConstraints([], REST_DISJOINT.target!, state, cardDb, undefined, {
        controller: 0,
        sourceCardInstanceId: SOURCE,
      }),
    ).toBe(true);
  });

  it("maxFillableSlotMinimums is a matching, not a per-slot sum", () => {
    const a = new Set(["x"]);
    const b = new Set(["x", "y"]);
    expect(maxFillableSlotMinimums([a, b], [1, 1])).toBe(2);
    expect(maxFillableSlotMinimums([a, a], [1, 1])).toBe(1);
    expect(maxFillableSlotMinimums([new Set(), b], [1, 2])).toBe(2);
    expect(maxFillableSlotMinimums([a, b], [0, 0])).toBe(0);
  });
});

// ─── OPT-880 ────────────────────────────────────────────────────────────────

/**
 * Make `instanceId` stop matching a cost-3-or-less filter while the prompt is
 * pending. This stands in for a +4 cost modifier landing between the prompt
 * and the reply (the OPT-880 probe); no normal sequence doing this has been
 * demonstrated, so the test constructs the stale state directly.
 */
function raiseCost(state: GameState, instanceId: string): GameState {
  const characters = state.players[1].characters.map((c) =>
    c?.instanceId === instanceId ? { ...c, cardId: "COST-7" } : c,
  );
  const players = [...state.players] as GameState["players"];
  players[1] = { ...players[1], characters };
  return { ...state, players };
}

const REST_SINGLE: Action = {
  type: "SET_REST",
  target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 3 } },
} as Action;

const REST_MIXED: Action = {
  type: "SET_REST",
  target: {
    type: "CHARACTER",
    controller: "OPPONENT",
    count: { up_to: 1 },
    mixed_pool: {
      types: ["DON_IN_COST_AREA", "CHARACTER"],
      total_count: { up_to: 1 },
      filters: { CHARACTER: { cost_max: 3 }, DON_IN_COST_AREA: { is_active: true } },
    },
  },
} as Action;

describe("OPT-880 SELECT_TARGET resume re-checks candidate eligibility", () => {
  it("an exact count re-asked over fewer candidates asks only for what is offered", () => {
    const { state, cardDb } = fixture(["COST-3", "COST-2", "COST-2"]);
    const action = {
      type: "SET_REST",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 2 }, filter: { cost_max: 3 } },
    } as Action;
    const prompt = resolveEffect(state, block(action), state.players[0].leader.instanceId, 0, cardDb);
    expect(selectOptions(prompt).countMin).toBe(2);

    let stale = raiseCost(prompt.state, "opp-0");
    stale = raiseCost(stale, "opp-1");
    const rejected = select(stale, ["opp-0", "opp-2"], cardDb);
    expect(rejected.rejected).toBe(true);
    expect(rejected.reprompted).toBe(true);
    const reasked = selectOptions(rejected);
    expect(reasked.validTargets).toEqual(["opp-2"]);
    expect([reasked.countMin, reasked.countMax]).toEqual([1, 1]);

    const resolved = select({ ...rejected.state, pendingPrompt: rejected.pendingPrompt ?? null }, ["opp-2"], cardDb);
    expect(resolved.rejected).toBeFalsy();
    expect(charState(resolved.state, "opp-2")).toBe("RESTED");
  });

  for (const [label, action] of [["single-type", REST_SINGLE], ["mixed-pool", REST_MIXED]] as const) {
    it(`${label}: a candidate that became ineligible is rejected and the choice re-asked`, () => {
      const { state, cardDb } = fixture(["COST-3", "COST-2"]);
      const prompt = resolveEffect(state, block(action), state.players[0].leader.instanceId, 0, cardDb);
      expect(selectOptions(prompt).validTargets).toEqual(expect.arrayContaining(["opp-0", "opp-1"]));

      const stale = raiseCost(prompt.state, "opp-0");
      const rejected = select(stale, ["opp-0"], cardDb);
      expect(rejected.rejected).toBe(true);
      expect(rejected.reprompted).toBe(true);
      expect(charState(rejected.state, "opp-0")).toBe("ACTIVE");
      const reasked = selectOptions(rejected);
      expect(reasked.validTargets).not.toContain("opp-0");
      expect(reasked.validTargets).toContain("opp-1");

      const resolved = select({ ...rejected.state, pendingPrompt: rejected.pendingPrompt ?? null }, ["opp-1"], cardDb);
      expect(resolved.rejected).toBeFalsy();
      expect(charState(resolved.state, "opp-1")).toBe("RESTED");
      expect(charState(resolved.state, "opp-0")).toBe("ACTIVE");
    });

    it(`${label}: a reply that is still eligible is accepted unchanged`, () => {
      const { state, cardDb } = fixture(["COST-3", "COST-2"]);
      const prompt = resolveEffect(state, block(action), state.players[0].leader.instanceId, 0, cardDb);
      const resolved = select(prompt.state, ["opp-0"], cardDb);
      expect(resolved.rejected).toBeFalsy();
      expect(charState(resolved.state, "opp-0")).toBe("RESTED");
    });
  }
});
