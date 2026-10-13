/**
 * OPT-864 — availability, validation, the optional-effect prompt and the Life
 * Trigger cost gate decide payability with the sequential evaluator
 * (`isCostSequencePayable`). Activation-time prohibitions are covered in
 * opt-864-activation-prohibitions.test.ts.
 *
 * Canonical text (v1.2.0 repository rules, docs/cards):
 * - OP07-079 Rob Lucci (docs/cards/OP-07.md:568): "[When Attacking] You may
 *   trash 2 cards from the top of your deck: Give up to 1 of your opponent's
 *   Characters −1 cost during this turn."
 * - EB04-042 Alpha (docs/cards/EB-04.md:329): "[On Play] You may trash 3 cards
 *   from the top of your deck: Give up to 1 of your opponent's Characters −1
 *   cost during this turn."
 * - Ruling: docs/FAQs/qa_eb01.md:124-128 (EB01-051, same MILL cost shape):
 *   with too few cards in the deck the effect cannot be activated.
 *
 * Clause table
 * | Card / rule clause | Condition, evaluation time | Cost / payer | Target / chooser | Timing / continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | 8-3-1-3 + 8-3-1-4, Lucci (1-card deck) | MILL 2 unpayable when the [When Attacking] effect would be offered | MILL 2 / Lucci's controller | none (skipped) | auto effect is not activated; the attack continues | no OPTIONAL_EFFECT prompt, deck unchanged, no mill event, `effect.skipped` log | "Lucci with a 1-card deck" |
 * | 8-3-1-3 + 8-3-1-4, Alpha (2-card deck) | MILL 3 unpayable at [On Play] | MILL 3 / Alpha's controller | none | auto effect not activated | no prompt, deck unchanged, no mill event | "Alpha with a 2-card deck" |
 * | 8-3-1-1 printed order | the later cost is evaluated on the state after the earlier cost | TRASH_FROM_HAND 1 then PLACE_FROM_TRASH_TO_DECK 1 / activating player | the player picks the hand card; the trash card is forced | the sequence is payable; the post-cost DRAW resolves | availability `usable`, ACTIVATE_EFFECT valid, optional prompt offered, Life Trigger offered | "an earlier cost enables a later one" |
 *
 * Every pipeline scenario runs `runPipeline` and `resumePromptLifecycle`
 * through the OPT-960 rig. The [Activate: Main] and Trigger blocks are
 * synthetic: no authored card has an earlier cost that refills the zone a
 * later cost reads from.
 */
import { describe, expect, it, vi } from "vitest";
import type { CardInstance, GameState } from "../types.js";
import type { Cost, EffectBlock } from "../engine/effect-types.js";
import { computeEffectAvailability } from "../engine/availability.js";
import { validate } from "../engine/validation.js";
import { canOfferTrigger } from "../engine/effect-damage.js";
import { isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { isCostSequencePayable } from "../engine/effect-resolver/cost/feasibility.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { log } from "../lib/log.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

const P0 = 0 as const;
const P1 = 1 as const;

/** The earlier cost puts a card in the trash; the later cost needs one there. */
const ENABLING_COSTS: Cost[] = [
  { type: "TRASH_FROM_HAND", amount: 1 },
  { type: "PLACE_FROM_TRASH_TO_DECK", amount: 1 },
];

const ENABLED_ACTIVATE: EffectBlock = {
  id: "opt864_enabled_activate",
  category: "activate",
  trigger: { keyword: "ACTIVATE_MAIN" },
  costs: ENABLING_COSTS,
  actions: [{ type: "DRAW", params: { amount: 1 } }],
};

function millEvents(r: Rig) {
  return r.state.eventLog.filter((e) => e.type === "CARD_TRASHED" && e.payload.reason === "mill");
}

function availabilityOf(r: Rig, card: CardInstance, effectId: string) {
  return computeEffectAvailability(r.state, r.db)[card.instanceId]?.find((e) => e.effectId === effectId);
}

/**
 * Engine log events since this call. vitest.setup.ts replaces `log` with a
 * vi.fn, so the calls are read from the mock.
 */
function captureLogs(): () => Array<Record<string, unknown>> {
  const calls = vi.mocked(log).mock.calls;
  const start = calls.length;
  return () => calls.slice(start).map(([event, data]) => ({ event, ...(data ?? {}) }));
}

// ─── No false offer: the optional prompt checks the whole sequence ───────────

describe("OPT-864 optional auto effects with an unpayable cost sequence are skipped without a prompt", () => {
  function lucci(deckSize: number) {
    const r = rig();
    r.leader(P0, "OP07-079");
    r.deck(P0, deckSize);
    const target = r.put("opt864-target", P1, "CHARACTER", { data: { cost: 3 } });
    return { r, target };
  }

  it("Lucci with a 1-card deck: no prompt, no payment, the attack continues", () => {
    const logs = captureLogs();
    const { r } = lucci(1);
    r.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: r.state.players[P0].leader.instanceId,
      targetInstanceId: r.state.players[P1].leader.instanceId,
    });
    expect(r.promptType()).not.toBe("OPTIONAL_EFFECT");
    expect(r.state.effectStack.some((f) => f.phase === "AWAITING_OPTIONAL_RESPONSE")).toBe(false);
    expect(r.state.players[P0].deck).toHaveLength(1);
    expect(millEvents(r)).toHaveLength(0);
    // The attack proceeds to the Block Step.
    expect(r.state.turn.battleSubPhase).toBe("BLOCK_STEP");
    expect(logs()).toContainEqual(expect.objectContaining({
      event: "effect.skipped",
      blockId: "OP07-079_effect_1",
      reason: "cannot_pay_cost",
    }));
  });

  it("Lucci with a 4-card deck still offers the prompt (no change for payable effects)", () => {
    const { r } = lucci(4);
    r.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: r.state.players[P0].leader.instanceId,
      targetInstanceId: r.state.players[P1].leader.instanceId,
    });
    expect(r.promptType()).toBe("OPTIONAL_EFFECT");
  });

  it("Alpha with a 2-card deck: no prompt, no payment, Alpha stays on the field", () => {
    const logs = captureLogs();
    const r = rig();
    r.deck(P0, 2);
    r.put("opt864-target", P1, "CHARACTER", { data: { cost: 3 } });
    const alpha = r.put("EB04-042", P0, "HAND", { data: { cost: 2 } });
    r.act({ type: "PLAY_CARD", cardInstanceId: alpha.instanceId });
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.effectStack).toEqual([]);
    expect(r.state.players[P0].deck).toHaveLength(2);
    expect(millEvents(r)).toHaveLength(0);
    expect(r.state.players[P0].characters.some((c) => c?.cardId === "EB04-042")).toBe(true);
    expect(logs()).toContainEqual(expect.objectContaining({
      event: "effect.skipped",
      blockId: "on_play_mill_debuff",
      reason: "cannot_pay_cost",
    }));
  });

  it("Alpha with a 4-card deck still offers the prompt", () => {
    const r = rig();
    r.deck(P0, 4);
    const alpha = r.put("EB04-042", P0, "HAND", { data: { cost: 2 } });
    r.act({ type: "PLAY_CARD", cardInstanceId: alpha.instanceId });
    expect(r.promptType()).toBe("OPTIONAL_EFFECT");
  });
});

// ─── No false rejection: an earlier cost enables a later one ────────────────

describe("OPT-864 an earlier cost enables a later one (rule 8-3-1-1)", () => {
  function activateSetup() {
    const r = rig();
    r.deck(P0, 5);
    r.put("opt864-hand", P0, "HAND");
    const source = r.put("OPT864-SOURCE", P0, "CHARACTER", {
      schema: synSchema("OPT864-SOURCE", [ENABLED_ACTIVATE]),
    });
    expect(r.state.players[P0].trash).toEqual([]);
    return { r, source };
  }

  it("the single-cost check on the initial state rejects the later cost; the sequence is payable", () => {
    const { r, source } = activateSetup();
    expect(isCostPayable(r.state, ENABLING_COSTS[1], P0, r.db, source.instanceId)).toBe(false);
    expect(isCostSequencePayable(r.state, ENABLING_COSTS, P0, r.db, source.instanceId)).toBe(true);
  });

  it("availability reads usable", () => {
    const { r, source } = activateSetup();
    expect(availabilityOf(r, source, ENABLED_ACTIVATE.id)).toEqual({
      effectId: ENABLED_ACTIVATE.id,
      status: "usable",
    });
  });

  it("validation accepts ACTIVATE_EFFECT and the real payment completes", () => {
    const { r, source } = activateSetup();
    const handCard = r.state.players[P0].hand[0];
    expect(validate(
      r.state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: ENABLED_ACTIVATE.id },
      r.db,
      P0,
    )).toBeNull();
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: ENABLED_ACTIVATE.id });
    expect(r.promptType()).toBe("SELECT_TARGET");
    r.select([handCard.instanceId]);
    // The trashed card went to the deck bottom; DRAW 1 then resolved.
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[P0].trash).toEqual([]);
    expect(r.state.players[P0].deck).toHaveLength(5);
    expect(r.state.players[P0].deck.at(-1)?.cardId).toBe("opt864-hand");
    expect(r.state.players[P0].hand).toHaveLength(1);
  });

  it("the optional-effect prompt is offered for the same sequence", () => {
    const r = rig();
    r.deck(P0, 5);
    r.put("opt864-hand", P0, "HAND");
    const block: EffectBlock = {
      id: "opt864_enabled_on_play",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: ENABLING_COSTS,
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };
    const played = r.put("OPT864-ON-PLAY", P0, "HAND", {
      data: { cost: 1 },
      schema: synSchema("OPT864-ON-PLAY", [block]),
    });
    r.act({ type: "PLAY_CARD", cardInstanceId: played.instanceId });
    expect(r.promptType()).toBe("OPTIONAL_EFFECT");
  });

  it("the Life Trigger cost gate offers the same sequence", () => {
    const r = rig();
    const trigger: EffectBlock = {
      id: "opt864_enabled_trigger",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      flags: { optional: true },
      costs: ENABLING_COSTS,
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };
    r.put("OPT864-TRIGGER", P1, "LIFE", {
      data: { keywords: { ...r.db.get("CHAR-VANILLA")!.keywords, trigger: true } },
      schema: synSchema("OPT864-TRIGGER", [trigger]),
    });
    r.put("opt864-defender-hand", P1, "HAND");
    expect(r.state.players[P1].trash).toEqual([]);
    expect(canOfferTrigger(r.state, "OPT864-TRIGGER", r.db, P1, r.state.players[P1].life[0].instanceId)).toBe(true);
    r.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: r.state.players[P0].leader.instanceId,
      targetInstanceId: r.state.players[P1].leader.instanceId,
    });
    r.act({ type: "PASS" });
    r.act({ type: "PASS" });
    expect(r.state.turn.battle?.pendingTriggerLifeCard?.cardId).toBe("OPT864-TRIGGER");
  });
});

// ─── Hypothetical isolation and failure policy ──────────────────────────────

describe("OPT-864 a feasibility query leaves the authoritative state unchanged", () => {
  function frozen(state: GameState) {
    return structuredClone(state);
  }

  it("availability, validation, the Life Trigger gate and the optional skip leave state byte-identical", () => {
    const r = rig();
    r.deck(P0, 1);
    r.put("opt864-hand", P0, "HAND");
    const source = r.put("OPT864-SOURCE", P0, "CHARACTER", {
      schema: synSchema("OPT864-SOURCE", [ENABLED_ACTIVATE]),
    });
    const before = frozen(r.state);

    computeEffectAvailability(r.state, r.db);
    expect(r.state).toEqual(before);

    validate(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: ENABLED_ACTIVATE.id }, r.db, P0);
    expect(r.state).toEqual(before);

    const triggerBlock: EffectBlock = { ...ENABLED_ACTIVATE, id: "opt864_iso_trigger", category: "auto", trigger: { keyword: "TRIGGER" } };
    r.put("OPT864-ISO-TRIGGER", P0, "HAND", { schema: synSchema("OPT864-ISO-TRIGGER", [triggerBlock]) });
    const beforeTrigger = frozen(r.state);
    canOfferTrigger(r.state, "OPT864-ISO-TRIGGER", r.db, P0, source.instanceId);
    expect(r.state).toEqual(beforeTrigger);

    // Optional skip: MILL 2 with a 1-card deck. No frame, no ID, no event.
    const optional: EffectBlock = {
      id: "opt864_iso_optional",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      flags: { optional: true },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }, { type: "MILL", amount: 2 }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };
    const beforeSkip = frozen(r.state);
    const skipped = resolveEffect(r.state, optional, source.instanceId, P0, r.db);
    expect(r.state).toEqual(beforeSkip);
    expect(skipped.pendingPrompt).toBeUndefined();
    expect(skipped.events).toEqual([]);
    expect(skipped.state).toEqual(beforeSkip);
  });

  it("an engine error propagates from validation, and availability contains it per block (OPT-961)", () => {
    const r = rig();
    const corrupt = {
      ...ENABLED_ACTIVATE,
      id: "opt864_corrupt",
      costs: [{ type: "NOT_A_COST_TYPE" } as unknown as Cost],
    };
    const healthy = { ...ENABLED_ACTIVATE, id: "opt864_healthy", costs: [{ type: "REST_DON", amount: 1 } as Cost] };
    const source = r.put("OPT864-CORRUPT", P0, "CHARACTER", {
      schema: synSchema("OPT864-CORRUPT", [corrupt, healthy]),
    });
    // Validation and payment never read an engine error as "cannot pay".
    expect(() => validate(
      r.state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: corrupt.id },
      r.db,
      P0,
    )).toThrow(/Unhandled cost type/);
    // Availability is presentation: it logs, blocks that block, and keeps going.
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const entries = computeEffectAvailability(r.state, r.db)[source.instanceId];
      expect(entries).toEqual([
        { effectId: corrupt.id, status: "blocked", reason: "COST" },
        { effectId: healthy.id, status: "usable" },
      ]);
      expect(errors).toHaveBeenCalledTimes(1);
      expect(String(errors.mock.calls[0][0])).toMatch(/^\[EFFECT_AVAILABILITY\]/);
      expect(String(errors.mock.calls[0][2])).toMatch(/Unhandled cost type/);
    } finally {
      errors.mockRestore();
    }
  });

  it("availability keeps reporting COST before CONDITION when both fail (order unchanged)", () => {
    const r = rig();
    const both: EffectBlock = {
      id: "opt961_both_fail",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      conditions: { type: "LIFE_COUNT", controller: "SELF", operator: ">=", value: 99 },
      costs: [{ type: "MILL", amount: 99 }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };
    const source = r.put("OPT961-BOTH", P0, "CHARACTER", { schema: synSchema("OPT961-BOTH", [both]) });
    expect(availabilityOf(r, source, both.id)).toEqual({ effectId: both.id, status: "blocked", reason: "COST" });
  });

  it("a hypothetical MILL of the whole deck reads payable and does not end the game", () => {
    const r = rig();
    r.deck(P0, 2);
    const block: EffectBlock = {
      id: "opt864_mill_all",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "MILL", amount: 2 }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };
    const source = r.put("OPT864-MILL-ALL", P0, "CHARACTER", { schema: synSchema("OPT864-MILL-ALL", [block]) });
    const before = frozen(r.state);
    expect(availabilityOf(r, source, block.id)?.status).toBe("usable");
    expect(r.state).toEqual(before);
    expect(r.state.status).toBe("IN_PROGRESS");
  });
});
