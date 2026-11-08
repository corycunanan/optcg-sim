/**
 * OPT-928: COPY_POWER prompts for its power source, so the SELECT_TARGET
 * bounds come from `params.source_target.count`, not from `action.target`
 * (the fixed SELF recipient). The optional-action validator reads the same
 * source target: `optional` on an up-to source would double-ask.
 */
import { describe, expect, it } from "vitest";
import { executeCopyPower } from "../engine/effect-resolver/actions/modifiers.js";
import { getAllAuthoredSchemas, validateEffectSchema } from "../engine/schema-registry.js";
import type { Action, ActionOf, EffectBlock, EffectResult, EffectSchema } from "../engine/effect-types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

const cardDb = createTestCardDb();

function copyFrom(count: { exact: number } | { up_to: number }): ActionOf<"COPY_POWER"> {
  return {
    type: "COPY_POWER",
    target: { type: "SELF" },
    params: { source_target: { type: "CHARACTER", controller: "OPPONENT", count } },
    duration: { type: "THIS_TURN" },
  };
}

function promptFor(action: ActionOf<"COPY_POWER">) {
  const state = createBattleReadyState(cardDb);
  const opponentCharacters = state.players[1].characters.filter(Boolean);
  expect(opponentCharacters.length).toBeGreaterThan(1);
  const source = state.players[0].characters.find(Boolean)!;
  const result = executeCopyPower(state, action, source.instanceId, 0, cardDb, new Map<string, EffectResult>());
  const options = result.pendingPrompt?.options;
  if (options?.promptType !== "SELECT_TARGET") throw new Error("expected a source prompt");
  return { options, resume: result.pendingPrompt!.resumeContext, opponentCharacters };
}

describe("OPT-928 COPY_POWER source prompt bounds", () => {
  it("exact 1: the player must pick one source (min 1, max 1)", () => {
    const { options, opponentCharacters } = promptFor(copyFrom({ exact: 1 }));
    expect(options.countMin).toBe(1);
    expect(options.countMax).toBe(1);
    expect(options.validTargets).toEqual(opponentCharacters.map((c) => c!.instanceId));
  });

  it("up to 1: the player may pick none (min 0, max 1)", () => {
    const { options } = promptFor(copyFrom({ up_to: 1 }));
    expect(options.countMin).toBe(0);
    expect(options.countMax).toBe(1);
  });

  it("the paused action is still the COPY_POWER with its SELF recipient", () => {
    const action = copyFrom({ exact: 1 });
    const { resume } = promptFor(action);
    if (typeof resume !== "object" || !resume || !("pausedAction" in resume)) throw new Error("expected an inline resume context");
    expect(resume.pausedAction).toEqual(action);
  });
});

describe("OPT-928 optional COPY_POWER validation", () => {
  const schemaWith = (action: Action): EffectSchema => ({
    card_id: "OPT928-X",
    effects: [{ id: "b", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [action] } as EffectBlock],
  } as EffectSchema);

  it("rejects optional on an up-to source (the source prompt is the decline)", () => {
    const errors = validateEffectSchema(schemaWith({ ...copyFrom({ up_to: 1 }), optional: true } as Action));
    expect(errors.some((e) => e.includes("params.source_target.count already allows choosing 0"))).toBe(true);
  });

  it("accepts optional on an exact source", () => {
    const errors = validateEffectSchema(schemaWith({ ...copyFrom({ exact: 1 }), optional: true } as Action));
    expect(errors.filter((e) => e.includes(".optional:"))).toEqual([]);
  });

  it("accepts optional on a fixed source shorthand", () => {
    const errors = validateEffectSchema(schemaWith({
      type: "COPY_POWER",
      target: { type: "SELF" },
      params: { source: "OPPONENT_LEADER" },
      optional: true,
    } as Action));
    expect(errors.filter((e) => e.includes(".optional:"))).toEqual([]);
  });

  it("inventory: no authored COPY_POWER carries action-level optional", () => {
    const copies: Action[] = [];
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record.type === "COPY_POWER") copies.push(record as unknown as Action);
      Object.values(record).forEach(visit);
    };
    visit(Object.values(getAllAuthoredSchemas()));
    expect(copies.length).toBeGreaterThan(0);
    expect(copies.filter((action) => action.optional)).toEqual([]);
  });
});
