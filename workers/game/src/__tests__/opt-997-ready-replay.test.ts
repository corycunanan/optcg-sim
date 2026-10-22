import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { convertPersistedGameState, parseStoredSession } from "../session/persistence.js";
import type { GameState } from "../types.js";
function captured(family: string) {
  const f = JSON.parse(readFileSync(new URL(`./fixtures/opt-997-v7/${family}.json`, import.meta.url), "utf8"));
  return [f.initial.session.state, ...f.steps.map((s: { expected: GameState }) => s.expected)].find((s: GameState) => s.effectStack.some(f => f.costReplacementResolution)) as GameState;
}
for (const family of ["fixed-mandatory", "selected-mandatory", "compound-select", "compound-arrange", "opponent-life"]) it(`rejects malformed ready ${family} live and every undo ingress before retention`, () => {
  const good = captured(family);
  for (const early of [false, true]) for (const tamper of ["deleted", "missing", "wrong-kind", "foreign", "duplicate", "destination"] as const) {
    const raw = structuredClone(good);
    const owner = raw.effectStack.find(f => f.costReplacementResolution)!;
    if (early) delete owner.costReplacementResolution;
    if (tamper === "deleted") delete owner.costReplacementAction;
    if (tamper === "missing") owner.costReplacementAction = { type: owner.costReplacementAction!.type } as never;
    if (tamper === "wrong-kind") owner.costReplacementAction = { type: "PLAYER_CHOICE", choiceId: "__PAY_FIXED_COST__" };
    if (tamper === "foreign") owner.costReplacementAction = { type: "SELECT_TARGET", selectedInstanceIds: ["foreign"] };
    if (tamper === "duplicate") owner.costReplacementAction = { type: "SELECT_TARGET", selectedInstanceIds: [owner.validTargets[0], owner.validTargets[0]] };
    if (tamper === "destination") owner.costReplacementAction = { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: [...owner.validTargets], destination: "elsewhere" } as never;
    if (family === "fixed-mandatory" && tamper === "wrong-kind") owner.costReplacementAction = { type: "PLAYER_CHOICE", choiceId: "foreign" };
    expect(() => convertPersistedGameState(raw, "state"), `${family}/${tamper}`).toThrow();
    for (const index of [0, 1]) {
      const fixture = JSON.parse(readFileSync(new URL("./fixtures/opt-997-v7/fixed-accept.json", import.meta.url), "utf8"));
      const session = structuredClone(fixture.initial.session);
      const undo = [good, good].map(s => structuredClone(s)); undo[index] = raw;
      expect(() => parseStoredSession(session, fixture.initial["session:card-db"], undo), `${family}/${tamper}/undo${index}`).toThrow();
    }
  }
});
it("pairs an accepted fixed Stage exit by its saved cost even after the Stage left the root", () => {
  const state = captured("fixed-mandatory");
  const owner = state.effectStack.find(f => f.costReplacementResolution)!;
  owner.costs[owner.currentCostIndex] = { type: "TRASH_OWN_STAGE" };
  state.players[0].stage = null;
  expect(() => convertPersistedGameState(state, "state")).not.toThrow();
});
it("retains legacy6 permissive unknown replay data without turning it into an executable outcome", () => {
  const state = captured("selected-mandatory"); state.schemaVersion = 6;
  const owner = state.effectStack.find(f => f.costReplacementResolution)!;
  delete owner.costReplacementResolution;
  owner.costReplacementAction = { type: "SELECT_TARGET" } as never;
  const loaded = convertPersistedGameState(state, "state");
  expect(loaded.effectStack.find(f => f.kind === "COST")!.costReplacementAction).toEqual({ type: "SELECT_TARGET" });
  expect(loaded.effectStack.find(f => f.kind === "COST")!.costReplacementResolution).toBeUndefined();
});

it("rejects malformed encoded Life identities even when a corrupted offer repeats them", () => {
  for (const ids of [[""], ["a", "a"]]) {
    const state = captured("opponent-life");
    const owner = state.effectStack.find(f => f.costReplacementResolution)!;
    const choiceId = `cost-life:${JSON.stringify(ids)}:TOP`;
    owner.validTargets = [choiceId]; owner.costReplacementAction = { type: "PLAYER_CHOICE", choiceId };
    expect(() => convertPersistedGameState(state, "state")).toThrow();
  }
});
