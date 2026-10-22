/**
 * OPT-961 round 1, finding D — the batch re-check holds across a prompt that
 * a substitute itself raises, including a SessionRepository reload at that
 * nested prompt, and the narrowed match travels with the continuation.
 *
 * Canonical text: OP17-043 Ganzui (docs/cards/OP-17.md:313) "If this
 * Character would be removed from the field, you may trash 2 cards from your
 * hand instead." Rule 8-1-3-4-5: a replacement that cannot be carried out
 * cannot be applied.
 *
 * Clause table
 * | Card / rule clause | Condition, evaluation time | Cost / payer | Target / chooser | Timing / continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | OP17-043 ×2, 8-1-3-4-5 | 3-card hand; the first Ganzui's substitute (trash 2) leaves 1 card; the second is re-checked after the nested selection | trash 2 from hand / P0 | P0 accepts G1 and picks 2 cards | batch continues after the substitute's prompt | G2 not offered and K.O.'d once, G1 survives, hand 1 | "two Ganzui" (with and without reload) |
 * | 8-1-3-4-5, per-card substitute (synthetic) | a mandatory replacement rests REPLACED_CARD then trashes 1 (prompts); an earlier replacement rested B | rest the card + trash 1 / P0 | A and B matched; B infeasible at the offer | continuation protects only A | B K.O.'d once, A survives | "narrowed before the offer" |
 * | same, apply time (synthetic tamper) | optional variant offered for A and B; B rested before the reply | same | P0 accepts | apply-time re-check narrows to A; the substitute prompts | B K.O.'d once, A survives | "narrowed at apply time" |
 */
import { describe, expect, it } from "vitest";
import type { CardInstance } from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

const P0 = 0 as const;
const P1 = 1 as const;

const MASS_KO = synSchema("OPT961-MASS-KO", [{
  id: "opt961_mass_ko",
  category: "activate",
  trigger: { keyword: "MAIN_EVENT" },
  actions: [{
    type: "KO",
    target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true }, filter: { power_max: 8000 } },
  }],
}], "Event");

function massKO(r: Rig) {
  const event = r.put("OPT961-MASS-KO", P1, "HAND", {
    data: { type: "Event", cost: 1, power: null, counter: null, effectText: "[Main] K.O. all of your opponent's Characters with 8000 power or less." },
    schema: MASS_KO,
  });
  r.state.turn.activePlayerIndex = P1;
  r.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId }, P1);
}

const onField = (r: Rig, c: CardInstance) =>
  r.state.players[c.controller].characters.some((x) => x?.instanceId === c.instanceId);
const timesInTrash = (r: Rig, c: CardInstance) =>
  r.state.players[c.owner].trash.filter((x) => x.cardId === c.cardId).length;
const selectable = (r: Rig) => {
  const options = r.state.pendingPrompt?.options;
  return options?.promptType === "SELECT_TARGET" ? options.validTargets : [];
};

describe("OPT-961 batch re-check across a substitute's own prompt", () => {
  for (const reload of [false, true]) {
    it(`two Ganzui: the second is skipped after the first's substitute (reload=${reload})`, async () => {
      const r = rig();
      const g1 = r.put("OP17-043", P0, "CHARACTER", { data: { power: 5000 } });
      const g2 = r.put("OP17-043", P0, "CHARACTER", { data: { power: 5000 } });
      for (let i = 0; i < 3; i++) r.put(`opt961-hand-${i}`, P0, "HAND");
      r.deck(P0, 5);
      r.deck(P1, 5);
      massKO(r);
      // Assumed Decision 7 ordering: P0 chooses which own Ganzui to try first.
      expect(r.promptType()).toBe("PLAYER_CHOICE");
      const firstEffect = r.state.activeEffects.find((effect) => effect.sourceCardInstanceId === g1.instanceId)!;
      r.act({ type: "PLAYER_CHOICE", choiceId: firstEffect.id });
      expect(r.promptType()).toBe("OPTIONAL_EFFECT");
      r.accept();
      // The substitute's own selection: trash 2 of 3.
      expect(r.promptType()).toBe("SELECT_TARGET");
      if (reload) await r.reload();
      r.select(selectable(r).slice(0, 2));
      expect(r.state.pendingPrompt).toBeNull();
      expect(r.state.players[P0].hand).toHaveLength(1);
      const survivors = [g1, g2].filter((g) => onField(r, g));
      expect(survivors).toHaveLength(1);
      // Both copies share a card id: exactly one Ganzui reached the trash.
      expect(timesInTrash(r, g1)).toBe(1);
    });
  }

  /** B carries a mandatory "rest this card instead" for C; D a mandatory per-card replacement. */
  function divergence(optionalD: boolean) {
    const r = rig();
    for (let i = 0; i < 2; i++) r.put(`opt961-hand-${i}`, P0, "HAND");
    r.deck(P0, 5);
    r.deck(P1, 5);
    const a = r.put("OPT961-A", P0, "CHARACTER", { data: { power: 5000 } });
    const restForC: EffectBlock = {
      id: "opt961_b_rests_for_c",
      category: "replacement",
      replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD", target_filter: { name: "OPT961-C" } },
      replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
      flags: { optional: false },
    } as EffectBlock;
    const b = r.put("OPT961-B", P0, "CHARACTER", {
      data: { power: 5000 },
      schema: synSchema("OPT961-B", optionalD ? [] : [restForC]),
    });
    const c = r.put("OPT961-C", P0, "CHARACTER", { data: { power: 5000 } });
    const perCard: EffectBlock = {
      id: "opt961_d_rest_and_trash",
      category: "replacement",
      replaces: {
        event: "WOULD_BE_REMOVED_FROM_FIELD",
        target_filter: { controller: "SELF", card_type: "CHARACTER", name_any_of: ["OPT961-A", "OPT961-B"] },
      },
      replacement_actions: [
        { type: "SET_REST", target: { type: "REPLACED_CARD" } },
        { type: "TRASH_FROM_HAND", params: { amount: 1 } },
      ],
      flags: { optional: optionalD },
    } as EffectBlock;
    r.put("OPT961-D", P0, "CHARACTER", { data: { power: 9000 }, schema: synSchema("OPT961-D", [perCard]) });
    return { r, a, b, c };
  }

  it("narrowed before the offer: a mandatory substitute that prompts protects only the still-feasible card", () => {
    const { r, a, b, c } = divergence(false);
    massKO(r);
    expect(r.promptType()).toBe("PLAYER_CHOICE");
    const firstEffect = r.state.activeEffects.find((effect) => effect.sourceCardInstanceId === b.instanceId)!;
    r.act({ type: "PLAYER_CHOICE", choiceId: firstEffect.id });
    // B rested itself to save C; D's substitute rests A, then asks for a hand card.
    expect(r.promptType()).toBe("SELECT_TARGET");
    r.select(selectable(r).slice(0, 1));
    expect(r.state.pendingPrompt).toBeNull();
    expect(onField(r, c)).toBe(true);
    expect(onField(r, a)).toBe(true);
    expect(onField(r, b)).toBe(false);
    expect(timesInTrash(r, b)).toBe(1);
  });

  // Synthetic: no engine step runs between an offer and its reply.
  it("narrowed at apply time: the substitute's continuation protects only the still-feasible card", () => {
    const { r, a, b } = divergence(true);
    massKO(r);
    expect(r.promptType()).toBe("OPTIONAL_EFFECT");
    r.state.players[P0].characters = r.state.players[P0].characters.map((x) =>
      x?.instanceId === b.instanceId ? { ...x, state: "RESTED" as const } : x);
    r.accept();
    expect(r.promptType()).toBe("SELECT_TARGET");
    r.select(selectable(r).slice(0, 1));
    expect(r.state.pendingPrompt).toBeNull();
    expect(onField(r, a)).toBe(true);
    expect(onField(r, b)).toBe(false);
    expect(timesInTrash(r, b)).toBe(1);
  });
});
