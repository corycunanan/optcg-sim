/**
 * OPT-793 — schema lint: TRASH_FROM_HAND with amount GAME_STATE HAND_COUNT
 * (whole-hand trash) needs a reviewed card/clause disposition.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import { getAllAuthoredSchemas, getEffectSchema } from "../engine/schema-registry.js";
import {
  WHOLE_HAND_TRASH_DISPOSITIONS,
  findWholeHandTrashIntentViolations,
  findWholeHandTrashViolations,
} from "../engine/schema-hand-trash-amount-lint.js";

const cardsDirectory = resolve(__dirname, "../../../../docs/cards");
const canonicalCards = readdirSync(cardsDirectory)
  .filter((file) => file.endsWith(".md"))
  .flatMap((file) =>
    readFileSync(resolve(cardsDirectory, file), "utf8")
      .split(/\n---\n/)
      .flatMap((text) => {
        const cardId = text.match(/\*\*([A-Z]+\d*-\d+)\*\*/)?.[1];
        return cardId ? [{ cardId, text }] : [];
      })
  );
const textOf = (cardId: string) => canonicalCards.find((card) => card.cardId === cardId)!.text;

const HAND_COUNT = (controller: "SELF" | "OPPONENT") => ({
  type: "GAME_STATE" as const,
  source: "HAND_COUNT" as const,
  controller,
});

/** OP05-058's pre-OPT-793 encoding: both hands trashed entirely. */
function legacyOp05058(): EffectSchema {
  const schema = structuredClone(getEffectSchema("OP05-058")!);
  const actions = schema.effects[0].actions!;
  actions[1] = {
    type: "TRASH_FROM_HAND",
    params: { amount: HAND_COUNT("SELF"), _comment: "Dynamic: both trim to 5." },
    chain: "THEN",
  };
  actions[2] = {
    type: "OPPONENT_ACTION",
    params: {
      action: { type: "TRASH_FROM_HAND", params: { amount: HAND_COUNT("OPPONENT") } },
    },
    chain: "THEN",
  };
  return schema;
}

describe("OPT-793 schema lint — whole-hand TRASH_FROM_HAND", () => {
  it("passes the authored registry with canonical card text", () => {
    expect(findWholeHandTrashIntentViolations(getAllAuthoredSchemas(), canonicalCards)).toEqual([]);
  });

  it("flags the legacy OP05-058 encoding, including the OPPONENT_ACTION-nested clause, despite _comment", () => {
    const violations = findWholeHandTrashViolations(legacyOp05058(), textOf("OP05-058"));
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain("OP05-058 effects[0].actions[1]:");
    expect(violations[1]).toContain("OP05-058 effects[0].actions[2].params.action:");
    expect(violations[0]).toContain("until_count");
  });

  it("accepts the re-authored OP05-058 (until_count)", () => {
    expect(findWholeHandTrashViolations(getEffectSchema("OP05-058")!, textOf("OP05-058"))).toEqual([]);
  });

  it("accepts OP14-048 only through its named disposition", () => {
    expect(WHOLE_HAND_TRASH_DISPOSITIONS["OP14-048"]).toBeDefined();
    const schema = getEffectSchema("OP14-048")!;
    expect(findWholeHandTrashViolations(schema, textOf("OP14-048"))).toEqual([]);
    expect(findWholeHandTrashViolations(schema, textOf("OP14-048"), {})).toHaveLength(1);
  });

  it("rejects a disposition whose printed clause is not on the card", () => {
    const [violation] = findWholeHandTrashViolations(
      getEffectSchema("OP14-048")!,
      "[On Play] Return up to 1 of your opponent's Characters to the owner's hand. Then, trash 1 card from your hand."
    );
    expect(violation).toContain("is not in the canonical card text");
  });

  it("rejects a disposition naming a different clause path", () => {
    const violations = findWholeHandTrashViolations(getEffectSchema("OP14-048")!, textOf("OP14-048"), {
      "OP14-048": [{ path: "effects[0].actions[0]", printed: "trash all cards from your hand" }],
    });
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain("effects[0].actions[1]: TRASH_FROM_HAND amount GAME_STATE HAND_COUNT");
    expect(violations[1]).toContain("effects[0].actions[0]: listed in WHOLE_HAND_TRASH_DISPOSITIONS");
  });

  it("reports a stale disposition once the card no longer trashes the whole hand", () => {
    const schema = structuredClone(getEffectSchema("OP14-048")!);
    schema.effects[0].actions![1] = { type: "TRASH_FROM_HAND", params: { amount: 1 } };
    const [violation] = findWholeHandTrashViolations(schema, textOf("OP14-048"));
    expect(violation).toContain("listed in WHOLE_HAND_TRASH_DISPOSITIONS but no whole-hand TRASH_FROM_HAND");
    expect(
      findWholeHandTrashIntentViolations({}, [], { "SYN-793": [{ path: "effects[0]", printed: "x" }] })
    ).toEqual([expect.stringContaining("SYN-793: listed in WHOLE_HAND_TRASH_DISPOSITIONS but has no authored schema")]);
  });

  it("rejects until_count combined with amount", () => {
    const schema = structuredClone(getEffectSchema("OP14-054")!);
    const block = schema.effects.find((effect) => effect.id === "OP14-054_end_of_turn")!;
    block.actions![0] = { type: "TRASH_FROM_HAND", params: { until_count: 5, amount: 2 } };
    const [violation] = findWholeHandTrashViolations(schema);
    expect(violation).toContain("sets both until_count and amount");
  });
});
