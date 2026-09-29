/**
 * OPT-885 — schema lint: a `*_THIS_WAY` PER_COUNT source must be fillable by
 * a preceding cost (no `ref`) or a preceding action's `result_ref` (`ref`).
 */
import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import { getAllAuthoredSchemas, validateEffectSchema } from "../engine/schema-registry.js";
import {
  findThisWaySourceIntentViolations,
  findThisWaySourceViolations,
} from "../engine/schema-this-way-source-lint.js";

function schemaWith(effects: unknown[]): EffectSchema {
  return {
    card_id: "TEST-885",
    card_name: "This-way fixture",
    card_type: "Leader",
    effects,
  } as EffectSchema;
}

const perCount = (source: string, ref?: string) => ({
  type: "MODIFY_POWER",
  target: { type: "SELF" },
  params: {
    amount: { type: "PER_COUNT", source, multiplier: 1000, ...(ref ? { ref } : {}) },
  },
  duration: { type: "THIS_BATTLE" },
  chain: "THEN",
});

const trashAction = (resultRef?: string) => ({
  type: "TRASH_FROM_HAND",
  target: {
    type: "CARD_IN_HAND",
    controller: "SELF",
    count: { any_number: true },
    filter: { card_type: ["EVENT", "STAGE"] },
  },
  ...(resultRef ? { result_ref: resultRef } : {}),
});

const block = (extra: Record<string, unknown>) => ({
  id: "b",
  category: "auto",
  trigger: { keyword: "WHEN_ATTACKING" },
  flags: { optional: true },
  ...extra,
});

describe("OPT-885 *_THIS_WAY source lint", () => {
  it("rejects the pre-fix OP15-002 shape: action trash + ref-less CARDS_TRASHED_THIS_WAY", () => {
    const violations = findThisWaySourceViolations(
      schemaWith([block({ actions: [trashAction(), perCount("CARDS_TRASHED_THIS_WAY")] })]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("CARDS_TRASHED_THIS_WAY without 'ref'");
  });

  it.each([
    ["KO", "CHARACTERS_KO_THIS_WAY"],
    ["TRASH_CARD", "CARDS_TRASHED_THIS_WAY"],
    ["RETURN_TO_DECK", "CARDS_PLACED_TO_DECK_THIS_WAY"],
    ["RETURN_TO_HAND", "CHARACTERS_RETURNED_THIS_WAY"],
  ])("rejects the pre-fix %s → ref-less %s shape", (type, source) => {
    const violations = findThisWaySourceViolations(
      schemaWith([block({ actions: [{ type, target: { type: "CHARACTER", count: { any_number: true } } }, perCount(source)] })]),
    );
    expect(violations).toHaveLength(1);
  });

  it("accepts the fixed shape: result_ref on the action, ref on the source", () => {
    expect(findThisWaySourceViolations(
      schemaWith([block({ actions: [trashAction("t"), perCount("CARDS_TRASHED_THIS_WAY", "t")] })]),
    )).toEqual([]);
  });

  it("accepts a ref-less source when the block pays a filling cost", () => {
    expect(findThisWaySourceViolations(
      schemaWith([block({
        costs: [{ type: "REST_DON", amount: "ANY_NUMBER" }],
        actions: [perCount("DON_RESTED_THIS_WAY")],
      })]),
    )).toEqual([]);
  });

  it("rejects a ref-less source whose block cost fills a different ref", () => {
    const violations = findThisWaySourceViolations(
      schemaWith([block({
        costs: [{ type: "REST_DON", amount: 1 }],
        actions: [perCount("CARDS_TRASHED_THIS_WAY")],
      })]),
    );
    expect(violations).toHaveLength(1);
  });

  it("rejects a ref produced by a LATER action", () => {
    const violations = findThisWaySourceViolations(
      schemaWith([block({ actions: [perCount("CARDS_TRASHED_THIS_WAY", "t"), trashAction("t")] })]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("not the result_ref of an earlier action");
  });

  it("rejects a ref produced in a DIFFERENT effect block", () => {
    const violations = findThisWaySourceViolations(schemaWith([
      block({ id: "a", actions: [trashAction("t")] }),
      block({ id: "b", actions: [perCount("CARDS_TRASHED_THIS_WAY", "t")] }),
    ]));
    expect(violations).toHaveLength(1);
  });

  it("rejects a source that reads its own action's result_ref", () => {
    const violations = findThisWaySourceViolations(schemaWith([block({
      actions: [{
        type: "TRASH_CARD",
        target: { type: "CARD_IN_HAND", controller: "SELF", count: { up_to: 2 } },
        params: { amount: { type: "PER_COUNT", source: "CARDS_TRASHED_THIS_WAY", ref: "t", multiplier: 1 } },
        result_ref: "t",
      }],
    })]));
    expect(violations).toHaveLength(1);
  });

  it("counts a PER_COUNT ref as consuming its result_ref (validateEffectSchema)", () => {
    const errors = validateEffectSchema(
      schemaWith([block({ actions: [trashAction("t"), perCount("CARDS_TRASHED_THIS_WAY", "t")] })]),
      "TEST-885",
    );
    expect(errors.filter((error) => error.includes("'t'"))).toEqual([]);
  });

  it("rejects a ref whose producer does not count that source", () => {
    const violations = findThisWaySourceViolations(schemaWith([block({
      actions: [
        { type: "KO", target: { type: "CHARACTER", count: { up_to: 1 } }, result_ref: "k" },
        perCount("CARDS_TRASHED_THIS_WAY", "k"),
      ],
    })]));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("comes from KO");
  });

  it("rejects a source outside actions (block conditions / permanent modifiers)", () => {
    const violations = findThisWaySourceViolations(schemaWith([{
      id: "perm",
      category: "permanent",
      modifiers: [perCount("CARDS_TRASHED_THIS_WAY")],
    }]));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("outside actions");
  });

  it("scopes a granted (nested) effect block independently", () => {
    const granted = block({ actions: [trashAction("t"), perCount("CARDS_TRASHED_THIS_WAY", "t")] });
    expect(findThisWaySourceViolations(schemaWith([block({
      actions: [{ type: "GRANT_EFFECT", target: { type: "SELF" }, params: { effect: granted } }],
    })]))).toEqual([]);
    const brokenGranted = block({ actions: [trashAction(), perCount("CARDS_TRASHED_THIS_WAY")] });
    expect(findThisWaySourceViolations(schemaWith([block({
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "GRANT_EFFECT", target: { type: "SELF" }, params: { effect: brokenGranted } }],
    })]))).toHaveLength(1);
  });

  it("passes every authored card in the generated registry", () => {
    expect(findThisWaySourceIntentViolations(getAllAuthoredSchemas())).toEqual([]);
  });
});
