/**
 * OPT-603 — canonical [DON!! xN] lint is independent of other condition types.
 */

import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const linter = resolve(__dirname, "../engine/schemas/lint-schemas.sh");
const execOptions: ExecFileSyncOptionsWithStringEncoding = {
  cwd: resolve(__dirname, "../../../.."),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
};

describe("OPT-603 — canonical attached-DON schema lint", () => {
  it("passes the complete 219-card canonical [DON!! xN] sweep", () => {
    expect(execFileSync("node", [linter], execOptions)).toContain(
      "Schema validation clean — 2467 card(s)."
    );
  });

  it("rejects a canonical [DON!! xN] card with no accepted encoding regardless of its other condition type", () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "opt603-lint-"));
    const fixturePath = join(fixtureDirectory, "eb01-mutant.ts");
    writeFileSync(
      fixturePath,
      `export const EB01_014_MUTANT = {
  card_id: "EB01-014",
  card_name: "Sanji",
  card_type: "Character",
  effects: [{
    id: "mutant",
    category: "permanent",
    conditions: {
      type: "ACTIVE_DON_COUNT",
      controller: "SELF",
      operator: ">=",
      value: 1
    },
    modifiers: [{
      type: "MODIFY_POWER",
      target: { type: "SELF" },
      params: { amount: 1000 }
    }]
  }]
};
`
    );

    try {
      let output = "";
      try {
        execFileSync("node", [linter, fixturePath], execOptions);
      } catch (error) {
        const commandError = error as {
          stdout?: string;
          stderr?: string;
        };
        output = `${commandError.stdout ?? ""}${commandError.stderr ?? ""}`;
      }
      expect(output).toContain("EB01-014: canonical [DON!! xN] requires");
    } finally {
      rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  });
});
