import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findHandTrashTriggerViolations } from "../engine/trigger-schema-coverage.js";
import {
  getEffectSchema,
  validateEffectSchema,
} from "../engine/schema-registry.js";

const directory = resolve(__dirname, "../../../../docs/cards");
const cards = readdirSync(directory)
  .filter((file) => file.endsWith(".md"))
  .flatMap((file) =>
    readFileSync(resolve(directory, file), "utf8")
      .split(/\n---\n/)
      .flatMap((text) => {
        const id = text.match(/\*\*([A-Z]+\d*-\d+)\*\*/)?.[1];
        return id && /trashed from your hand/i.test(text) ? [{ id, text }] : [];
      })
  );

describe("OPT-795 printed hand-trash schema lint", () => {
  it("audits the complete documented card pool", () => {
    expect(cards.map((card) => card.id).sort()).toEqual([
      "OP12-040",
      "OP14-045",
      "OP14-049",
      "OP14-056",
    ]);
  });
  it.each(cards)(
    "$id rejects the inverse Life placeholder even inside compound triggers",
    ({ id, text }) => {
      const schema = structuredClone(getEffectSchema(id)!);
      expect(findHandTrashTriggerViolations(text, schema)).toEqual([]);
      const block = schema.effects.find(
        (block) =>
          block.trigger &&
          "event" in block.trigger &&
          block.trigger.event === "CARD_TRASHED_FROM_HAND"
      )!;
      block.trigger = { any_of: [{ event: "CARD_ADDED_TO_HAND_FROM_LIFE" }] };
      expect(findHandTrashTriggerViolations(text, schema)).toHaveLength(1);
    }
  );
  it("accepts legitimate Life text and restricts trigger-count refs to hand-trash triggers", () => {
    const schema = structuredClone(getEffectSchema("OP12-040")!);
    expect(validateEffectSchema(schema, schema.card_id)).toEqual([]);
    schema.effects[0].trigger = { event: "CARD_ADDED_TO_HAND_FROM_LIFE" };
    expect(
      findHandTrashTriggerViolations(
        "When a card is added from your Life to your hand.",
        schema
      )
    ).toEqual([]);
    expect(validateEffectSchema(schema, schema.card_id)).toContainEqual(
      expect.stringContaining("__triggering_hand_trash")
    );
  });
});
