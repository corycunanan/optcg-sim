import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { getSyntheticStates } from "./fixtures/opt-940-golden.js";

it("all current live/undo writer inputs emit v6 first, including undefined/stale provenance and trigger owners", () => {
  for (const input of getSyntheticStates()) for (const state of [input.snapshot.state, ...input.snapshot.undoHistory]) {
    for (const version of [undefined, 4, 5, 6]) {
      const copy = structuredClone(state); Object.defineProperty(copy, "schemaVersion", { value: version, enumerable: true });
      const written = toPersistedGameState(copy);
      expect(Object.keys(written)[0]).toBe("schemaVersion"); expect(written.schemaVersion).toBe(6);
      for (const frame of written.effectStack) if (frame.replacementBatch) expect(frame.replacementBatch.events?.length).toBeGreaterThan(0);
    }
  }
});

for (const choice of ["accept", "skip"] as const) it(`current Franky ${choice} writes native7 before, during and after battle`, () => {
  const r = rig(); r.deck(0, 10); r.deck(1, 10); r.life(0, 1);
  const target = r.put("OP10-034", 0, "CHARACTER", { state: "RESTED", data: { power: 5000, cost: 4 } });
  const attacker = r.put("OPT968-CURRENT-ATTACKER", 1, "CHARACTER", { data: { power: 7000 } });
  expect(toPersistedGameState(r.state).schemaVersion).toBe(7);
  r.state.turn.activePlayerIndex = 1;
  r.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId }, 1);
  while (!r.state.pendingPrompt && r.state.turn.battle) r.act({ type: "PASS" });
  expect(toPersistedGameState(r.state).schemaVersion).toBe(7);
  r.act({ type: "PLAYER_CHOICE", choiceId: choice });
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.turn.battle).toBeNull();
  expect(r.state.players[0].characters.some((card) => card?.instanceId === target.instanceId)).toBe(choice === "accept");
  expect(toPersistedGameState(r.state).schemaVersion).toBe(7);
});

for (const amount of [1, 2]) it(`current Pica requires both active DON!! (${amount} available)`, () => {
  const r = rig(); r.deck(0, 10); r.deck(1, 10);
  const pica = r.put("OP10-074", 0, "CHARACTER", { data: { power: 6000 } });
  r.state.players[0].donCostArea = Array.from({ length: amount }, (_, i) => ({ instanceId: `current-don-${i}`, state: "ACTIVE", attachedTo: null }));
  const schema = synSchema("OPT968-CURRENT-KO", [{ id: "main", category: "activate", trigger: { keyword: "MAIN_EVENT" }, actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } }] }], "Event");
  const source = r.put("OPT968-CURRENT-KO", 1, "HAND", { schema, data: { type: "Event", cost: 0, power: null, effectText: "[Main] K.O. opposing Characters." } });
  r.state.turn.activePlayerIndex = 1; r.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId }, 1);
  if (amount === 2) r.accept();
  expect(r.state.players[0].characters.some((card) => card?.instanceId === pica.instanceId)).toBe(amount === 2);
  expect(r.state.players[0].donCostArea.filter((don) => don.state === "RESTED")).toHaveLength(amount === 2 ? 2 : 0);
  expect(toPersistedGameState(r.state).schemaVersion).toBe(7);
});
