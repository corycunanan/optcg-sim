import { candidateExpected } from "./fixtures/opt-968-candidate-expectations.js";
/**
 * OPT-962 (OPT-924) drift guard between this writer and the deployed PR 4a
 * reader (OPT-980, `9da8ba17`). The reader's fixture
 * `fixtures/opt-962-v2-states.json` was produced from the PR 4b prototype by
 * `buildV2EndPhaseStates()`. Two checks:
 *
 * 1. OPT-966 uses a separate exact current-writer fixture; historical v2
 *    inputs remain frozen and must still load. New trigger owner shapes are
 *    additionally covered by actual session replay on the deployed reader.
 * 2. Every End Phase frame the engine parks while running the full scenario
 *    (every stage, nested and reloaded) has a shape signature the fixture
 *    covers: the stage, the continuation's keys, each entry's keys and step.
 *    A shape the fixtures don't cover fails here, before any reader sees it.
 */

import { describe, expect, it } from "vitest";
import type { EffectStackFrame, GameState } from "../types.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { buildV2EndPhaseStates } from "./fixtures/opt-962-v2-states.js";
import currentWriter from "./fixtures/opt-966-end-phase-states.synthetic.json";
import { loadV2EndPhaseFixture } from "./fixtures/opt-962-v2-fixture.js";
import { endPhaseRig, fullEndPhaseReply, fullEndPhaseScenario } from "./opt-962-rig.js";

function persisted(state: GameState): Record<string, unknown> {
  return JSON.parse(JSON.stringify(toPersistedGameState(state))) as Record<string, unknown>;
}

function signature(frame: Pick<EffectStackFrame, "phaseBoundaryContinuation">): string {
  const c = frame.phaseBoundaryContinuation!;
  return JSON.stringify({
    stage: c.stage,
    keys: Object.keys(c).sort(),
    entries: [...new Set(c.remainingScheduledActions.map((e) => `${Object.keys(e).sort().join(",")}|${e.step ?? "-"}`))].sort(),
  });
}

function signatures(state: { effectStack: Array<Pick<EffectStackFrame, "phaseBoundaryContinuation">>;
}): string[] {
  return state.effectStack.filter((f) => f.phaseBoundaryContinuation).map(signature);
}

describe("OPT-962 writer shapes match the deployed reader's fixtures", () => {
  const fixture = loadV2EndPhaseFixture();
  const built = buildV2EndPhaseStates();

  it("builds exactly the fixture's cases", () => {
    expect(built.map((s) => s.name).sort()).toEqual(Object.keys(fixture.cases).sort());
  });

  it.each(built.map((s) => s.name))("%s: current writer matches its separate exact fixture and historical input still loads", (name) => {
    const state = built.find((s) => s.name === name)!.state;
      expect(currentWriter.cases).toHaveProperty(name);
    expect(persisted(state)).toEqual(candidateExpected(`endphase/${name}`));
    // The v2 reader input is frozen, not rewritten to hide current scheduling.
    const historical = structuredClone(fixture.cases[name].state);
    expect(() => convertPersistedGameState(historical, "historical v2 state")).not.toThrow();
  });

  it("every End Phase frame parked across the full scenario, live and reloaded, has a fixture-covered shape", () => {
    const covered = new Set(
      Object.values(fixture.cases).flatMap((c) => signatures(c.state as never))
    );
    const r = fullEndPhaseScenario();
    const seen: string[] = [];
    r.act({ type: "ADVANCE_PHASE" });
    for (let n = 0; r.state.pendingPrompt; n += 1) {
      const raw = persisted(r.state);
      seen.push(...signatures(raw as never));
      // The deployed reader's hook accepts it (same code as 9da8ba17).
      expect(() => convertPersistedGameState(raw, "state")).not.toThrow();
      const { action, player } = fullEndPhaseReply(r, n);
      r.act(action, player);
    }
    expect(seen.length).toBeGreaterThanOrEqual(5);
    for (const sig of seen) expect(covered, sig).toContain(sig);
  });

  // OPT-924 review finding B: the one new prohibition key. `prohibitions` is
  // `z.array(z.unknown())` in the 9da8ba17 reader; the PR body loads a state
  // carrying it on that build (rung 4, live and undo). Any other new key fails here.
  it("prohibition rows carry only known keys; ownerController (NEGATE_TRIGGER_TYPE) survives the reader hook", () => {
    const KNOWN = new Set([
      "id", "sourceCardInstanceId", "sourceEffectBlockId", "prohibitionType", "scope", "duration", "expiresAt",
      "controller", "ownerController", "appliesTo", "attackerInstanceIds", "target", "conditions", "usesRemaining", "conditionalOverride",
    ]);
    const r = endPhaseRig({ handSize: 3, deckSize: 8 });
    const teach = r.put("OP09-081", 0, "LEADER");
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: teach.instanceId, effectId: "activate_negate_opponent_on_play" });
    for (let i = 0; i < 4 && r.state.pendingPrompt; i += 1) {
      const p = r.state.pendingPrompt;
      if (p.options.promptType === "OPTIONAL_EFFECT") r.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      else r.act({ type: "SELECT_TARGET", selectedInstanceIds: (p.options as { validTargets: string[] }).validTargets.slice(0, 1) });
    }
    const raw = persisted(r.state) as { prohibitions: Array<Record<string, unknown>>;
    };
    expect(raw.prohibitions.length).toBeGreaterThan(0);
    for (const row of raw.prohibitions) for (const key of Object.keys(row)) expect(KNOWN, key).toContain(key);
    const loaded = convertPersistedGameState(raw, "state");
    expect(loaded.prohibitions.find((p) => p.scope?.triggerType === "ON_PLAY")?.ownerController).toBe(0);
  });
});
