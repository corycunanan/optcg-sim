import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { EFFECT_FACET_GROUPS } from "@shared/effect-facets";
import { getAllAuthoredSchemas } from "../workers/game/src/engine/schema-registry";
import type { EffectSchema } from "../workers/game/src/engine/effect-types";
import { extractCardFacets } from "./effect-facets";

const authoredSchemas = getAllAuthoredSchemas();
const registeredTags = new Set(
  EFFECT_FACET_GROUPS.flatMap((group) => group.tags.map((tag) => tag.id))
);

function schemaFor(cardId: string): EffectSchema {
  const schema = authoredSchemas[cardId];
  expect(
    schema,
    `${cardId} must remain in the authored registry`
  ).toBeDefined();
  return schema;
}

function expectTags(cardId: string, expectedTags: readonly string[]): void {
  const { tags } = extractCardFacets(schemaFor(cardId));
  for (const tag of expectedTags) expect(tags).toContain(tag);
}

describe("extractCardFacets", () => {
  it("is deterministic and does not mutate its authored schema input", () => {
    const schema = schemaFor("OP01-094");
    const before = structuredClone(schema);

    const first = extractCardFacets(schema);
    const second = extractCardFacets(schema);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.tags).not.toBe(second.tags);
    expect(first.effectTraits).not.toBe(second.effectTraits);
    expect(schema).toEqual(before);
  });

  it("covers every Tier 1 group and required qualifier with authored cards", () => {
    expectTags("ST01-012", [
      "trigger:when_attacking",
      "timing:don_requirement",
      "category:auto",
      "category:permanent",
      "keyword:rush",
      "state:prohibit",
      "cost:none",
    ]);
    expectTags("OP02-074", ["keyword:blocker:granted", "category:permanent"]);
    expectTags("OP01-094", [
      "removal:ko:wipe",
      "cost:don_minus",
      "condition:leader_property",
      "flag:optional",
    ]);
    const untapTags = extractCardFacets(schemaFor("OP12-030")).tags;
    expect(untapTags).toContain("don:untap:self");
    expect(untapTags.some((tag) => tag.startsWith("don:ramp"))).toBe(false);
    expectTags("OP15-008", ["don:give:opponent"]);
    expectTags("OP14-115", ["life:damage:self"]);
    expectTags("EB03-055", ["life:damage:opponent"]);
    expectTags("OP03-028", ["state:rest:self"]);
    expectTags("EB01-015", ["state:rest:opponent"]);
    expectTags("EB01-001", ["stat:power_up:self"]);
    expectTags("EB02-005", ["stat:power_down:self"]);
    expectTags("EB01-002", ["stat:power_down:opponent"]);
    expectTags("EB04-061", ["stat:cost_down:self"]);
    expectTags("EB01-042", ["stat:cost_down:opponent"]);
    expectTags("EB01-013", ["hand:play_from_hand"]);
    expectTags("EB01-043", ["hand:play_from_trash"]);
    expectTags("EB01-009", ["hand:play_from_deck"]);
    expectTags("OP10-022", ["hand:play_from_life"]);
    expectTags("EB04-041", ["hand:play_from_hand", "hand:play_from_trash"]);
    expectTags("EB01-060", ["hand:play_from_hand", "hand:play_from_trash"]);
    expectTags("OP05-033", ["hand:play_from_hand"]);
    expectTags("EB01-001", ["category:rule_modification"]);
    expectTags("EB01-008", ["category:replacement"]);
  });

  it("walks choice action options and choice cost branches", () => {
    expectTags("OP09-084", [
      "keyword:double_attack:granted",
      "keyword:banish:granted",
      "keyword:blocker:granted",
    ]);
    expectTags("OP13-079", [
      "cost:trash_own_character",
      "cost:trash_from_hand",
    ]);
    expect(
      extractCardFacets(schemaFor("OP13-079")).effectTraits
    ).toContainEqual({
      trait: "Celestial Dragons",
      role: "cost",
      blockId: "OP13-079_activate_main",
    });
  });

  it("classifies power-to-zero as a stat change rather than removal", () => {
    const { tags } = extractCardFacets(schemaFor("EB04-010"));

    expect(tags).toContain("stat:power_to_zero");
    expect(tags.some((tag) => tag.startsWith("removal:"))).toBe(false);
  });

  it("records target, search, cost, and exclusion trait roles", () => {
    expect(
      extractCardFacets(schemaFor("EB01-001")).effectTraits
    ).toContainEqual({
      trait: "Land of Wano",
      role: "target",
      blockId: "counter_grant_rule",
    });
    expect(
      extractCardFacets(schemaFor("EB01-009")).effectTraits
    ).toContainEqual({
      trait: "Animal",
      role: "search",
      blockId: "counter_search_and_play",
    });
    expect(
      extractCardFacets(schemaFor("EB01-021")).effectTraits
    ).toContainEqual({
      trait: "Impel Down",
      role: "cost",
      blockId: "end_of_turn_add_don",
    });
    expect(
      extractCardFacets(schemaFor("OP13-064")).effectTraits
    ).toContainEqual({
      trait: "Roger Pirates",
      role: "exclude",
      blockId: "OP13-064_negate_effects",
    });
  });

  it("registers and documents every vocabulary tag", () => {
    const taxonomy = readFileSync(
      resolve(process.cwd(), "docs/cards/EFFECT-FACET-TAXONOMY.md"),
      "utf8"
    );
    const allTags = EFFECT_FACET_GROUPS.flatMap((group) =>
      group.tags.map((tag) => tag.id)
    );

    expect(new Set(allTags).size).toBe(allTags.length);
    for (const tag of allTags) expect(taxonomy).toContain(`\`${tag}\``);
  });

  it("snapshots every distinct authored tag and rejects unregistered output", () => {
    const tags = [
      ...new Set(
        Object.values(authoredSchemas).flatMap(
          (schema) => extractCardFacets(schema).tags
        )
      ),
    ].sort();
    const unregistered = tags.filter((tag) => !registeredTags.has(tag));

    expect(unregistered).toEqual([]);
    expect(tags).toMatchSnapshot();
  });

  it("snapshots every distinct authored effect trait with its role", () => {
    const traits = [
      ...new Set(
        Object.values(authoredSchemas).flatMap((schema) =>
          extractCardFacets(schema).effectTraits.map(
            ({ trait, role }) => `${role}:${trait}`
          )
        )
      ),
    ].sort();

    expect(traits).toMatchSnapshot();
  });
});
