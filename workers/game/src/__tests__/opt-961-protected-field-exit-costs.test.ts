/**
 * OPT-961 round 1, finding A — a cost cannot move a card that an
 * activation-time prohibition protects against that movement.
 *
 * Rules (docs/rules/rule_comprehensive.md): 1-3-3 "the prohibiting effect
 * always takes precedence"; 8-3-1-3 "If it is not possible to pay some or all
 * of the activation cost, the activation cost ... cannot be paid at all."
 * Ruling: docs/FAQs/qa_op02.md:24-26 (OP02-004) and :82-84 (OP02-023): under
 * "you cannot add Life cards to your hand", a "You may add 1 card from the top
 * of your Life cards to your hand:" cost "cannot be paid", so the effect
 * "cannot be activated".
 *
 * Clause table
 * | Card / rule clause | Condition, evaluation time | Cost / payer | Target / chooser | Timing / continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | 1-3-3 + 8-3-1-3 | CANNOT_BE_KO (cause ANY) on the only own Character, at offer | KO_OWN_CHARACTER 1 / P0 | none eligible | not activatable | availability blocked (COST), validation rejects | "only target protected" |
 * | same | a second, unprotected Character exists | KO_OWN_CHARACTER 1 / P0 | P0 picks; the protected card is not offered | payment K.O.s the unprotected one, DRAW resolves | validTargets excludes it; picking it is rejected | "another target exists" |
 * | cause scope | CANNOT_BE_KO scoped "by your opponent's effects" | KO_OWN_CHARACTER 1 / P0 | P0 may pick it | own cost is not an opponent's effect | usable, payable with that card | "opponent-scoped protection" |
 * | 1-3-3 + 8-3-1-3, fixed movement | CANNOT_BE_REMOVED_FROM_FIELD (cause ANY) on the source | TRASH_SELF / P0 | fixed | not activatable | availability blocked (COST) | "fixed TRASH_SELF" |
 * | qa_op02.md:24-26 | CANNOT_ADD_LIFE_TO_HAND on P0 | LIFE_TO_HAND 1 / P0 | fixed | optional effect not offered | no prompt, Life unchanged | "Life to hand cost" |
 *
 * Reachability: the activating blocks are synthetic; OP02-004 / OP02-023 /
 * OP06 / ST15 author CANNOT_ADD_LIFE_TO_HAND and many cards author
 * LIFE_TO_HAND costs (see the PR's reachability inventory). The prohibitions
 * are applied through the real APPLY_PROHIBITION action.
 */
import { describe, expect, it } from "vitest";
import type { CardInstance } from "../types.js";
import type { EffectBlock, ProhibitionScope, ProhibitionType } from "../engine/effect-types.js";
import { computeEffectAvailability } from "../engine/availability.js";
import { validate } from "../engine/validation.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

const P0 = 0 as const;

const KO_COST: EffectBlock = {
  id: "opt961_ko_cost",
  category: "activate",
  trigger: { keyword: "ACTIVATE_MAIN" },
  costs: [{ type: "KO_OWN_CHARACTER", amount: 1 }],
  actions: [{ type: "DRAW", params: { amount: 1 } }],
};

const TRASH_SELF_COST: EffectBlock = {
  id: "opt961_trash_self_cost",
  category: "activate",
  trigger: { keyword: "ACTIVATE_MAIN" },
  costs: [{ type: "TRASH_SELF" }],
  actions: [{ type: "DRAW", params: { amount: 1 } }],
};

/** Player 0 protects its own cards named `name` (a real APPLY_PROHIBITION). */
function protect(r: Rig, name: string, prohibitionType: ProhibitionType, scope: ProhibitionScope) {
  const block: EffectBlock = {
    id: `opt961-protect-${prohibitionType}`,
    category: "auto",
    actions: [{
      type: "APPLY_PROHIBITION",
      target: { type: "CHARACTER", controller: "SELF", count: { all: true }, filter: { name } },
      params: { prohibition_type: prohibitionType, scope },
      duration: { type: "THIS_TURN" },
    }],
  };
  const result = resolveEffect(r.state, block, r.state.players[P0].leader.instanceId, P0, r.db);
  expect(result.pendingPrompt).toBeFalsy();
  r.state = result.state;
  const created = r.state.prohibitions.at(-1)!;
  expect(created.prohibitionType).toBe(prohibitionType);
  expect(created.appliesTo.length).toBeGreaterThan(0);
}

function availability(r: Rig, card: CardInstance, effectId: string) {
  return computeEffectAvailability(r.state, r.db)[card.instanceId]?.find((e) => e.effectId === effectId);
}

function activate(r: Rig, card: CardInstance, effectId: string) {
  return validate(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId }, r.db, P0);
}

function setup(block: EffectBlock) {
  const r = rig();
  r.deck(P0, 5);
  const source = r.put("OPT961-PROTECTED", P0, "CHARACTER", {
    schema: synSchema("OPT961-PROTECTED", [block]),
  });
  return { r, source };
}

describe("OPT-961 field-exit costs respect protecting prohibitions (rules 1-3-3, 8-3-1-3)", () => {
  it("only target protected: availability blocked and validation rejects", () => {
    const { r, source } = setup(KO_COST);
    expect(availability(r, source, KO_COST.id)?.status).toBe("usable");
    protect(r, "OPT961-PROTECTED", "CANNOT_BE_KO", { cause: "ANY" });
    expect(availability(r, source, KO_COST.id)).toEqual({ effectId: KO_COST.id, status: "blocked", reason: "COST" });
    expect(activate(r, source, KO_COST.id)).toBe("Cost cannot be paid");
  });

  it("another target exists: usable, the protected card is not offered and cannot be picked", () => {
    const { r, source } = setup(KO_COST);
    const other = r.put("OPT961-OTHER", P0, "CHARACTER");
    protect(r, "OPT961-PROTECTED", "CANNOT_BE_KO", { cause: "ANY" });
    expect(availability(r, source, KO_COST.id)?.status).toBe("usable");
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: KO_COST.id });
    const options = r.state.pendingPrompt?.options;
    expect(options?.promptType).toBe("SELECT_TARGET");
    expect(options?.promptType === "SELECT_TARGET" ? options.validTargets : []).toEqual([other.instanceId]);
    const { rejected } = r.respond({ type: "SELECT_TARGET", selectedInstanceIds: [source.instanceId] });
    expect(rejected).toBe(true);
    expect(r.state.players[P0].characters.some((c) => c?.instanceId === source.instanceId)).toBe(true);
    r.select([other.instanceId]);
    expect(r.state.players[P0].characters.some((c) => c?.instanceId === other.instanceId)).toBe(false);
    expect(r.state.players[P0].characters.some((c) => c?.instanceId === source.instanceId)).toBe(true);
    expect(r.state.players[P0].hand).toHaveLength(1);
  });

  it("opponent-scoped protection: the player's own cost may still K.O. it", () => {
    const { r, source } = setup(KO_COST);
    protect(r, "OPT961-PROTECTED", "CANNOT_BE_KO", { cause: "BY_OPPONENT_EFFECT" });
    expect(availability(r, source, KO_COST.id)?.status).toBe("usable");
    expect(activate(r, source, KO_COST.id)).toBeNull();
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: KO_COST.id });
    r.select([source.instanceId]);
    expect(r.state.players[P0].characters.some((c) => c?.instanceId === source.instanceId)).toBe(false);
    expect(r.state.players[P0].hand).toHaveLength(1);
  });

  it("fixed TRASH_SELF: a source protected from removal cannot pay it", () => {
    const { r, source } = setup(TRASH_SELF_COST);
    expect(availability(r, source, TRASH_SELF_COST.id)?.status).toBe("usable");
    protect(r, "OPT961-PROTECTED", "CANNOT_BE_REMOVED_FROM_FIELD", { cause: "ANY" });
    expect(availability(r, source, TRASH_SELF_COST.id)).toEqual({
      effectId: TRASH_SELF_COST.id, status: "blocked", reason: "COST",
    });
    expect(activate(r, source, TRASH_SELF_COST.id)).toBe("Cost cannot be paid");
  });

  it("Life to hand cost under CANNOT_ADD_LIFE_TO_HAND: the optional effect is not offered (qa_op02.md:24-26)", () => {
    const r = rig();
    r.deck(P0, 5);
    r.life(P0, 3);
    const apply: EffectBlock = {
      id: "opt961-no-life-to-hand",
      category: "auto",
      actions: [{
        type: "APPLY_PROHIBITION",
        params: { prohibition_type: "CANNOT_ADD_LIFE_TO_HAND", scope: { controller: "SELF" } },
        duration: { type: "THIS_TURN" },
      }],
    };
    const optional: EffectBlock = {
      id: "opt961_life_cost",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "LIFE_TO_HAND", amount: 1, position: "TOP" }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };
    const source = r.put("OPT961-LIFE-COST", P0, "CHARACTER", { schema: synSchema("OPT961-LIFE-COST", [optional]) });
    expect(resolveEffect(r.state, optional, source.instanceId, P0, r.db).pendingPrompt?.options.promptType)
      .toBe("OPTIONAL_EFFECT");
    r.state = resolveEffect(r.state, apply, r.state.players[P0].leader.instanceId, P0, r.db).state;
    const skipped = resolveEffect(r.state, optional, source.instanceId, P0, r.db);
    expect(skipped.pendingPrompt).toBeUndefined();
    expect(skipped.state.players[P0].life).toHaveLength(3);
  });
});

// ─── Round 2 (G1): effect- and battle-scoped protections never gate a cost ──
//
// A cost matches only an unscoped / cause ANY protection. The authored
// aliases BY_EFFECT (OP09-033 "cannot be K.O.'d by effects", op09.ts) and
// IN_BATTLE (OP02-118 "cannot be K.O.'d during this battle", op02.ts) protect
// against effects and battle, not against the player's own K.O. cost.
describe("OPT-961 round 2: effect- and battle-scoped protections allow the player's own cost", () => {
  /** Run the authored APPLY_PROHIBITION action (its real scope object). */
  function applyAuthored(r: Rig, cardId: string, blockId: string, targetOverride?: EffectBlock["actions"]) {
    const authored = getEffectSchema(cardId)!.effects.find((b) => b.id === blockId)!;
    const action = authored.actions!.find((a) => a.type === "APPLY_PROHIBITION")!;
    const block: EffectBlock = {
      id: `opt961-r2-${cardId}`,
      category: "auto",
      actions: targetOverride ?? [action],
    };
    const result = resolveEffect(r.state, block, r.state.players[P0].leader.instanceId, P0, r.db);
    expect(result.pendingPrompt).toBeFalsy();
    r.state = result.state;
    const created = r.state.prohibitions.at(-1)!;
    expect(created.prohibitionType).toBe("CANNOT_BE_KO");
    return { created, action };
  }

  function expectPayable(r: Rig, source: CardInstance) {
    expect(availability(r, source, KO_COST.id)?.status).toBe("usable");
    expect(activate(r, source, KO_COST.id)).toBeNull();
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: KO_COST.id });
    r.select([source.instanceId]);
    expect(r.state.players[P0].characters.some((c) => c?.instanceId === source.instanceId)).toBe(false);
    expect(r.state.players[P0].hand).toHaveLength(1);
  }

  it("OP09-033 (authored action, scope BY_EFFECT): the protected Straw Hat Character still pays a K.O. cost", () => {
    const r = rig();
    r.deck(P0, 5);
    const source = r.put("OPT961-STRAW-HAT", P0, "CHARACTER", {
      data: { types: ["Straw Hat Crew"] },
      schema: synSchema("OPT961-STRAW-HAT", [KO_COST]),
    });
    const { created } = applyAuthored(r, "OP09-033", "on_play_ko_protection");
    expect(created.scope).toEqual({ cause: "BY_EFFECT" });
    expect(created.appliesTo).toContain(source.instanceId);
    expectPayable(r, source);
  });

  it("OP02-118 (authored scope IN_BATTLE): the protected Character still pays a K.O. cost", () => {
    const r = rig();
    r.deck(P0, 5);
    const source = r.put("OPT961-JEWEL-TARGET", P0, "CHARACTER", { schema: synSchema("OPT961-JEWEL-TARGET", [KO_COST]) });
    const authored = getEffectSchema("OP02-118")!.effects.find((b) => b.id === "counter_protection")!;
    const action = authored.actions!.find((a) => a.type === "APPLY_PROHIBITION")!;
    // Same action and scope object; the "up to 1" choice is fixed to the source.
    const fixedTarget = {
      ...action,
      target: { type: "CHARACTER", controller: "SELF", count: { all: true }, filter: { name: "OPT961-JEWEL-TARGET" } },
    } as NonNullable<EffectBlock["actions"]>[number];
    const { created } = applyAuthored(r, "OP02-118", "counter_protection", [fixedTarget]);
    expect(created.scope).toEqual({ cause: "IN_BATTLE" });
    expect(created.appliesTo).toContain(source.instanceId);
    expectPayable(r, source);
  });

  it("control: an unscoped CANNOT_BE_KO still blocks the K.O. cost", () => {
    const { r, source } = setup(KO_COST);
    protect(r, "OPT961-PROTECTED", "CANNOT_BE_KO", {});
    expect(availability(r, source, KO_COST.id)).toEqual({ effectId: KO_COST.id, status: "blocked", reason: "COST" });
    expect(activate(r, source, KO_COST.id)).toBe("Cost cannot be paid");
  });
});
