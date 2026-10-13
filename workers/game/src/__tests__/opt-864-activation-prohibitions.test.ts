/**
 * OPT-864 (audit Decision 11) — prohibitions are a feasibility input.
 *
 * Rule 1-3-3: "If a card's effect requires a player to carry out an action
 * while a currently active effect prohibits that action, the prohibiting
 * effect always takes precedence." Availability and validation consult the
 * activation-time prohibitions (PROHIBITION_FEASIBILITY_TIMING in
 * effect-types.ts) before an action is offered or any cost is paid, so the
 * board never offers what pipeline step 2 would veto. A resolution-time
 * restriction (rule 1-3-2: the impossible part is skipped) never vetoes the
 * activation.
 *
 * Clause table
 * | Card / rule clause | Condition, evaluation time | Cost / payer | Target / chooser | Timing / continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | 1-3-3 + 6-5-4 | CANNOT_ACTIVATE_EFFECT active on the activating player, checked at offer and at validation | payable REST_DON 1 / activating player | n/a | activation is prohibited before payment | availability `blocked`, validation and the pipeline reject, nothing paid | "prohibited [Activate: Main]" |
 * | 1-3-2 + 4-5 (CANNOT_DRAW) | a draw prohibition restricts the post-colon DRAW, not the activation | payable REST_DON 1 / activating player | n/a | activation proceeds; the draw is skipped at resolution | availability `usable`, validation accepts | "resolution-time prohibition" |
 *
 * No authored card applies CANNOT_ACTIVATE_EFFECT; the fixture applies it
 * through the real APPLY_PROHIBITION action. CANNOT_DRAW is authored (OP12).
 */
import { describe, expect, it } from "vitest";
import type { CardInstance } from "../types.js";
import type { EffectBlock, ProhibitionScope } from "../engine/effect-types.js";
import { computeEffectAvailability } from "../engine/availability.js";
import { validate } from "../engine/validation.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { runPipeline } from "../engine/pipeline.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

const P0 = 0 as const;
const P1 = 1 as const;

function availabilityOf(r: Rig, card: CardInstance, effectId: string) {
  return computeEffectAvailability(r.state, r.db)[card.instanceId]?.find((e) => e.effectId === effectId);
}

// ─── Prohibitions are a feasibility input (Decision 11) ─────────────────────

describe("OPT-864 activation-time prohibitions gate availability and validation (rule 1-3-3)", () => {
  const PAYABLE_ACTIVATE: EffectBlock = {
    id: "opt864_payable_activate",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    costs: [{ type: "REST_DON", amount: 1 }],
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  };

  /** Player 1 applies a player-level prohibition to player 0. */
  function prohibit(r: Rig, prohibitionType: "CANNOT_ACTIVATE_EFFECT" | "CANNOT_DRAW", scope: ProhibitionScope) {
    const block: EffectBlock = {
      id: `opt864-apply-${prohibitionType}`,
      category: "auto",
      actions: [{
        type: "APPLY_PROHIBITION",
        params: { prohibition_type: prohibitionType, scope },
        duration: { type: "THIS_TURN" },
      }],
    };
    const result = resolveEffect(r.state, block, r.state.players[P1].leader.instanceId, P1, r.db);
    expect(result.pendingPrompt).toBeFalsy();
    r.state = result.state;
    expect(r.state.prohibitions.map((p) => p.prohibitionType)).toContain(prohibitionType);
  }

  function setup() {
    const r = rig();
    r.deck(P0, 5);
    const source = r.put("OPT864-PAYABLE", P0, "CHARACTER", {
      schema: synSchema("OPT864-PAYABLE", [PAYABLE_ACTIVATE]),
    });
    return { r, source };
  }

  it("prohibited [Activate: Main] with a payable cost reads unavailable and is rejected before payment", () => {
    const { r, source } = setup();
    expect(availabilityOf(r, source, PAYABLE_ACTIVATE.id)?.status).toBe("usable");
    prohibit(r, "CANNOT_ACTIVATE_EFFECT", { controller: "OPPONENT" });
    expect(availabilityOf(r, source, PAYABLE_ACTIVATE.id)).toEqual({
      effectId: PAYABLE_ACTIVATE.id,
      status: "blocked",
      reason: "CONDITION",
    });
    const action = { type: "ACTIVATE_EFFECT" as const, cardInstanceId: source.instanceId, effectId: PAYABLE_ACTIVATE.id };
    expect(validate(r.state, action, r.db, P0)).toMatch(/prohibited/);
    const before = structuredClone(r.state);
    const result = runPipeline(r.state, action, r.db, P0);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/prohibited/);
    // Nothing was paid (the pipeline only resets its per-action budget).
    expect(result.state.players).toEqual(before.players);
    expect(result.state.turn).toEqual(before.turn);
    expect(result.state.effectStack).toEqual([]);
    expect(result.state.pendingPrompt).toBeNull();
    expect(r.state.players[P0].donCostArea.every((d) => d.state === "ACTIVE")).toBe(true);
  });

  it("a resolution-time prohibition (CANNOT_DRAW) does not veto activation", () => {
    const { r, source } = setup();
    prohibit(r, "CANNOT_DRAW", { cause: "ANY" });
    expect(availabilityOf(r, source, PAYABLE_ACTIVATE.id)?.status).toBe("usable");
    expect(validate(
      r.state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: PAYABLE_ACTIVATE.id },
      r.db,
      P0,
    )).toBeNull();
  });
});

