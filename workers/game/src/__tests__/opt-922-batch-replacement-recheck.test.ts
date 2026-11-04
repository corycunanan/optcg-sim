/**
 * OPT-922 — the batch replacement path re-checks substitute feasibility
 * before it offers and before it applies each replacement.
 *
 * Canonical text (docs/cards/OP-15.md):
 * - OP15-098 Monkey.D.Luffy (Leader, :721-723): "If your {Sky Island} type
 *   Character with 6000 base power or more would be removed from the field by
 *   your opponent, you may add 1 card from the top of your Life cards to your
 *   hand instead."
 * - OP15-105 Jewelry Bonney (:774-776): "If your Character with 7000 base
 *   power or less would be removed from the field by your opponent's effect,
 *   you may add 1 card from the top of your Life cards to your hand instead."
 *
 * Rules (docs/rules/rule_comprehensive.md): 8-1-3-4-5 "If it is not possible
 * to carry out the replacement effect specified by 'instead', that
 * replacement effect cannot be applied." 8-1-3-4-1: a declined replacement is
 * not resolved. Feasibility is judged when each replacement would apply, so an
 * earlier substitute that spent the last Life card leaves a later "add 1 Life
 * card to hand instead" impossible, and its card is K.O.'d as the original
 * event says.
 *
 * Clause table
 * | Card / rule clause | Condition, evaluation time | Cost / payer | Target / chooser | Timing / continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | OP15-098 + OP15-105, 8-1-3-4-5 | 1 Life; Luffy accepted first spends it; Bonney is re-checked before its offer | top Life to hand / P0 | A (5000, Bonney only), B (6000 {Sky Island}, both) / P0 accepts | batch continues to the next match, then the original K.O. | A K.O.'d once, B survives, Life 0, exactly 1 Life card to hand | "an earlier accepted substitute" |
 * | same | 2 Life; both feasible at their offers | 1 Life each / P0 | A, B / P0 accepts both | both replaced | A and B survive, Life 0, 2 cards to hand | "both remain feasible" |
 * | 8-1-3-4-1 | 1 Life; P0 declines Luffy | none | B / P0 declines, Bonney still offered | declined card stays in the event | decline both: A and B each K.O.'d once | "decline" |
 * | 8-1-3-4-5 after reload | Luffy prompt saved and loaded (SessionRepository) | 1 Life / P0 | B / P0 accepts after reload | Bonney re-checked on the loaded state | same as the first row | "save/load" |
 * | 8-1-3-4-5, non-optional | 1 Life; a mandatory Bonney-shaped replacement (synthetic) re-checked before it applies | Life to hand / P0 | A | original K.O. | A K.O.'d, Life 0 | "non-optional" |
 * | 8-1-3-4-5 at apply time | Bonney offered with 2 Life, then Life emptied before the reply (synthetic tamper) | none | A / P0 accepts | re-checked before apply | A K.O.'d, nothing moved | "before apply" |
 *
 * The opponent's mass K.O. is a synthetic Event ("K.O. all of your opponent's
 * Characters with 8000 power or less"); both replacements are the production
 * authored schemas. Every action runs through `runPipeline` and every reply
 * through `resumePromptLifecycle` (OPT-960 rig).
 */
import { describe, expect, it } from "vitest";
import type { CardInstance } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

const P0 = 0 as const;
const P1 = 1 as const;

const MASS_KO = synSchema("OPT922-MASS-KO", [{
  id: "opt922_mass_ko",
  category: "activate",
  trigger: { keyword: "MAIN_EVENT" },
  actions: [{
    type: "KO",
    target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true }, filter: { power_max: 8000 } },
  }],
}], "Event");

/** OP15-105 with `optional: false` — a synthetic non-optional match. */
function mandatoryBonney(): EffectSchema {
  const authored = structuredClone(getEffectSchema("OP15-105")!);
  authored.card_id = "OPT922-BONNEY-MANDATORY";
  authored.effects[0].flags = { ...authored.effects[0].flags, optional: false };
  return authored;
}

function setup(lifeCount: number, opts: { mandatoryBonney?: boolean } = {}) {
  const r = rig();
  r.leader(P0, "OP15-098");
  if (opts.mandatoryBonney) {
    r.put("OPT922-BONNEY-MANDATORY", P0, "CHARACTER", { data: { cost: 4, power: 9000 }, schema: mandatoryBonney() });
  } else {
    r.put("OP15-105", P0, "CHARACTER", { data: { cost: 4, power: 9000 } });
  }
  const a = r.put("OPT922-A", P0, "CHARACTER", { data: { cost: 3, power: 5000 } });
  const b = r.put("OPT922-B", P0, "CHARACTER", { data: { cost: 4, power: 6000, types: ["Sky Island"] } });
  r.life(P0, lifeCount);
  r.deck(P0, 5);
  r.deck(P1, 5);
  return { r, a, b };
}

/** Player 1 plays the mass K.O. Event. */
function massKO(r: Rig) {
  const event = r.put("OPT922-MASS-KO", P1, "HAND", {
    data: {
      type: "Event",
      cost: 1,
      power: null,
      counter: null,
      effectText: "[Main] K.O. all of your opponent's Characters with 8000 power or less.",
    },
    schema: MASS_KO,
  });
  r.state.turn.activePlayerIndex = P1;
  r.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId }, P1);
  // Decision 7: the non-turn player chooses the order of competing replacements.
  if (r.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
    const effect = r.state.activeEffects.find(
      (candidate) =>
        candidate.sourceCardInstanceId === r.state.players[P0].leader.instanceId
    )!;
    r.act({ type: "PLAYER_CHOICE", choiceId: effect.id }, P0);
  }
}

const onField = (r: Rig, c: CardInstance) =>
  r.state.players[c.controller].characters.some((x) => x?.instanceId === c.instanceId);
/** Times a card id reached its owner's trash (zone moves assign new instance ids). */
const timesInTrash = (r: Rig, c: CardInstance) =>
  r.state.players[c.owner].trash.filter((x) => x.cardId === c.cardId).length;
const koEvents = (r: Rig, c: CardInstance) =>
  r.state.eventLog.filter((e) => e.type === "CARD_KO" && e.payload.cardId === c.cardId).length;
/** The source card of the pending batch replacement prompt. */
const offeredBy = (r: Rig) => {
  const options = r.state.pendingPrompt?.options;
  return options?.promptType === "OPTIONAL_EFFECT" ? options.cards?.[0]?.cardId : undefined;
};

describe("OPT-922 batch replacements re-check substitute feasibility", () => {
  it("an earlier accepted substitute spends the last Life: the later replacement is skipped and A is K.O.'d once", () => {
    const { r, a, b } = setup(1);
    const handBefore = r.state.players[P0].hand.length;
    massKO(r);
    expect(r.promptType()).toBe("OPTIONAL_EFFECT");
    expect(offeredBy(r)).toBe("OP15-098");
    r.accept();
    // Bonney's substitute (top Life to hand) is no longer possible.
    expect(r.state.pendingPrompt).toBeNull();
    expect(onField(r, b)).toBe(true);
    expect(onField(r, a)).toBe(false);
    expect(timesInTrash(r, a)).toBe(1);
    expect(koEvents(r, a)).toBe(1);
    expect(r.state.players[P0].life).toHaveLength(0);
    expect(r.state.players[P0].hand).toHaveLength(handBefore + 1);
  });

  it("both remain feasible: both prompts, both saved, two Life cards spent", () => {
    const { r, a, b } = setup(2);
    const handBefore = r.state.players[P0].hand.length;
    massKO(r);
    expect(offeredBy(r)).toBe("OP15-098");
    r.accept();
    expect(offeredBy(r)).toBe("OP15-105");
    r.accept();
    expect(r.state.pendingPrompt).toBeNull();
    expect(onField(r, a)).toBe(true);
    expect(onField(r, b)).toBe(true);
    expect(r.state.players[P0].life).toHaveLength(0);
    expect(r.state.players[P0].hand).toHaveLength(handBefore + 2);
  });

  it("decline: the next eligible replacement is still offered, and declined cards are K.O.'d exactly once", () => {
    const { r, a, b } = setup(1);
    massKO(r);
    expect(offeredBy(r)).toBe("OP15-098");
    r.decline();
    expect(offeredBy(r)).toBe("OP15-105");
    r.decline();
    expect(r.state.pendingPrompt).toBeNull();
    for (const card of [a, b]) {
      expect(onField(r, card)).toBe(false);
      expect(timesInTrash(r, card)).toBe(1);
      expect(koEvents(r, card)).toBe(1);
    }
    expect(r.state.players[P0].life).toHaveLength(1);
  });

  it("save/load mid-batch: the re-check still applies to the loaded state", async () => {
    const { r, a, b } = setup(1);
    massKO(r);
    expect(offeredBy(r)).toBe("OP15-098");
    await r.reload();
    expect(offeredBy(r)).toBe("OP15-098");
    r.accept();
    expect(r.state.pendingPrompt).toBeNull();
    expect(onField(r, b)).toBe(true);
    expect(onField(r, a)).toBe(false);
    expect(timesInTrash(r, a)).toBe(1);
    expect(r.state.players[P0].life).toHaveLength(0);
  });

  it("non-optional: a stale mandatory match is re-checked before it applies", () => {
    const { r, a, b } = setup(1, { mandatoryBonney: true });
    massKO(r);
    expect(offeredBy(r)).toBe("OP15-098");
    r.accept();
    expect(r.state.pendingPrompt).toBeNull();
    expect(onField(r, b)).toBe(true);
    expect(onField(r, a)).toBe(false);
    expect(timesInTrash(r, a)).toBe(1);
    expect(r.state.players[P0].life).toHaveLength(0);
  });

  // Synthetic: no engine step runs between an offer and its reply, so this
  // edits the state directly to prove the apply-time guard on its own.
  it("before apply: a replacement that became infeasible after its offer falls through to the K.O.", () => {
    const { r, a, b } = setup(2);
    massKO(r);
    r.accept();
    expect(offeredBy(r)).toBe("OP15-105");
    const handBefore = r.state.players[P0].hand.length;
    r.state.players[P0].life = [];
    r.accept();
    expect(r.state.pendingPrompt).toBeNull();
    expect(onField(r, b)).toBe(true);
    expect(onField(r, a)).toBe(false);
    expect(timesInTrash(r, a)).toBe(1);
    expect(r.state.players[P0].hand).toHaveLength(handBefore);
  });
});
