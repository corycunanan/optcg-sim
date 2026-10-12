/**
 * OPT-864 audit amendment item 3 (Decision 10) — KNOWN RULES DEVIATION,
 * linked to OPT-958.
 *
 * This file pins the engine's RETAINED behavior when a printed activation cost
 * is replaced after payment has started. It does not establish rules
 * conformance. Each retained-behavior assertion states the rule-literal
 * outcome beside it.
 *
 * Rules (docs/rules/rule_comprehensive.md, v1.2.0):
 * - 8-3-1-1: costs are paid in printed order.
 * - 8-3-1-3: if the cost cannot be paid in full, it cannot be paid at all
 *   (initial infeasibility; ST06-012 Garp, OP11-024 Aladine shapes).
 * - 8-3-1-3-1: becoming unable to pay after paying starts: pay as much as
 *   possible; the effect after the colon does not resolve.
 * - 8-3-1-7: a replaced activation cost is not "paid as described in the
 *   text", so the effect after the colon is not processed.
 * - 10-2-13-5: a [Once Per Turn] effect whose activation cost the player
 *   became "unable to pay" cannot be activated again that turn. This case is
 *   a replaced cost (8-3-1-7), not an inability to pay, so applying
 *   10-2-13-5 here is an ASSUMED reading: no rule or ruling says whether a
 *   replaced cost consumes the use. (OPT-822 consumes it on the Life-cost
 *   replacement path.)
 *
 * Fixture (reachability: SYNTHETIC). OP17-043 Ganzui's authored replacement
 * (docs/cards/OP-17.md:313, "If this Character would be removed from the
 * field, you may trash 2 cards from your hand instead.") with a grafted
 * [Activate: Main] [Once Per Turn] block whose cost is "rest 1 DON!!, then
 * trash this Character". No authored card combines a self-removal cost with
 * a self-removal replacement after an earlier cost; the cost shape itself is
 * authored (EB02-047, OP09-089, ST25-004 pay a hand trash then TRASH_SELF).
 *
 * Clause table
 * | Card / rule clause | Condition, evaluation time | Cost / payer | Target / chooser | Timing / continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | 8-3-1-7 + 10-2-13-5, Ganzui replacement accepted | REST_DON 1 staged, then TRASH_SELF would remove Ganzui | REST_DON 1 then TRASH_SELF / P0; substitute: trash 2 from hand / P0 | P0 accepts and picks 2 hand cards | effect after the colon is not processed | retained: DON!! back to active, use not consumed, substitute stands, no draw. Rule-literal: DON!! stays rested, substitute stands, no draw; use consumed (assumed reading of 10-2-13-5) | "replaced after payment starts" |
 * | 8-1-3-4-1, replacement declined | same | REST_DON 1 then TRASH_SELF / P0 | P0 declines | printed cost paid; DRAW resolves | 1 DON!! rested, Ganzui trashed, 1 draw, use consumed | "declined" |
 * | 8-3-1-3, initial infeasibility | no active DON!! when offered | REST_DON 1 unpayable | n/a | not offered, not activated | availability blocked (COST), validation rejects, nothing moves | "initial infeasibility" |
 *
 * A terminal checkpoint during payment is a separate case: payment rollback
 * never revives a finished game. OPT-960 pins it in
 * opt-862-mid-resolution-deck-out.test.ts ("later cost: a MILL cost that
 * empties the deck stops the next cost from being paid") and in the
 * `terminated()` branch of `payCostsWithSelection` (cost/orchestrator.ts).
 *
 * Disposition (Decision 10): retained. Next review: OPT-948 acceptance
 * (replacement-aware activation-cost search), or earlier if an authored card
 * reaches this path or a ruling changes the interpretation.
 */
import { describe, expect, it } from "vitest";
import type { CardInstance } from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { computeEffectAvailability } from "../engine/availability.js";
import { validate } from "../engine/validation.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

const P0 = 0 as const;

const REST_THEN_TRASH_SELF: EffectBlock = {
  id: "opt958_rest_then_trash_self",
  category: "activate",
  trigger: { keyword: "ACTIVATE_MAIN" },
  flags: { once_per_turn: true },
  costs: [{ type: "REST_DON", amount: 1 }, { type: "TRASH_SELF" }],
  actions: [{ type: "DRAW", params: { amount: 1 } }],
};

function setup(): { r: Rig; ganzui: CardInstance } {
  const r = rig();
  r.deck(P0, 5);
  for (let i = 0; i < 3; i++) r.put(`opt958-hand-${i}`, P0, "HAND");
  const authored = getEffectSchema("OP17-043")!;
  const ganzui = r.put("OP17-043", P0, "CHARACTER", {
    schema: synSchema("OP17-043", [...authored.effects, REST_THEN_TRASH_SELF]),
  });
  return { r, ganzui };
}

const restedDon = (r: Rig) => r.state.players[P0].donCostArea.filter((d) => d.state === "RESTED").length;
const onField = (r: Rig, c: CardInstance) => r.state.players[P0].characters.some((x) => x?.instanceId === c.instanceId);
const used = (r: Rig, c: CardInstance) =>
  r.state.turn.oncePerTurnUsed[REST_THEN_TRASH_SELF.id]?.includes(c.instanceId) ?? false;

describe("OPT-864 Decision 10 — retained rollback after a replaced cost (KNOWN RULES DEVIATION, OPT-958)", () => {
  it("replaced after payment starts: retained rollback restores the DON!! and leaves the use unconsumed", () => {
    const { r, ganzui } = setup();
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: ganzui.instanceId, effectId: REST_THEN_TRASH_SELF.id });
    // REST_DON 1 is staged; TRASH_SELF raises Ganzui's replacement offer.
    r.accept();
    expect(r.promptType()).toBe("SELECT_TARGET");
    const hand = r.state.players[P0].hand.map((c) => c.instanceId);
    r.select(hand.slice(0, 2));

    // Both outcomes agree here: the substitute stands, Ganzui stays, and the
    // effect after the colon (DRAW 1) is not processed (8-3-1-7).
    expect(r.state.pendingPrompt).toBeNull();
    expect(onField(r, ganzui)).toBe(true);
    expect(r.state.players[P0].hand).toHaveLength(1);
    expect(r.state.players[P0].deck).toHaveLength(5);

    // RETAINED (deviation): the staged REST_DON payment is rolled back.
    // Rule-literal (8-3-1-3-1): the DON!! paid before the replacement stays
    // rested, so restedDon would be 1.
    expect(restedDon(r)).toBe(0);
    // RETAINED (deviation): the [Once Per Turn] use is not consumed, so the
    // player may retry. Rule-literal, ASSUMED reading: the use is consumed
    // (10-2-13-5 speaks of being "unable to pay"; this is a replaced cost
    // under 8-3-1-7, which says nothing about the use).
    expect(used(r, ganzui)).toBe(false);
    expect(validate(
      r.state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: ganzui.instanceId, effectId: REST_THEN_TRASH_SELF.id },
      r.db,
      P0,
    )).toBeNull();
  });

  it("declined: the printed cost is paid in full and the effect resolves", () => {
    const { r, ganzui } = setup();
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: ganzui.instanceId, effectId: REST_THEN_TRASH_SELF.id });
    r.decline();
    expect(r.state.pendingPrompt).toBeNull();
    expect(restedDon(r)).toBe(1);
    expect(onField(r, ganzui)).toBe(false);
    expect(r.state.players[P0].trash.some((c) => c.cardId === "OP17-043")).toBe(true);
    expect(r.state.players[P0].hand).toHaveLength(4);
    expect(r.state.players[P0].deck).toHaveLength(4);
  });

  it("initial infeasibility: no active DON!! — not offered, not activated, nothing moves", () => {
    const { r, ganzui } = setup();
    r.state.players[P0].donCostArea = r.state.players[P0].donCostArea.map((d) => ({ ...d, state: "RESTED" as const }));
    const before = structuredClone(r.state);
    expect(computeEffectAvailability(r.state, r.db)[ganzui.instanceId]
      ?.find((e) => e.effectId === REST_THEN_TRASH_SELF.id)).toEqual({
      effectId: REST_THEN_TRASH_SELF.id,
      status: "blocked",
      reason: "COST",
    });
    expect(validate(
      r.state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: ganzui.instanceId, effectId: REST_THEN_TRASH_SELF.id },
      r.db,
      P0,
    )).toBe("Cost cannot be paid");
    expect(r.state).toEqual(before);
  });
});
