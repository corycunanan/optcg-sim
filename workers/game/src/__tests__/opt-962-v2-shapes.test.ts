/**
 * OPT-962 (OPT-924) drift guard between this writer and the deployed PR 4a
 * reader (OPT-980, `9da8ba17`). The reader's fixture
 * `fixtures/opt-962-v2-states.json` was produced from the PR 4b prototype by
 * `buildV2EndPhaseStates()`. Two checks:
 *
 * 1. The final engine still produces exactly those persisted objects (any new
 *    field, value or position fails here).
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
import { loadV2EndPhaseFixture } from "./fixtures/opt-962-v2-fixture.js";
import { fullEndPhaseReply, fullEndPhaseScenario } from "./opt-962-rig.js";

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

function signatures(state: { effectStack: Array<Pick<EffectStackFrame, "phaseBoundaryContinuation">> }): string[] {
  return state.effectStack.filter((f) => f.phaseBoundaryContinuation).map(signature);
}

describe("OPT-962 writer shapes match the deployed reader's fixtures", () => {
  const fixture = loadV2EndPhaseFixture();
  const built = buildV2EndPhaseStates();

  it("builds exactly the fixture's cases", () => {
    expect(built.map((s) => s.name).sort()).toEqual(Object.keys(fixture.cases).sort());
  });

  it.each(built.map((s) => s.name))("%s: the persisted object equals the fixture", (name) => {
    const state = built.find((s) => s.name === name)!.state;
    expect(persisted(state)).toEqual(fixture.cases[name].state);
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
});
