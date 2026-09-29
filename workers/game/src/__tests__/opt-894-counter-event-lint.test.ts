/**
 * OPT-894 — schema lint: a COUNTER_EVENT trigger must sit on a block category
 * that `executeUseCounterEvent` (battle.ts) executes (`auto`). 40 Counter
 * Events shipped as `activate`: cost paid, card trashed, [Counter] never ran.
 * 39 are now `auto`; P-059 is deliberately kept `activate` until OPT-912
 * (KNOWN_DEFERRED_COUNTER_EVENT, two-way ratcheted below).
 */

import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import {
  COUNTER_EVENT_EXECUTED_CATEGORIES,
  KNOWN_COMPOUND_COUNTER_EVENT_GAP,
  KNOWN_DEFERRED_COUNTER_EVENT,
  findCounterEventCategoryIntentViolations,
  findCounterEventCategoryViolations,
} from "../engine/schema-counter-event-lint.js";

const linter = resolve(__dirname, "../engine/schemas/lint-schemas.sh");
const execOptions: ExecFileSyncOptionsWithStringEncoding = {
  cwd: resolve(__dirname, "../../../.."),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
};

function schemaWith(effects: unknown[]): EffectSchema {
  return { card_id: "TEST-894", card_name: "Counter fixture", card_type: "Event", effects } as EffectSchema;
}
const draw = [{ type: "DRAW", params: { amount: 1 } }];

describe("OPT-894 — COUNTER_EVENT blocks must use an executed category", () => {
  it("rejects category activate on a COUNTER_EVENT trigger", () => {
    expect(
      findCounterEventCategoryViolations(
        schemaWith([{ id: "c", category: "activate", trigger: { keyword: "COUNTER_EVENT" }, actions: draw }]),
      ),
    ).toEqual([
      'TEST-894 effects[0] category "activate": COUNTER_EVENT blocks are only executed when category is "auto" (battle.ts executeUseCounterEvent); the [Counter] effect would never resolve',
    ]);
  });

  it("rejects permanent / other categories and any_of compounds containing COUNTER_EVENT", () => {
    const violations = findCounterEventCategoryViolations(
      schemaWith([
        { id: "a", category: "permanent", trigger: { keyword: "COUNTER_EVENT" }, actions: draw },
        { id: "b", category: "activate", trigger: { any_of: [{ keyword: "ON_PLAY" }, { keyword: "COUNTER_EVENT" }] }, actions: draw },
      ]),
    );
    expect(violations).toHaveLength(2);
  });

  it("rejects a NEW compound [Main]/[Counter] trigger outside the known-gap list", () => {
    const violations = findCounterEventCategoryViolations(
      schemaWith([
        { id: "a", category: "auto", trigger: { any_of: [{ keyword: "MAIN_EVENT" }, { keyword: "COUNTER_EVENT" }] }, actions: draw },
      ]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("trigger any_of contains COUNTER_EVENT");
  });

  it("the known compound gap list is exactly the registry's compound [Main]/[Counter] cards (ratchet)", () => {
    const compound = Object.entries(getAllAuthoredSchemas())
      .filter(([, schema]) =>
        schema.effects.some(
          (b) =>
            b.trigger &&
            "any_of" in b.trigger &&
            b.trigger.any_of.some((t) => "keyword" in t && t.keyword === "COUNTER_EVENT"),
        ),
      )
      .map(([id]) => id)
      .sort();
    expect(compound).toEqual([...KNOWN_COMPOUND_COUNTER_EVENT_GAP].sort());
  });

  it("deferred list (OPT-912): tolerates activate, rejects auto (forces removal from the list)", () => {
    const deferred = (category: string) =>
      findCounterEventCategoryViolations({
        ...schemaWith([{ id: "c", category, trigger: { keyword: "COUNTER_EVENT" }, actions: draw }]),
        card_id: "P-059",
      });
    expect(deferred("activate")).toEqual([]);
    expect(deferred("auto")).toEqual([
      'P-059 effects[0] category "auto": card is listed in KNOWN_DEFERRED_COUNTER_EVENT (OPT-912) but its COUNTER_EVENT block now executes; remove it from the list',
    ]);
  });

  it("the deferred list is exactly the registry's non-auto direct COUNTER_EVENT cards (two-way ratchet)", () => {
    expect([...KNOWN_DEFERRED_COUNTER_EVENT]).toEqual(["P-059"]);
    const nonAuto = Object.entries(getAllAuthoredSchemas())
      .filter(([, schema]) =>
        schema.effects.some(
          (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "COUNTER_EVENT" && b.category !== "auto",
        ),
      )
      .map(([id]) => id)
      .sort();
    expect(nonAuto).toEqual([...KNOWN_DEFERRED_COUNTER_EVENT].sort());
  });

  it("accepts auto COUNTER_EVENT, and activate blocks on other keywords", () => {
    expect(
      findCounterEventCategoryViolations(
        schemaWith([
          { id: "a", category: "auto", trigger: { keyword: "COUNTER_EVENT" }, actions: draw },
          { id: "b", category: "activate", trigger: { keyword: "MAIN_EVENT" }, actions: draw },
          { id: "c", category: "auto", trigger: { keyword: "TRIGGER" }, actions: draw },
        ]),
      ),
    ).toEqual([]);
  });

  it("registry-wide: no COUNTER_EVENT block anywhere has an unexecuted category", () => {
    const schemas = getAllAuthoredSchemas();
    expect(findCounterEventCategoryIntentViolations(schemas)).toEqual([]);

    // Independent of the lint module: replicate the consumer's selector.
    let counterEvents = 0;
    for (const [id, schema] of Object.entries(schemas)) {
      if (KNOWN_COMPOUND_COUNTER_EVENT_GAP.includes(id)) continue; // compound trigger; see the gap ratchet
      if (KNOWN_DEFERRED_COUNTER_EVENT.includes(id)) continue; // OPT-912; see the deferred ratchet
      const blocks = schema.effects.filter(
        (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "COUNTER_EVENT",
      );
      if (blocks.length === 0) continue;
      counterEvents += 1;
      const consumed = schema.effects.find(
        (b) =>
          b.category === "auto" && b.trigger && "keyword" in b.trigger && b.trigger.keyword === "COUNTER_EVENT",
      );
      expect(consumed, `${id} has a COUNTER_EVENT block the consumer would not select`).toBeDefined();
      expect(blocks.map((b) => b.category), id).toEqual(
        blocks.map(() => COUNTER_EVENT_EXECUTED_CATEGORIES[0]),
      );
    }
    expect(counterEvents).toBeGreaterThan(175);
  });

  it("fails lint-schemas.sh on a fixture authored as activate", () => {
    const dir = mkdtempSync(join(tmpdir(), "opt894-lint-"));
    const fixture = join(dir, "activate-counter.ts");
    writeFileSync(
      fixture,
      `export const OPT_894_FIXTURE = {
  card_id: "TEST-894",
  card_name: "Activate counter",
  card_type: "Event",
  effects: [{
    id: "counter_power",
    category: "activate",
    trigger: { keyword: "COUNTER_EVENT" },
    actions: [{ type: "MODIFY_POWER", target: { type: "YOUR_LEADER" }, params: { amount: 3000 }, duration: { type: "THIS_BATTLE" } }]
  }]
};
`,
    );
    try {
      let output = "";
      let failed = false;
      try {
        execFileSync("node", [linter, fixture], execOptions);
      } catch (error) {
        failed = true;
        const e = error as { stdout?: string; stderr?: string };
        output = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
      expect(failed).toBe(true);
      expect(output).toContain('TEST-894 effects[0] category "activate": COUNTER_EVENT blocks are only executed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired into pnpm schema:check through lint-schemas.sh", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["schema:check"]).toContain("node src/engine/schemas/lint-schemas.sh");
    const cli = readFileSync(resolve(__dirname, "../engine/schemas/schema-lint-cli.ts"), "utf8");
    expect(cli).toContain("...findCounterEventCategoryIntentViolations(schemas),");
  });
});
