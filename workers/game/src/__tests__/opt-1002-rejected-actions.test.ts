import { describe, expect, it, vi } from "vitest";
import { GameSession } from "../GameSession.js";
import { beginEngineResolution } from "../engine/engine-limits.js";
import { runPipeline } from "../engine/pipeline.js";
import { validate } from "../engine/validation.js";
import { SessionCoordinator } from "../session/coordinator.js";
import type { CardData, Env, GameAction, GameState } from "../types.js";
import { rig, type Rig } from "./opt-960-rig.js";

const usedError = "Effect has already been used this turn";
function fixture(id = "ST01-007", effectId = "activate_give_don") {
  const r = rig();
  const source = r.put(id, 0, "CHARACTER");
  r.state.players[0].donCostArea[0].state = "RESTED";
  r.state.turn.oncePerTurnUsed[effectId] = [source.instanceId];
  r.state = beginEngineResolution(r.state);
  const action: GameAction = { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId };
  return { r, source, action };
}

function rejectAtEveryBoundary(r: Rig, action: GameAction, error: string) {
  const before = structuredClone(r.state);
  const history = [structuredClone(r.state), structuredClone(r.state)];
  history[0].turn.number -= 2;
  history[1].turn.number -= 1;
  const historyBefore = structuredClone(history);
  expect.soft(validate(r.state, action, r.db, 0)).toBe(error);
  const pipeline = runPipeline(r.state, action, r.db, 0);
  expect.soft(pipeline.valid).toBe(false);
  expect.soft(pipeline.error).toBe(error);
  expect.soft(pipeline.pendingPrompt).toBeUndefined();
  expect.soft(pipeline.state).toEqual(before);
  const coordinator = new SessionCoordinator();
  expect(coordinator.canUndo(r.state, history, 0)).toBe(true);
  const result = coordinator.executeAction(r.state, history, 0, action, r.db);
  expect.soft(result.kind).toBe("reject");
  expect.soft(result.state).toEqual(before);
  expect.soft(result.undoHistory[0]).toBe(history[0]);
  expect.soft(result.undoHistory[1]).toBe(history[1]);
  expect.soft(result.undoHistory).toEqual(historyBefore);
  expect.soft(coordinator.canUndo(result.state, result.undoHistory, 0)).toBe(true);
  expect.soft(r.state).toEqual(before);
  expect.soft(history).toEqual(historyBefore);
}

// Rules 10-2-13-1/2/3; canonical ST01-007 and OP01-013 text both
// print [Once Per Turn]. A used effect cannot pay its activation cost again.
describe("OPT-1002 rejected activation and undo state", () => {
  it("rejects a used cost-free authored block across engine and coordinator", () => {
    const { r, action } = fixture();
    rejectAtEveryBoundary(r, action, usedError);
  });

  it.each([true, false])("rejects a used optional block before costs (payable: %s)", (payable) => {
    const { r, action } = fixture("OP01-013", "activate_life_buff");
    r.life(0, payable ? 1 : 0);
    rejectAtEveryBoundary(r, action, usedError);
  });

  it("honors the shared predicate's trigger-level once-per-turn encoding", () => {
    const { r, action } = fixture();
    const schema = structuredClone(r.db.get("ST01-007")!.effectSchema!);
    schema.effects[0].flags = {};
    schema.effects[0].trigger = { keyword: "ACTIVATE_MAIN", once_per_turn: true };
    r.db.set("ST01-007", { ...r.db.get("ST01-007")!, effectSchema: schema });
    rejectAtEveryBoundary(r, action, usedError);
  });

  it.each(["unused", "other instance", "other block", "unrestricted"])("allows the %s control", (control) => {
    const { r, source, action } = fixture();
    if (control === "unused") r.state.turn.oncePerTurnUsed = {};
    if (control === "other instance") r.state.turn.oncePerTurnUsed.activate_give_don = ["another-instance"];
    if (control === "other block") r.state.turn.oncePerTurnUsed = { another_block: [source.instanceId] };
    if (control === "unrestricted") {
      const schema = structuredClone(r.db.get("ST01-007")!.effectSchema!);
      schema.effects[0].flags = {};
      r.db.set("ST01-007", { ...r.db.get("ST01-007")!, effectSchema: schema });
    }
    expect(validate(r.state, action, r.db, 0)).toBeNull();
    const result = runPipeline(r.state, action, r.db, 0);
    expect(result.valid).toBe(true);
    expect(result.pendingPrompt).toBeDefined();
    expect(new SessionCoordinator().executeAction(r.state, [], 0, action, r.db).kind).toBe("applied");
  });

  it.each(["missing source", "missing data", "missing schema", "missing block", "non-activate", "missing trigger", "combined trigger", "wrong trigger", "attached DON"])("rejects execute skip: %s", (skip) => {
    const { r, action } = fixture();
    if (action.type !== "ACTIVATE_EFFECT") throw new Error("Expected activation");
    let error = "Effect not found on this card";
    const data = r.db.get("ST01-007")!;
    const schema = structuredClone(data.effectSchema!);
    const block = schema.effects[0];
    if (skip === "missing source") { action.cardInstanceId = "missing"; error = "Not your card"; }
    if (skip === "missing data") r.db.delete("ST01-007");
    else if (skip === "missing schema") r.db.set("ST01-007", { ...data, effectSchema: null });
    else {
      if (skip === "missing block") action.effectId = "missing";
      if (skip === "non-activate") block.category = "auto";
      if (skip === "missing trigger") delete block.trigger;
      if (skip === "combined trigger") block.trigger = { any_of: [{ keyword: "MAIN_EVENT" }, { keyword: "COUNTER_EVENT" }] };
      if (skip === "wrong trigger") block.trigger = { keyword: "MAIN_EVENT" };
      if (["non-activate", "missing trigger", "combined trigger", "wrong trigger"].includes(skip)) error = "Only Activate: Main effects can be activated with this action";
      if (skip === "attached DON") { block.trigger = { keyword: "ACTIVATE_MAIN", don_requirement: 1 }; error = "Attached DON!! requirement is not met"; }
      r.db.set("ST01-007", { ...data, effectSchema: schema });
    }
    rejectAtEveryBoundary(r, action, error);
  });

  it("preserves history on an engine-rejected action outside activation", () => {
    const { r } = fixture();
    const action: GameAction = { type: "PLAY_CARD", cardInstanceId: "missing" };
    const before = structuredClone(r.state);
    const history = [structuredClone(r.state)];
    const result = new SessionCoordinator().executeAction(r.state, history, 0, action, r.db);
    expect(result.kind).toBe("reject");
    expect(result.state).toEqual(before);
    expect(result.undoHistory).toEqual(history);
    expect(result.undoHistory[0]).toBe(history[0]);
    expect(new SessionCoordinator().canUndo(result.state, result.undoHistory, 0)).toBe(true);
  });

  it("preserves undo on an existing off-field rejection", () => {
    const r = rig();
    const source = r.put("ST01-007", 0, "HAND");
    r.state = beginEngineResolution(r.state);
    rejectAtEveryBoundary(r, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate_give_don" }, "Card must be on the field to activate this effect");
  });

  it.each(["used", "off-field"])("GameSession retains exact undo history after %s rejection and can undo", async (kind) => {
    const { r, source, action } = fixture();
    if (kind === "off-field") {
      r.state.players[0].characters = r.state.players[0].characters.map((card) => card?.instanceId === source.instanceId ? null : card);
      source.zone = "HAND";
      r.state.players[0].hand.push(source);
    }
    const data = new Map<string, unknown>();
    const storage = {
      get: async (key: string) => data.get(key),
      put: vi.fn(async (entries: Record<string, unknown>) => { Object.entries(entries).forEach(([key, value]) => data.set(key, value)); }),
      setAlarm: vi.fn(), deleteAlarm: vi.fn(),
    };
    const durableState = { storage, getWebSockets: () => [], getTags: () => [] } as unknown as DurableObjectState;
    const session = new GameSession(durableState, { GAME_WORKER_SECRET: "test", NEXTJS_URL: "https://example.test" } as Env) as unknown as {
      gameState: GameState; cardDb: Map<string, CardData>; undoHistory: GameState[];
      handleAction(ws: WebSocket, player: 0 | 1, action: GameAction): Promise<void>;
    };
    const previous = structuredClone(r.state);
    previous.turn.number -= 1;
    const history = [previous];
    const before = structuredClone(r.state);
    const historyBefore = structuredClone(history);
    session.gameState = r.state;
    session.cardDb = r.db;
    session.undoHistory = history;
    const sent: string[] = [];
    const ws = { send: (message: string) => sent.push(message) } as unknown as WebSocket;
    await session.handleAction(ws, 0, action);
    expect.soft(JSON.parse(sent[0])).toMatchObject({ type: "action:rejected", reason: kind === "used" ? usedError : "Card must be on the field to activate this effect" });
    expect.soft(session.gameState).toEqual(before);
    expect.soft(session.undoHistory[0]).toBe(previous);
    expect.soft(session.undoHistory).toEqual(historyBefore);
    expect.soft(new SessionCoordinator().canUndo(session.gameState, session.undoHistory, 0)).toBe(true);
    expect.soft(storage.put).not.toHaveBeenCalled();
    await session.handleAction(ws, 0, { type: "UNDO" });
    expect.soft(session.gameState).toEqual(previous);
    expect.soft(session.undoHistory).toEqual([]);
  });
});
