/**
 * OPT-958: cost semantics mode9 corrects the Decision 10 rollback.
 *
 * Rules (docs/rules/rule_comprehensive.md, v1.2.0):
 * - 8-3-1-3-1: once paying has started, what was paid stays paid and the
 *   effect after the colon does not resolve.
 * - 8-3-1-7: a replaced activation cost is not "paid as described in the
 *   text", so the effect after the colon is not processed.
 * - 10-2-13-5: a [Once Per Turn] effect whose cost was not completed cannot
 *   be activated again that turn. Mode9 applies it to a replaced cost, the
 *   same reading the Life-cost replacement path already uses
 *   (opt-822-life-replacement.test.ts).
 *
 * Mode9 offers a cost-exit replacement on the staged payment, so the earlier
 * cost is already paid while the offer is open. Modes6–8 keep the retained
 * Decision 10 rollback (opt-864-decision-10-replaced-cost-rollback.test.ts,
 * opt-969-mode8-policy.test.ts), so a game never changes behavior mid-game.
 *
 * | Case | Mode9 outcome | Test |
 * |---|---|---|
 * | Authored ST22-005 Oden + OP17-043 Ganzui, substitute accepted | 3 DON!! stay rested, Ganzui stays, Oden stays rested, use spent, retry rejected | "accept" |
 * | Same, substitute declined | printed cost paid, Oden set active, use spent | "decline" |
 * | Synthetic REST_DON 1 then TRASH_SELF (fixed exit), accepted | DON!! stays rested, no draw, use spent | "fixed exit accepted" |
 * | Same, declined | printed cost paid, draw resolves | "fixed exit declined" |
 * | Same, no active DON!! | initial infeasibility unchanged: not offered, nothing moves | "initial infeasibility" |
 */
import { describe, expect, it } from "vitest";
import type { CardInstance } from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { computeEffectAvailability } from "../engine/availability.js";
import { validate } from "../engine/validation.js";
import { retainsReplacedCostPrefix } from "../engine/native-cost-semantics.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";
import { command, capture } from "./opt-997-corpus-support.js";

const P0 = 0 as const;
const restedDon = (r: Rig) => r.state.players[P0].donCostArea.filter((d) => d.state === "RESTED").length;
const onField = (r: Rig, c: CardInstance) => r.state.players[P0].characters.some((x) => x?.instanceId === c.instanceId);

function mode9(r: Rig): Rig {
  r.state.schemaVersion = 8;
  r.state.costSemanticsVersion = 9;
  return r;
}

describe("OPT-958 mode9 gate", () => {
  it("applies to explicit cost mode 9 only", () => {
    for (const schemaVersion of [8, 9, 10, 11] as const) {
      expect(retainsReplacedCostPrefix({ schemaVersion, costSemanticsVersion: 9 })).toBe(true);
      for (const costSemanticsVersion of [6, 7, 8] as const)
        expect(retainsReplacedCostPrefix({ schemaVersion, costSemanticsVersion })).toBe(false);
    }
    expect(retainsReplacedCostPrefix({ schemaVersion: 7 })).toBe(false);
  });
});

for (const reload of [false, true]) for (const accept of [false, true]) it(`mode9 authored Oden/Ganzui ${accept ? "accept" : "decline"} keeps the paid DON!! and spends the use reload=${reload}`, async () => {
  const r = mode9(rig()); r.deck(0, 5); r.deck(1, 5);
  r.leader(0, "OP01-060");
  const source = r.put("ST22-005", 0, "CHARACTER", { state: "RESTED" });
  const target = r.put("OP17-043", 0, "CHARACTER");
  for (let i = 0; i < 3; i++) r.put(`mode9-hand-${i}`, 0, "HAND");
  const activate = { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate_set_active" } as const;
  r.state = command(r.state, activate, r.db);
  expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  if (reload) await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, r.db);
  expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  if (reload) await capture(r);
  r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] }, r.db);
  // Ganzui's offer is open on the staged payment: the 3 DON!! are already paid.
  expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  expect(restedDon(r)).toBe(3);
  if (reload) await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: accept ? "accept" : "skip" }, r.db);
  if (accept) {
    expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (reload) await capture(r);
    const prompt = r.state.pendingPrompt!.options;
    if (prompt.promptType !== "SELECT_TARGET") throw new Error("missing hand payment");
    r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: prompt.validTargets.slice(0, 2) }, r.db);
  }
  if (reload) await capture(r);
  expect(r.state.costSemanticsVersion).toBe(9);
  expect(r.state.effectStack).toHaveLength(0);
  expect(r.state.pendingPrompt).toBeNull();
  // 8-3-1-3-1: the DON!! paid before the replacement stay rested either way.
  expect(restedDon(r)).toBe(3);
  // 8-3-1-7: with the substitute, the effect after the colon does not run, so Oden stays rested.
  expect(r.state.players[0].characters.find((c) => c?.instanceId === source.instanceId)!.state).toBe(accept ? "RESTED" : "ACTIVE");
  expect(onField(r, target)).toBe(accept);
  expect(r.state.players[0].hand).toHaveLength(accept ? 1 : 4);
  // 10-2-13-5: the use is spent either way, so there is no retry.
  expect(r.state.turn.oncePerTurnUsed.activate_set_active).toContain(source.instanceId);
  expect(validate(r.state, activate, r.db, P0)).not.toBeNull();
});

const REST_THEN_TRASH_SELF: EffectBlock = {
  id: "opt958_mode9_rest_then_trash_self",
  category: "activate",
  trigger: { keyword: "ACTIVATE_MAIN" },
  flags: { once_per_turn: true },
  costs: [{ type: "REST_DON", amount: 1 }, { type: "TRASH_SELF" }],
  actions: [{ type: "DRAW", params: { amount: 1 } }],
};

/** Synthetic (no authored card has this shape): Ganzui's authored replacement
 * plus a grafted "rest 1 DON!!, then trash this Character" activation. It
 * reaches the fixed-exit path, which has no selection prompt. */
function fixedExit(): { r: Rig; ganzui: CardInstance } {
  const r = mode9(rig());
  r.deck(P0, 5);
  for (let i = 0; i < 3; i++) r.put(`opt958-mode9-hand-${i}`, P0, "HAND");
  const authored = getEffectSchema("OP17-043")!;
  const ganzui = r.put("OP17-043", P0, "CHARACTER", {
    schema: synSchema("OP17-043", [...authored.effects, REST_THEN_TRASH_SELF]),
  });
  return { r, ganzui };
}
const used = (r: Rig, c: CardInstance) =>
  r.state.turn.oncePerTurnUsed[REST_THEN_TRASH_SELF.id]?.includes(c.instanceId) ?? false;
const activateFixed = (c: CardInstance) =>
  ({ type: "ACTIVATE_EFFECT", cardInstanceId: c.instanceId, effectId: REST_THEN_TRASH_SELF.id }) as const;

describe("OPT-958 mode9 fixed-exit replaced cost (synthetic)", () => {
  it("fixed exit accepted: the DON!! stays rested, nothing after the colon runs, and the use is spent", () => {
    const { r, ganzui } = fixedExit();
    r.act(activateFixed(ganzui));
    expect(restedDon(r)).toBe(1);
    r.accept();
    expect(r.promptType()).toBe("SELECT_TARGET");
    r.select(r.state.players[P0].hand.map((c) => c.instanceId).slice(0, 2));
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.effectStack).toHaveLength(0);
    expect(onField(r, ganzui)).toBe(true);
    expect(r.state.players[P0].hand).toHaveLength(1);
    expect(r.state.players[P0].deck).toHaveLength(5);
    expect(restedDon(r)).toBe(1);
    expect(used(r, ganzui)).toBe(true);
    expect(validate(r.state, activateFixed(ganzui), r.db, P0)).not.toBeNull();
  });

  it("fixed exit declined: the printed cost is paid and the effect resolves", () => {
    const { r, ganzui } = fixedExit();
    r.act(activateFixed(ganzui));
    r.decline();
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.effectStack).toHaveLength(0);
    expect(restedDon(r)).toBe(1);
    expect(onField(r, ganzui)).toBe(false);
    expect(r.state.players[P0].hand).toHaveLength(4);
    expect(r.state.players[P0].deck).toHaveLength(4);
    expect(used(r, ganzui)).toBe(true);
  });

  it("initial infeasibility: no active DON!! — not offered, not activated, nothing moves", () => {
    const { r, ganzui } = fixedExit();
    r.state.players[P0].donCostArea = r.state.players[P0].donCostArea.map((d) => ({ ...d, state: "RESTED" as const }));
    const before = structuredClone(r.state);
    expect(computeEffectAvailability(r.state, r.db)[ganzui.instanceId]
      ?.find((e) => e.effectId === REST_THEN_TRASH_SELF.id)).toEqual({
      effectId: REST_THEN_TRASH_SELF.id,
      status: "blocked",
      reason: "COST",
    });
    expect(validate(r.state, activateFixed(ganzui), r.db, P0)).toBe("Cost cannot be paid");
    expect(r.state).toEqual(before);
  });
});

describe("OPT-958 mode9 mandatory K.O. substitute (synthetic cost, authored OP08-045 Thatch)", () => {
  for (const reload of [false, true]) it(`REST_DON then KO_OWN_CHARACTER replaced by Thatch keeps the DON!! rested and spends the use reload=${reload}`, async () => {
    const r = mode9(rig()); r.deck(0, 10); r.deck(1, 10); r.leader(0, "OP11-001");
    r.state.turn.activePlayerIndex = 0;
    const thatch = r.put("OP08-045", 0, "CHARACTER");
    const source = r.put("OPT958-GRAFTED-COST", 0, "CHARACTER", { schema: synSchema("OPT958-GRAFTED-COST", [{
      id: "grafted", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, flags: { once_per_turn: true },
      costs: [{ type: "REST_DON", amount: 1 }, { type: "KO_OWN_CHARACTER", amount: 1 }],
      actions: [{ type: "DRAW", params: { amount: 4 } }],
    }]) });
    r.state.players[0].donCostArea = [{ instanceId: "opt958-grafted-don", state: "ACTIVE", attachedTo: null }];
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "grafted" });
    if (r.promptType() === "OPTIONAL_EFFECT") r.accept();
    expect(r.promptType()).toBe("SELECT_TARGET");
    if (reload) await capture(r);
    r.select([thatch.instanceId]);
    if (r.promptType() === "OPTIONAL_EFFECT") { if (reload) await capture(r); r.accept(); }
    if (reload) await capture(r);
    // Thatch's substitute trashes itself and draws 1; the grafted DRAW 4 is skipped.
    expect(r.state.effectStack).toEqual([]);
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[0].hand).toHaveLength(1);
    expect(onField(r, thatch)).toBe(false);
    expect(r.state.eventLog.filter((event) => event.type === "CARD_KO")).toEqual([]);
    expect(r.state.players[0].donCostArea[0].state).toBe("RESTED");
    expect(r.state.turn.oncePerTurnUsed.grafted).toEqual([source.instanceId]);
    expect(r.state.costSemanticsVersion).toBe(9);
  });
});
