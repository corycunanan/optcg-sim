/**
 * OPT-769 — reject multiple START_OF_GAME_EFFECT rules per card.
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

function twoRuleFixtureSource(): string {
  return `const FIRST_START_RULE = {
  rule_type: "START_OF_GAME_EFFECT",
  actions: [{ type: "DRAW", params: { amount: 1 } }]
};

const SECOND_START_RULE = {
  rule_type: "START_OF_GAME_EFFECT",
  actions: [{ type: "DRAW", params: { amount: 1 } }]
};

const START_RULES = [FIRST_START_RULE, SECOND_START_RULE];

export const OPT_769_TWO_RULE_FIXTURE = {
  card_id: "TEST-769-TWO",
  card_name: "Two start-of-game rules",
  card_type: "Leader",
  effects: [],
  rule_modifications: [...START_RULES]
};
`;
}

function oneRuleFixtureSource(): string {
  return `const START_RULE = {
  rule_type: "START_OF_GAME_EFFECT",
  prompt_text: "At the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.",
  actions: [{
    type: "SEARCH_AND_PLAY",
    params: {
      search_full_deck: true,
      filter: { traits: ["Mary Geoise"], card_type: "STAGE" },
      shuffle_after: true
    }
  }]
};

export const OPT_769_ONE_RULE_FIXTURE = {
  card_id: "TEST-769-ONE",
  card_name: "One start-of-game rule",
  card_type: "Leader",
  effects: [],
  rule_modifications: [{
    rule_type: "DECK_RESTRICTION",
    restriction: "CANNOT_INCLUDE",
    filter: { card_type: "EVENT", cost_min: 2 }
  }, START_RULE]
};
`;
}

describe("OPT-769 — START_OF_GAME_EFFECT schema lint", () => {
  it("rejects two START_OF_GAME_EFFECT rules on one card", () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "opt769-lint-"));
    const fixturePath = join(fixtureDirectory, "two-start-rules.ts");
    writeFileSync(fixturePath, twoRuleFixtureSource());

    try {
      let output = "";
      try {
        execFileSync("node", [linter, fixturePath], execOptions);
      } catch (error) {
        const commandError = error as { stdout?: string; stderr?: string };
        output = `${commandError.stdout ?? ""}${commandError.stderr ?? ""}`;
      }

      expect(output).toContain(
        "two-start-rules.ts TEST-769-TWO: 2 START_OF_GAME_EFFECT rules are unsupported; see workers/game/src/engine/pregame.ts limitation comment",
      );
    } finally {
      rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it("accepts one START_OF_GAME_EFFECT rule", () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "opt769-lint-"));
    const fixturePath = join(fixtureDirectory, "one-start-rule.ts");
    writeFileSync(fixturePath, oneRuleFixtureSource());

    try {
      expect(execFileSync("node", [linter, fixturePath], execOptions)).toContain(
        "Schema validation clean — 1 card(s).",
      );
    } finally {
      rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it("accepts the complete authored schema corpus", () => {
    expect(execFileSync("node", [linter], execOptions)).toContain(
      "Schema validation clean — 2472 card(s).",
    );
  });
});
