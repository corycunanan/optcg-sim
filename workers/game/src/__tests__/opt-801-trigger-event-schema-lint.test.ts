/**
 * OPT-801 — schema lint: every authored `trigger.event` must resolve through
 * `customEventMatchesGameEvent` (the event map or a bespoke branch).
 * OP11-041 shipped on the unmapped `LIFE_CARD_REMOVED` and never fired.
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
  findTriggerEventIntentViolations,
  findUnmatchableTriggerEventViolations,
} from "../engine/schema-trigger-event-lint.js";

const linter = resolve(__dirname, "../engine/schemas/lint-schemas.sh");
const execOptions: ExecFileSyncOptionsWithStringEncoding = {
  cwd: resolve(__dirname, "../../../.."),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
};

function schemaWith(effects: unknown[]): EffectSchema {
  return {
    card_id: "TEST-801",
    card_name: "Trigger event fixture",
    card_type: "Character",
    effects,
  } as EffectSchema;
}

const draw = [{ type: "DRAW", params: { amount: 1 } }];

describe("OPT-801 — authored trigger events must be matchable", () => {
  it("rejects an unmapped event on a block trigger", () => {
    expect(findUnmatchableTriggerEventViolations(schemaWith([
      { id: "a", category: "auto", trigger: { event: "LIFE_CARD_REMOVED" }, actions: draw },
    ]))).toEqual([
      'TEST-801 effects[0].trigger.event "LIFE_CARD_REMOVED": trigger event has no matcher in triggers.ts customEventMatchesGameEvent and never fires; use a mapped event or add the mapping',
    ]);
  });

  it("rejects an unmapped event inside an any_of compound trigger", () => {
    const violations = findUnmatchableTriggerEventViolations(schemaWith([
      {
        id: "a",
        category: "auto",
        trigger: { any_of: [{ keyword: "ON_PLAY" }, { event: "CARD_REMOVED_FROM_LIFE" }, { event: "NOT_AN_EVENT" }] },
        actions: draw,
      },
    ]));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('effects[0].trigger.any_of[2].event "NOT_AN_EVENT"');
  });

  it("rejects an unmapped event on a trigger nested in a granted effect block", () => {
    const violations = findUnmatchableTriggerEventViolations(schemaWith([
      {
        id: "grant",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{
          type: "GRANT_EFFECT",
          params: { effect: { id: "granted", category: "auto", trigger: { event: "NOT_AN_EVENT" }, actions: draw } },
        }],
      },
    ]));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('effects[0].actions[0].params.effect.trigger.event "NOT_AN_EVENT"');
  });

  it("rejects a non-string event", () => {
    expect(findUnmatchableTriggerEventViolations(schemaWith([
      { id: "a", category: "auto", trigger: { event: 42 }, actions: draw },
    ]))).toHaveLength(1);
  });

  it("accepts mapped events, the bespoke removed-from-field event, keyword triggers and replacement events", () => {
    expect(findUnmatchableTriggerEventViolations(schemaWith([
      { id: "a", category: "auto", trigger: { event: "CARD_REMOVED_FROM_LIFE", filter: { controller: "ANY" } }, actions: draw },
      { id: "b", category: "auto", trigger: { event: "CHARACTER_REMOVED_FROM_FIELD" }, actions: draw },
      { id: "c", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: draw },
      { id: "d", category: "auto", trigger: { any_of: [{ keyword: "ON_KO" }, { event: "ANY_CHARACTER_KO" }] }, actions: draw },
      { id: "e", category: "replacement", replaces: { event: "WOULD_BE_KO" }, replacement_actions: draw },
    ]))).toEqual([]);
  });

  it("accepts every authored schema in the generated registry", () => {
    expect(findTriggerEventIntentViolations(getAllAuthoredSchemas())).toEqual([]);
  });

  it("fails lint-schemas.sh on a fixture with an unmapped event", () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "opt801-lint-"));
    const fixturePath = join(fixtureDirectory, "unmapped-event.ts");
    writeFileSync(fixturePath, `export const OPT_801_FIXTURE = {
  card_id: "TEST-801",
  card_name: "Unmapped event",
  card_type: "Character",
  effects: [{
    id: "unmapped",
    category: "auto",
    trigger: { event: "LIFE_CARD_REMOVED" },
    actions: [{ type: "DRAW", params: { amount: 1 } }]
  }]
};
`);
    try {
      let output = "";
      let failed = false;
      try {
        execFileSync("node", [linter, fixturePath], execOptions);
      } catch (error) {
        failed = true;
        const commandError = error as { stdout?: string; stderr?: string };
        output = `${commandError.stdout ?? ""}${commandError.stderr ?? ""}`;
      }
      expect(failed).toBe(true);
      expect(output).toContain('TEST-801 effects[0].trigger.event "LIFE_CARD_REMOVED": trigger event has no matcher');
    } finally {
      rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it("is wired into pnpm schema:check through lint-schemas.sh", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["schema:check"]).toContain("node src/engine/schemas/lint-schemas.sh");
    const cli = readFileSync(resolve(__dirname, "../engine/schemas/schema-lint-cli.ts"), "utf8");
    expect(cli).toContain("...findTriggerEventIntentViolations(schemas),");
  });
});
