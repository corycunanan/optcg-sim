import { describe, expect, it } from "vitest";
import type { CardData, GameState } from "../types.js";
import { rig, synSchema } from "./opt-960-rig.js";
import { toPersistedGameState, GAME_STATE_SCHEMA_VERSION, LATEST_READABLE_GAME_STATE_SCHEMA_VERSION } from "../session/game-state-schema.js";
import { convertPersistedGameState, parseStoredSession, promoteGameStateForWriter } from "../session/persistence.js";
import { collectEndOfTurnObligations, processScheduledActions } from "../engine/duration-tracker.js";
import { hasNativeCostSemantics, hasStructuralCostSemantics } from "../engine/native-cost-semantics.js";
import { resolveEffectWork } from "../engine/effect-resolver/resolver.js";

// Future-format synthetic reader inputs. Stage 1 ordinary writers do not
// capture provenance; stage 2 writer corpus replay is an independent gate.
function scheduledFixture(type: CardData["type"] = "Character", restricted = true) {
  const r = rig();
  const source = r.put("SYN-scheduler", 0, type === "Stage" ? "STAGE" : "CHARACTER", {
    data: { type },
    schema: synSchema("SYN-scheduler", [{ id: "main", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ type: "SCHEDULE_ACTION", params: { timing: "END_OF_THIS_TURN", action: { type: "SET_DON_ACTIVE", params: { amount: 1, up_to: true } } } }] }], type),
  });
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "main" });
  const snapshot = structuredClone(source);
  r.state.scheduledActions[0].sourceCardSnapshot = snapshot;
  r.state.schemaVersion = 9;
  r.state.players[0].donCostArea.forEach(d => d.state = "RESTED");
  if (restricted) {
    const blocker = r.put("OP10-030", 0, "CHARACTER");
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: blocker.instanceId, effectId: "activate_set_don_active_then_prohibit" });
    r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:0" });
  }
  if (type === "Stage") r.state.players[0].stage = null;
  else r.state.players[0].characters = r.state.players[0].characters.map(c => c?.instanceId === source.instanceId ? null : c);
  return { r, source, snapshot };
}

const wire = (state: GameState) => JSON.parse(JSON.stringify(toPersistedGameState(state)));

describe("OPT-1004 schema9 reader and execution", () => {
  it("keeps the production writer8 while accepting9, never changes cost semantics", () => {
    expect(GAME_STATE_SCHEMA_VERSION).toBe(8);
    expect(LATEST_READABLE_GAME_STATE_SCHEMA_VERSION).toBe(9);
    for (const costSemanticsVersion of [6, 7, 8] as const) {
      const { r } = scheduledFixture();
      r.state.costSemanticsVersion = costSemanticsVersion;
      const loaded = convertPersistedGameState(wire(r.state), "state");
      expect(loaded.schemaVersion).toBe(9);
      expect(toPersistedGameState(loaded).schemaVersion).toBe(9);
      expect(promoteGameStateForWriter(loaded, "state").costSemanticsVersion).toBe(costSemanticsVersion);
      expect(hasNativeCostSemantics(loaded)).toBe(costSemanticsVersion >= 7);
      expect(hasStructuralCostSemantics(loaded)).toBe(costSemanticsVersion === 8);
    }
  });

  it.each([true, false])("resumes departed Character obligation with restriction=%s", async restricted => {
    const { r, snapshot } = scheduledFixture("Character", restricted);
    await r.reload();
    expect(r.state.scheduledActions[0].sourceCardSnapshot).toEqual(snapshot);
    r.act({ type: "ADVANCE_PHASE" });
    if (r.state.pendingPrompt) {
      await r.reload();
      r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
    }
    expect(r.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE")).toHaveLength(restricted ? 0 : 1);
  });

  it.each(["Leader", "Event", "Stage"] as const)("retains actual %s category under the restriction", async type => {
    const { r } = scheduledFixture(type);
    await r.reload();
    r.act({ type: "ADVANCE_PHASE" });
    if (r.state.pendingPrompt) r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
    expect(r.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE")).toHaveLength(1);
  });

  it("both scheduled collectors preserve exact origin", () => {
    const { r, snapshot } = scheduledFixture();
    expect(processScheduledActions(r.state, "END_OF_THIS_TURN").actionsToRun[0].sourceCardSnapshot).toEqual(snapshot);
    expect(collectEndOfTurnObligations(r.state, 0, "TURN_PLAYER").entries[0].sourceCardSnapshot).toEqual(snapshot);
  });

  it("retains provenance in a parked queue plus resumed refs, live and mixed undo", async () => {
    const { r, snapshot } = scheduledFixture();
    r.state.scheduledActions.unshift({ ...r.state.scheduledActions[0], id: "first", action: { type: "CHOOSE_VALUE", result_ref: "parked-choice", params: { domain: "NUMBER", constraints: { min: 0, max: 1 } } } });
    r.act({ type: "ADVANCE_PHASE" });
    expect(r.state.pendingPrompt).not.toBeNull();
    const queued = r.state.effectStack.find(f => f.phaseBoundaryContinuation)?.phaseBoundaryContinuation?.remainingScheduledActions;
    expect(queued?.[0].sourceCardSnapshot).toEqual(snapshot);
    const badQueue = wire(r.state);
    const parked = badQueue.effectStack.find((f: { phaseBoundaryContinuation?: unknown }) => f.phaseBoundaryContinuation);
    parked.phaseBoundaryContinuation.remainingScheduledActions[0].sourceCardSnapshot.controller = 9;
    expect(() => convertPersistedGameState(badQueue, "state")).toThrow(/remainingScheduledActions.*sourceCardSnapshot/);
    const badRef = wire(r.state);
    const active = badRef.effectStack.find((f: { resultRefs: [string, { sourceCardSnapshot?: unknown }][] }) => f.resultRefs.some(([, value]) => value.sourceCardSnapshot));
    active.resultRefs.find(([, value]: [string, { sourceCardSnapshot?: unknown }]) => value.sourceCardSnapshot)[1].sourceCardSnapshot.zone = "UNKNOWN";
    expect(() => convertPersistedGameState(badRef, "state")).toThrow(/resultRefs.*sourceCardSnapshot/);
    const current = wire(r.state);
    const legacy = rig().state;
    const parsed = parseStoredSession({ state: current, undoHistory: [wire(legacy), current], cardDb: Object.fromEntries(r.db), mode: "PVP" });
    expect(parsed.undoHistory.map(s => s.schemaVersion)).toEqual([8, 9]);
    expect(toPersistedGameState(parsed.undoHistory[1]).schemaVersion).toBe(9);
    await r.reload();
    r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
    if (r.state.pendingPrompt) {
      await r.reload();
      r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
    }
    expect(r.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE")).toHaveLength(0);
  });

  it("preserves strict scheduled origins inside real COST transaction and expected roots", () => {
    const { r, snapshot } = scheduledFixture();
    r.state.players[0].donCostArea.forEach(d => d.state = "ACTIVE");
    const payer = r.put("SYN-payer", 0, "CHARACTER", { schema: synSchema("SYN-payer", [{ id: "main", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "REST_DON", amount: 1 }, { type: "DON_MINUS", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: payer.instanceId, effectId: "main" });
    const owner = r.state.effectStack.find(f => f.costTransactionState && f.costExpectedRoot)!;
    expect(owner).toBeDefined();
    const loaded = convertPersistedGameState(wire(r.state), "state");
    const cost = loaded.effectStack.find(f => f.id === owner.id)!;
    expect(cost.costTransactionState!.scheduledActions[0].sourceCardSnapshot).toEqual(snapshot);
    expect(cost.costExpectedRoot!.scheduledActions[0].sourceCardSnapshot).toEqual(snapshot);
    for (const field of ["costTransactionState", "costExpectedRoot"] as const) {
      const raw = wire(r.state);
      const frame = raw.effectStack.find((f: { id: string }) => f.id === owner.id);
      frame[field].scheduledActions[0].sourceCardSnapshot.owner = 4;
      expect(() => convertPersistedGameState(raw, "undoHistory[1]")).toThrow(new RegExp(`${field}.*sourceCardSnapshot`));
    }
  });

  it("keeps queued-source departure rejection separate from already-activated provenance", () => {
    const { r, source } = scheduledFixture();
    const result = resolveEffectWork(r.state, { id: "queued", category: "auto", actions: [{ type: "DRAW", params: { amount: 1 } }] }, source.instanceId, 0, r.db, undefined, undefined, undefined, { instanceId: source.instanceId, cardId: source.cardId, controller: 0, effectBlockId: "queued" });
    expect(result.effectNotActivated).toBe(true);
    expect(result.events).toEqual([]);
  });

  it("validates agreement of dual origin carriers and their proven frame owner in9", () => {
    const r = rig();
    r.state.schemaVersion = 9;
    const block = { id: "queued-origin", category: "auto" as const, trigger: { keyword: "ON_PLAY" as const }, costs: [{ type: "TRASH_SELF" as const }], actions: [{ type: "CHOOSE_VALUE" as const, result_ref: "number", params: { domain: "NUMBER" as const, constraints: { min: 0, max: 1 } } }, { type: "DRAW" as const, params: { amount: { type: "CHOSEN_VALUE" as const, ref: "number" } } }, { type: "SCHEDULE_ACTION" as const, params: { timing: "END_OF_THIS_TURN" as const, action: { type: "SET_DON_ACTIVE" as const, params: { amount: 1 } } } }] };
    const source = r.put("SYN-queued-origin", 0, "CHARACTER", { schema: synSchema("SYN-queued-origin", [block]) });
    const result = resolveEffectWork(r.state, block, source.instanceId, 0, r.db, undefined, undefined, undefined, { instanceId: source.instanceId, cardId: source.cardId, controller: 0, effectBlockId: block.id });
    r.state = { ...result.state, pendingPrompt: result.pendingPrompt ?? null };
    const good = wire(r.state);
    expect(() => convertPersistedGameState(good, "state")).not.toThrow();
    for (const [field, value] of [["cardId", "different-card"], ["controller", 1], ["instanceId", "different-instance"]] as const) {
      const raw = structuredClone(good);
      const frame = raw.effectStack.find((f: { resultRefs: [string, { sourceIdentity?: unknown }][] }) => f.resultRefs.some(([, value]) => value.sourceIdentity));
      frame.resultRefs.find(([, value]: [string, { sourceIdentity?: unknown }]) => value.sourceIdentity)[1].sourceCardSnapshot[field] = value;
      expect(() => convertPersistedGameState(raw, "undoHistory[3]")).toThrow(/undoHistory\[3\].*sourceCardSnapshot disagrees with sourceIdentity/);
    }
    const owner = structuredClone(good);
    const frame = owner.effectStack.find((f: { resultRefs: [string, { sourceIdentity?: unknown }][] }) => f.resultRefs.some(([, value]) => value.sourceIdentity));
    frame.effectBlock.id = frame.resultRefs.find(([, value]: [string, { sourceIdentity?: unknown }]) => value.sourceIdentity)[1].sourceIdentity.effectBlockId;
    frame.sourceCardInstanceId = "unrelated";
    expect(() => convertPersistedGameState(owner, "state")).toThrow(/sourceIdentity disagrees with its effect frame owner/);
  });

  it("rejects metadata relabeled8 on read and save", () => {
    const { r } = scheduledFixture();
    const raw = wire(r.state);
    raw.schemaVersion = 8;
    expect(() => convertPersistedGameState(raw, "undoHistory[2]")).toThrow(/undoHistory\[2\].*sourceCardSnapshot requires schemaVersion 9/);
    r.state.schemaVersion = 8;
    expect(() => toPersistedGameState(r.state)).toThrow(/requires schemaVersion 9/);
  });

  it.each([
    ["unknown key", (s: Record<string, unknown>) => { s.cardType = "Character"; }],
    ["bad controller", (s: Record<string, unknown>) => { s.controller = 2; }],
    ["wrong identity", (s: Record<string, unknown>) => { s.instanceId = "another"; }],
    ["missing card", (s: Record<string, unknown>) => { delete s.cardId; }],
  ] as const)("rejects %s with a located snapshot error", (_name, mutate) => {
    const { r } = scheduledFixture();
    const raw = wire(r.state);
    mutate(raw.scheduledActions[0].sourceCardSnapshot);
    expect(() => convertPersistedGameState(raw, "undoHistory[0]")).toThrow(/undoHistory\[0\].*scheduledActions\[0\].sourceCardSnapshot/);
  });
});
