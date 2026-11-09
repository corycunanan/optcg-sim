/**
 * OPT-953 guard: every power and cost read goes through the value-layer
 * evaluator in `engine/modifiers.ts` (docs/game-engine/VALUE-LAYER-CONTRACT.md).
 *
 * A direct `<something>Data.power` / `<something>Data.cost` read skips the
 * base-set layer, the modifiers, DON!! and Counter power. The only direct
 * reads allowed are the ones below, each with the reason it must see the
 * printed value. A new direct read fails this test: route it through
 * `getEffectivePower`, `getEffectiveBasePower`, `getEffectiveCostForRead`,
 * `getEffectiveFieldCost`, or `getEffectiveCost` instead, or add it here with
 * the rule that makes the printed value correct.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { EffectSchema } from "../engine/effect-types.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import { findPermanentModifierTypeViolations } from "../engine/schema-permanent-modifier-lint.js";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const DIRECT_READ = /\b\w*[dD]ata\??\.(power|cost)\b/g;

/** File (relative to src/) → allowed direct reads and why. */
const ALLOWED: Record<string, { count: number; reason: string }> = {
  "engine/modifiers.ts": {
    count: 4,
    reason:
      "Layer 0 of power and cost; one-time 'next play' filters read the printed cost of the card being paid for (the evaluator is what is computing that cost).",
  },
  "engine/condition-queries.ts": {
    count: 8,
    reason:
      "Revealed-card compare and performed-play snapshots read off-field printed values (OPT-455); the shared filter card's printed fields are the fallback when no query services are passed, and every effective read goes through those services.",
  },
  "engine/dynamic-values.ts": {
    count: 2,
    reason:
      "REVEALED_CARD_COST reads a revealed (off-field) card, whose cost is printed; the Leader base-power read falls back to printed only without query services.",
  },
  "engine/setup.ts": { count: 1, reason: "Leader Life fallback at setup, not a cost read." },
  "engine/battle.ts": { count: 1, reason: "costReducedAmount compares the printed cost with the cost paid." },
  "engine/execute.ts": { count: 1, reason: "costReducedAmount compares the printed cost with the cost paid." },
  "engine/pipeline.ts": { count: 1, reason: "Records the printed base cost of a performed play (§4-9-2)." },
  "session/visibility.ts": { count: 1, reason: "Client projection shows the printed base beside the evaluated power." },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "__tests__" || name === "schemas") return [];
      return sourceFiles(path);
    }
    if (!name.endsWith(".ts") || name.endsWith(".test.ts") || name.includes(".generated.")) return [];
    return [path];
  });
}

describe("OPT-953 value-layer read guard", () => {
  it("no engine or session code reads card power or cost outside the evaluator", () => {
    const found: Record<string, number> = {};
    for (const file of [...sourceFiles(join(SRC, "engine")), ...sourceFiles(join(SRC, "session"))]) {
      const matches = readFileSync(file, "utf8").match(DIRECT_READ);
      if (matches) found[relative(SRC, file)] = matches.length;
    }
    const expected = Object.fromEntries(Object.entries(ALLOWED).map(([file, { count }]) => [file, count]));
    expect(found).toEqual(expected);
  });
});

describe("OPT-953 permanent modifier lint", () => {
  it("the authored registry has no permanent modifier the evaluator ignores", () => {
    expect(findPermanentModifierTypeViolations(getAllAuthoredSchemas())).toEqual([]);
  });

  it("flags the inert SET_BASE_POWER aura shape OP15-070/071 used, and a SET_POWER without params.value", () => {
    const schema: EffectSchema = {
      card_id: "LINT-953",
      card_type: "Character",
      effects: [{
        id: "aura",
        category: "permanent",
        modifiers: [
          { type: "SET_BASE_POWER", target: { type: "SELF" }, params: { amount: 6000 } },
          { type: "SET_POWER", target: { type: "SELF" }, params: { amount: 6000 } },
        ],
      }],
    };
    expect(findPermanentModifierTypeViolations({ "LINT-953": schema })).toEqual([
      expect.stringContaining("aura.modifiers[0] type SET_BASE_POWER is not read"),
      "LINT-953: aura.modifiers[1] SET_POWER needs params.value",
    ]);
  });
});
