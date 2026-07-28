import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CardTextManifest } from "../engine/trigger-schema-coverage.js";
import { findMissingTriggerSchemas } from "../engine/trigger-schema-coverage.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";

const manifestPath = resolve(
  import.meta.dirname,
  "../engine/card-text-manifest.generated.json"
);

describe("OPT-590 canonical Trigger schema coverage", () => {
  it("requires every canonical Trigger card to have a TRIGGER block", () => {
    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8")
    ) as CardTextManifest;

    expect(
      findMissingTriggerSchemas(manifest, getAllAuthoredSchemas())
    ).toEqual([]);
  });

  it("encodes the representative cost, life, play, and prohibition capabilities", () => {
    const schemas = getAllAuthoredSchemas();
    const trigger = (cardId: string) =>
      schemas[cardId].effects.find(
        (block) =>
          block.trigger &&
          "keyword" in block.trigger &&
          block.trigger.keyword === "TRIGGER"
      );

    expect(trigger("OP03-100")).toMatchObject({
      costs: [
        {
          type: "TRASH_FROM_LIFE",
          amount: 1,
          position: "TOP_OR_BOTTOM",
        },
      ],
      actions: [{ type: "PLAY_SELF" }],
      flags: { optional: true },
    });
    expect(trigger("OP09-105")).toMatchObject({
      conditions: {
        type: "LEADER_PROPERTY",
        property: { trait: "Egghead" },
      },
      actions: [
        {
          type: "ADD_TO_LIFE_FROM_DECK",
          params: { amount: 1, position: "TOP" },
        },
        { type: "TRASH_FROM_HAND", params: { amount: 2 }, chain: "THEN" },
      ],
    });
    expect(trigger("ST20-003")).toMatchObject({
      actions: [
        {
          type: "LIFE_SCRY",
          target: { controller: "EITHER", count: { up_to: 1 } },
        },
        { type: "RETURN_TO_HAND", target: { type: "SELF" }, chain: "THEN" },
      ],
    });
    expect(trigger("OP16-105")?.actions).toMatchObject([
      {
        type: "PLAY_CARD",
        target: { filter: { name: "Absalom", cost_max: 4 } },
      },
      {
        type: "PLAY_CARD",
        target: { filter: { name: "Dr. Hogback", cost_max: 4 } },
        chain: "THEN",
      },
      {
        type: "PLAY_CARD",
        target: { filter: { name: "Perona", cost_max: 4 } },
        chain: "THEN",
      },
    ]);
    expect(trigger("OP04-100")).toMatchObject({
      actions: [
        {
          type: "APPLY_PROHIBITION",
          target: {
            type: "LEADER_OR_CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
          },
          params: { prohibition_type: "CANNOT_ATTACK" },
          duration: { type: "THIS_TURN" },
        },
      ],
    });
  });
});
