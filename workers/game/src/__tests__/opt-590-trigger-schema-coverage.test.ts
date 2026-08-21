import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import type { CardTextManifest } from "../engine/trigger-schema-coverage.js";
import {
  findDerivedTriggersWithoutSchemaBlocks,
  findMissingTriggerSchemas,
  findSchemasWithMultipleTriggerBlocks,
} from "../engine/trigger-schema-coverage.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import { hasLeadingTriggerTag } from "../../scripts/generate-card-text-manifest.js";

const manifestPath = resolve(
  import.meta.dirname,
  "../engine/card-text-manifest.generated.json"
);
const manifest = JSON.parse(
  readFileSync(manifestPath, "utf8")
) as CardTextManifest;

describe("OPT-590 canonical Trigger schema coverage", () => {
  it("classifies raw canonical effect text using sanitized line boundaries", () => {
    expect(hasLeadingTriggerTag("[Trigger] Play this card.")).toBe(true);
    for (const separator of ["<br>", "<br/>", "<br />", "<BR   />"]) {
      expect(
        hasLeadingTriggerTag(
          `[On Play] Draw 1 card.${separator}[Trigger] Play this card.`
        )
      ).toBe(true);
    }
    expect(
      hasLeadingTriggerTag(
        "You may trash 1 card with a [Trigger] from your hand: draw 1 card."
      )
    ).toBe(false);
    expect(
      hasLeadingTriggerTag(
        "[On Play] Draw 1 card.<br />You may trash 1 card with a [Trigger] from your hand."
      )
    ).toBe(false);
  });

  it("requires every canonical Trigger card to have a TRIGGER block", () => {
    expect(
      findMissingTriggerSchemas(manifest, getAllAuthoredSchemas())
    ).toEqual([]);
  });

  it("forbids derived Trigger keywords without a TRIGGER block", () => {
    expect(
      findDerivedTriggersWithoutSchemaBlocks(
        manifest,
        getAllAuthoredSchemas()
      )
    ).toEqual([]);
  });

  it("reports a derived Trigger keyword without a TRIGGER block", () => {
    const syntheticManifest: CardTextManifest = {
      "TEST-FALSE-TRIGGER": {
        category: "Character",
        hasRealEffectText: true,
        hasTriggerText: false,
      },
    };
    const nestedTriggerSchema: EffectSchema = {
      card_id: "TEST-FALSE-TRIGGER",
      effects: [
        {
          id: "nested_trigger",
          category: "auto",
          trigger: {
            any_of: [
              { keyword: "WHEN_ATTACKING" },
              { keyword: "TRIGGER" },
            ],
          },
          actions: [],
        },
      ],
    };

    expect(
      findDerivedTriggersWithoutSchemaBlocks(syntheticManifest, {
        "TEST-FALSE-TRIGGER": nestedTriggerSchema,
      })
    ).toEqual(["TEST-FALSE-TRIGGER"]);
  });

  it("reports a canonical Trigger card whose schema is missing", () => {
    const incompleteManifest: CardTextManifest = {
      "TEST-TRIGGER": {
        category: "Character",
        hasRealEffectText: false,
        hasTriggerText: true,
      },
      "TEST-VANILLA": {
        category: "Character",
        hasRealEffectText: false,
        hasTriggerText: false,
      },
    };

    expect(findMissingTriggerSchemas(incompleteManifest, {})).toEqual([
      "TEST-TRIGGER",
    ]);
  });

  it("includes anchored effect-field Trigger text without false-flagging references", () => {
    const triggerCardIds = Object.entries(manifest)
      .filter(([, facts]) => facts.hasTriggerText)
      .map(([cardId]) => cardId);
    const referencedTriggerCardIds = [
      "OP03-105",
      "OP03-115",
      "OP04-105",
      "OP05-109",
      "OP11-102",
      "OP13-110",
      "ST29-014",
      "OP03-022",
      "OP05-002",
      "OP09-062",
      "OP13-100",
      "OP16-080",
    ];

    expect(triggerCardIds).toHaveLength(496);
    expect(manifest["OP01-009"].hasTriggerText).toBe(true);
    expect(
      referencedTriggerCardIds.filter(
        (cardId) => manifest[cardId].hasTriggerText
      )
    ).toEqual([]);
  });

  it("rejects multiple direct TRIGGER blocks through schema lint", () => {
    const duplicateTriggerSchema: EffectSchema = {
      card_id: "TEST-DUPLICATE-TRIGGER",
      effects: [
        {
          id: "first_trigger",
          category: "auto",
          trigger: { keyword: "TRIGGER" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
        {
          id: "second_trigger",
          category: "auto",
          trigger: { keyword: "TRIGGER" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ],
    };
    expect(
      findSchemasWithMultipleTriggerBlocks({
        "TEST-DUPLICATE-TRIGGER": duplicateTriggerSchema,
      })
    ).toEqual(["TEST-DUPLICATE-TRIGGER"]);

    const fixtureDirectory = mkdtempSync(join(tmpdir(), "opt590-lint-"));
    try {
      const fixturePath = join(fixtureDirectory, "duplicate-trigger.ts");
      writeFileSync(
        fixturePath,
        `export const DUPLICATE_TRIGGER = ${JSON.stringify(duplicateTriggerSchema)};\n`
      );
      const linter = resolve(
        import.meta.dirname,
        "../engine/schemas/lint-schemas.sh"
      );
      let output = "";
      try {
        output = execFileSync("node", [linter, fixturePath], {
          encoding: "utf8",
        });
      } catch (error) {
        output = (error as { stdout?: string }).stdout ?? "";
      }
      expect(output).toContain(
        "TEST-DUPLICATE-TRIGGER: multiple TRIGGER blocks are unsupported"
      );
    } finally {
      rmSync(fixtureDirectory, { recursive: true, force: true });
    }
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
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [
                {
                  type: "ADD_TO_LIFE_FROM_DECK",
                  params: { amount: 1, position: "TOP" },
                },
              ],
              [],
            ],
          },
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
