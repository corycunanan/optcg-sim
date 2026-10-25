import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import type { GameState, GameAction, CardData, PendingEvent } from "../types.js";
import { EFFECT_SOURCE_SNAPSHOT_REF, type Action } from "../engine/effect-types.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { resumeFromStackWork } from "../engine/effect-resolver/resume.js";
import { settleResumeProvenance } from "../engine/effect-resolver/resume-provenance.js";
import { executeActionChain, continueSimultaneousGroup, resolveEffectWork } from "../engine/effect-resolver/resolver.js";
const directory = resolve(__dirname, "fixtures/opt-1004-historical-resume");
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
function fixture(file: string) {
  const values = JSON.parse(gunzipSync(readFileSync(resolve(directory, file))).toString());
  const state = convertPersistedGameState(values.session.state, "state");
  const db = new Map<string, CardData>(Object.entries(values["session:card-db"]));
  return { state, db };
}
for (const [name, entry] of Object.entries(manifest.c3Cases) as [string, { file: string; expectedVersion: number; draws: number; schedules: number }][]) it(`C3 actual old ${name} carries the correct accepted-body disposition`, () => {
  const { state, db } = fixture(entry.file); const original = structuredClone(state);
  const prepared: GameState = { ...state, schemaVersion: 10, fieldTrashSemanticsVersion: 8 };
  const hand = state.players[0].hand.length;
  const result = resumeFromStackWork(prepared, { type: "PLAYER_CHOICE", choiceId: "skip" }, db);
  const settled = settleResumeProvenance(state, prepared, result);
  expect(state).toEqual(original);
  expect(settled.state.schemaVersion).toBe(entry.expectedVersion);
  expect(settled.state.players[0].hand.length - hand).toBe(entry.draws);
  expect(settled.state.scheduledActions).toHaveLength(entry.schedules);
  if (entry.expectedVersion === 8) {
    const legacy = resumeFromStackWork(state, { type: "PLAYER_CHOICE", choiceId: "skip" }, db);
    expect(toPersistedGameState(settled.state)).toEqual(toPersistedGameState(legacy.state));
    expect(settled.state.fieldTrashSemanticsVersion).toBeUndefined();
  }
});
it.each(["fixed unpaid", "life unpaid", "DON_REST skip"])("C3 %s abandons without losing retained prior-payment publication", path => {
  const { state, db } = fixture(manifest.c3Cases["any-number-skip"].file);
  const frame = state.effectStack.find(frame => frame.phase === "AWAITING_COST_SELECTION")!;
  delete frame.costTransactionState; delete frame.costExpectedRoot;
  const debt: PendingEvent = { type: "CARD_TRASHED", playerIndex: 0, payload: { cardId: "old-cost", reason: "cost" } };
  frame.accumulatedEvents = [debt];
  frame.costs[frame.currentCostIndex] = path === "life unpaid" ? { type: "LIFE_TO_HAND", amount: 999, position: "TOP_OR_BOTTOM" }
    : { type: path === "DON_REST skip" ? "DON_REST" : "REST_DON", amount: path === "DON_REST skip" ? "ANY_NUMBER" : 999 };
  const action: GameAction = { type: "PLAYER_CHOICE", choiceId: path === "life unpaid" ? "0" : path === "DON_REST skip" ? "skip" : "__PAY_FIXED_COST__" };
  const prepared: GameState = { ...state, schemaVersion: 10, fieldTrashSemanticsVersion: 8 };
  const result = resumeFromStackWork(prepared, action, db);
  expect(result.resumeBodyAbandoned).toBe(true);
  expect(result.events).toContainEqual(debt);
  const settled = settleResumeProvenance(state, prepared, result);
  expect(settled.state.schemaVersion).toBe(8); expect(settled.state.fieldTrashSemanticsVersion).toBeUndefined();
});
it("dispatch progress ignores disabled IF_DO/inline clauses and an all-disabled simultaneous group", () => {
  const { state, db } = fixture(manifest.c3Cases["optional-ifdo-skip"].file);
  const frame = state.effectStack.find(frame => frame.pausedAction)!;
  const id = frame.sourceCardInstanceId;
  const disabled = { type: "IS_MY_TURN", controller: "OPPONENT" } as const;
  const schedule: Action = { type: "SCHEDULE_ACTION", params: { timing: "END_OF_THIS_TURN", action: { type: "DRAW", params: { amount: 1 } } } };
  expect(executeActionChain(state, [{ ...schedule, chain: "IF_DO" }], id, 0, db, undefined, undefined, false).bodyExecuted ?? false).toBe(false);
  expect(executeActionChain(state, [{ ...schedule, conditions: disabled }], id, 0, db).bodyExecuted ?? false).toBe(false);
  const group: Action[] = [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, conditions: disabled }, { type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: -1 }, conditions: disabled, chain: "AND" }];
  const grouped = continueSimultaneousGroup(state, { actions: group, locks: [], nextActionIndex: 0, followingActions: [{ ...schedule, conditions: disabled }], resultRefs: [[EFFECT_SOURCE_SNAPSHOT_REF, { targetInstanceIds: [], count: 0, sourceIdentity: { instanceId: id, cardId: frame.resultRefs.find(([key]) => key === EFFECT_SOURCE_SNAPSHOT_REF)![1].sourceIdentity!.cardId, controller: 0, effectBlockId: "onplay" } }]] }, id, 0, db);
  expect(grouped.bodyExecuted ?? false).toBe(false); expect(grouped.events).toEqual([]); expect(grouped.state.scheduledActions).toHaveLength(0);
  frame.remainingActions = [...group, { ...schedule, conditions: disabled }];
  const prepared: GameState = { ...state, schemaVersion: 10, fieldTrashSemanticsVersion: 8 };
  const declined = resumeFromStackWork(prepared, { type: "PLAYER_CHOICE", choiceId: "skip" }, db);
  expect(declined.resumeBodyAbandoned).toBe(true);
  expect(settleResumeProvenance(state, prepared, declined).state.schemaVersion).toBe(8);
  expect(executeActionChain(state, [schedule], id, 0, db).bodyExecuted).toBe(true);
});
it("a shape-valid historical queued card mismatch never fabricates a contradictory full carrier", () => {
  const { state, db } = fixture(manifest.c3Cases["optional-ifdo-skip"].file);
  state.schemaVersion = 10; state.fieldTrashSemanticsVersion = 8; state.effectStack = []; state.pendingPrompt = null;
  const source = state.players[0].characters.find(card => card)!;
  const block = { id: "queued-provenance", category: "auto" as const, actions: [{ type: "CHOOSE_VALUE" as const, result_ref: "number", params: { domain: "NUMBER" as const, constraints: { min: 0, max: 1 } } }, { type: "DRAW" as const, params: { amount: { type: "CHOSEN_VALUE" as const, ref: "number" } } }] };
  const identity = { instanceId: source.instanceId, cardId: "historical-card-identity", controller: source.controller, effectBlockId: block.id };
  const result = resolveEffectWork(state, block, source.instanceId, source.controller, db, undefined, undefined, undefined, identity);
  const active = result.state.effectStack.flatMap(frame => frame.resultRefs).find(([, value]) => value.sourceIdentity)![1];
  expect(active.sourceIdentity).toEqual(identity); expect(active.sourceCardSnapshot).toBeUndefined();
  expect(() => convertPersistedGameState(toPersistedGameState({ ...result.state, pendingPrompt: result.pendingPrompt ?? null }), "state")).not.toThrow();
});
