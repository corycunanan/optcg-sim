import { describe, expect, it } from "vitest";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";
import { toPersistedGameState } from "../session/game-state-schema.js";

/** Baseline is an immutable archive of dc08a5ac, not a projection built by this reader. */
describe.skipIf(!process.env.OPT968_BASELINE_ROOT)("OPT-968 ordinary reader producer bytes vs dc08a5ac", () => {
  for (const choice of ["accept", "skip"] as const) it(`battle Franky ${choice}: every producer boundary remains byte-identical`, async () => {
    const root = process.env.OPT968_BASELINE_ROOT!;
    const baseline = await import(`${root}/workers/game/src/__tests__/opt-960-rig.ts`) as { rig: typeof rig };
    const oldWriter = await import(`${root}/workers/game/src/session/game-state-schema.ts`) as { toPersistedGameState: typeof toPersistedGameState };
    function scenario(make: typeof rig) {
      const r = make(); r.deck(0, 10); r.deck(1, 10); r.life(0, 1);
      const target = r.put("OP10-034", 0, "CHARACTER", { state: "RESTED", data: { power: 5000, cost: 4 } });
      const attacker = r.put("OPT968-PARITY-ATTACKER", 1, "CHARACTER", { data: { power: 7000 } });
      r.state.turn.activePlayerIndex = 1;
      const snapshots = [structuredClone(r.state)];
      r.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId }, 1);
      while (!r.state.pendingPrompt && r.state.turn.battle) r.act({ type: "PASS" });
      snapshots.push(structuredClone(r.state));
      r.act({ type: "PLAYER_CHOICE", choiceId: choice }); snapshots.push(structuredClone(r.state));
      return snapshots;
    }
    const actual = scenario(rig).map((state) => JSON.stringify(toPersistedGameState(state)));
    const expected = scenario(baseline.rig).map((state) => JSON.stringify(oldWriter.toPersistedGameState(state)));
    expect(actual).toEqual(expected);
  });

  it("authored OP10-074 still produces the baseline one-DON offer/payment until writer rollout", async () => {
    const root = process.env.OPT968_BASELINE_ROOT!;
    const baseline = await import(`${root}/workers/game/src/__tests__/opt-960-rig.ts`) as { rig: typeof rig };
    const oldWriter = await import(`${root}/workers/game/src/session/game-state-schema.ts`) as { toPersistedGameState: typeof toPersistedGameState };
    function scenario(make: () => Rig) {
      const r = make(); r.deck(0, 10); r.deck(1, 10);
      r.put("OP10-074", 0, "CHARACTER", { data: { power: 6000 } });
      r.state.players[0].donCostArea = [{ instanceId: "parity-don", state: "ACTIVE", attachedTo: null }];
      const schema = synSchema("OPT968-PARITY-KO", [{ id: "main", category: "activate", trigger: { keyword: "MAIN_EVENT" }, actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } }] }], "Event");
      const source = r.put("OPT968-PARITY-KO", 1, "HAND", { schema, data: { type: "Event", cost: 0, power: null, effectText: "[Main] K.O. opposing Characters." } });
      r.state.turn.activePlayerIndex = 1; r.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId }, 1);
      const snapshots = [structuredClone(r.state)]; r.accept(); snapshots.push(structuredClone(r.state)); return snapshots;
    }
    expect(scenario(rig).map((state) => JSON.stringify(toPersistedGameState(state))))
      .toEqual(scenario(baseline.rig).map((state) => JSON.stringify(oldWriter.toPersistedGameState(state))));
  });
});
