/**
 * OPT-1026 (Engine PR 12): admission, terminal state and session errors.
 *
 * - OPT-979: `validate()` rejects every action once `isGameTerminated`, so an
 *   ABANDONED state reaching `runPipeline` directly is refused like FINISHED.
 * - OPT-1011: while a decision waits, the direct pipeline admits only CONCEDE.
 *   Battle and Main-phase commands are rejected without mutation.
 * - OPT-978: the terminal writer stores a structured `endReasonCode`; the
 *   result callback reads it instead of parsing `winReason` text.
 * - OPT-929: an engine throw during an action or prompt reply sends exactly one
 *   `action:rejected`, writes nothing, keeps state and undo history, and the
 *   next valid action still runs.
 */
import { describe, expect, it, vi } from "vitest";
import { GameSession } from "../GameSession.js";
import { beginEngineResolution } from "../engine/engine-limits.js";
import { runPipeline } from "../engine/pipeline.js";
import { runRuleProcessing } from "../engine/defeat.js";
import { terminateGame, terminalReasonCode, type TerminalOutcome } from "../engine/terminal.js";
import { validate } from "../engine/validation.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { ENGINE_ERROR_REJECTION } from "../session/engine-error.js";
import { buildGameResultCallbackPayload } from "../util/result.js";
import type { CardData, Env, GameAction, GameState } from "../types.js";
import { rig, type Rig } from "./opt-960-rig.js";

const DECISION_PENDING = "A player decision must finish before another game action";

/** ST01-007 [Activate: Main] opens a SELECT_TARGET decision in the Main Phase. */
function mainPhaseDecision(): { r: Rig; source: string; state: GameState } {
  const r = rig();
  const source = r.put("ST01-007", 0, "CHARACTER");
  r.put("ST01-007", 0, "HAND");
  r.state = beginEngineResolution(r.state);
  const opened = runPipeline(
    r.state,
    { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate_give_don" },
    r.db,
    0,
  );
  expect(opened.valid, opened.error).toBe(true);
  expect(opened.state.turn.phase).toBe("MAIN");
  expect(opened.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  return { r, source: source.instanceId, state: opened.state };
}

function firstValidTarget(state: GameState): string {
  const options = state.pendingPrompt!.options;
  if (!("validTargets" in options) || !options.validTargets?.length) throw new Error("Expected a target prompt");
  return options.validTargets[0];
}

function directCommands(r: Rig, source: string): GameAction[] {
  const hand = r.state.players[0].hand[0].instanceId;
  const leader = r.state.players[0].leader.instanceId;
  const opponentLeader = r.state.players[1].leader.instanceId;
  return [
    { type: "ADVANCE_PHASE" },
    { type: "PLAY_CARD", cardInstanceId: hand },
    { type: "ATTACH_DON", targetInstanceId: leader, count: 1 },
    { type: "DECLARE_ATTACK", attackerInstanceId: leader, targetInstanceId: opponentLeader },
    { type: "ACTIVATE_EFFECT", cardInstanceId: source, effectId: "activate_give_don" },
    { type: "MANUAL_EFFECT", cardInstanceId: source, description: "probe" } as GameAction,
    { type: "PASS" },
    { type: "DECLARE_BLOCKER", blockerInstanceId: leader },
    { type: "SELECT_TARGET", selectedInstanceIds: [] },
  ];
}

describe("OPT-979: terminal states reject every direct action", () => {
  it.each(["FINISHED", "ABANDONED"] as const)("%s state is refused by validate and runPipeline", (status) => {
    const r = rig();
    const source = r.put("ST01-007", 0, "CHARACTER");
    r.put("ST01-007", 0, "HAND");
    const ended: GameState = { ...r.state, status, winner: null, winReason: "ended" };
    r.state = ended;
    for (const action of [...directCommands(r, source.instanceId), { type: "CONCEDE" } as GameAction]) {
      const before = structuredClone(ended);
      expect(validate(ended, action, r.db, 0), action.type).toBe("Game is already over");
      const result = runPipeline(ended, action, r.db, 0);
      expect(result.valid, action.type).toBe(false);
      expect(result.error).toBe("Game is already over");
      expect(result.state).toEqual(before);
      expect(ended).toEqual(before);
    }
  });
});

describe("OPT-1011: direct pipeline admission while a decision waits", () => {
  it("rejects every non-CONCEDE command without mutating state", () => {
    const { r, source, state } = mainPhaseDecision();
    for (const action of directCommands(r, source)) {
      const before = structuredClone(state);
      const result = runPipeline(state, action, r.db, 0);
      expect(result.valid, action.type).toBe(false);
      expect(result.error, action.type).toBe(DECISION_PENDING);
      expect(result.state).toEqual(before);
      expect(result.state.turn.phase).toBe("MAIN");
      expect(result.state.pendingPrompt).toEqual(before.pendingPrompt);
    }
  });

  it("still admits CONCEDE during the decision", () => {
    const { r, state } = mainPhaseDecision();
    const result = runPipeline(state, { type: "CONCEDE" }, r.db, 1);
    expect(result.valid).toBe(true);
    expect(result.state.status).toBe("FINISHED");
    expect(result.state.winner).toBe(0);
    expect(result.state.endReasonCode).toBe("CONCEDE");
  });

  it("still admits the legitimate prompt reply through the session coordinator", () => {
    const { r, state } = mainPhaseDecision();
    const target = firstValidTarget(state);
    const coordinator = new SessionCoordinator();
    const reply: GameAction = { type: "SELECT_TARGET", selectedInstanceIds: [target], promptId: state.pendingPrompt!.promptId };
    expect(coordinator.executeAction(state, [], 0, reply, r.db).kind).toBe("resume");
    const advance = coordinator.executeAction(state, [], 0, { type: "ADVANCE_PHASE" }, r.db);
    expect(advance.kind).toBe("reject");
    expect(advance.state).toBe(state);
  });

  it("control: the same commands are admitted with no decision pending", () => {
    const r = rig();
    r.state = beginEngineResolution(r.state);
    expect(runPipeline(r.state, { type: "ADVANCE_PHASE" }, r.db, 0).valid).toBe(true);
  });
});

describe("OPT-978: structured end reason codes", () => {
  const cases: Array<[string, TerminalOutcome, string]> = [
    ["rules deck-out", { kind: "RULES", winner: 1, reason: "Player 1 decked out", cause: "DECK_OUT" }, "DECK_OUT"],
    ["rules life", { kind: "RULES", winner: 0, reason: "Player 2's life reached 0", cause: "LIFE_LOSS" }, "LIFE_LOSS"],
    ["rules Nami win-instead", { kind: "RULES", winner: 0, reason: "x", cause: "DECK_OUT_WIN_INSTEAD" }, "DECK_OUT_WIN_INSTEAD"],
    ["joint draw", { kind: "RULES", winner: null, reason: "x — draw", cause: null }, "JOINT_DRAW"],
    ["WIN_GAME", { kind: "WIN_GAME", winner: 1 }, "CARD_EFFECT_WIN"],
    ["concession", { kind: "CONCESSION", concedingPlayer: 0 }, "CONCEDE"],
    ["rejoin timeout", { kind: "ABANDONMENT", status: "FINISHED", winner: 0, reason: "x", cause: "REJOIN_TIMEOUT" }, "DISCONNECT_TIMEOUT"],
    ["both away", { kind: "ABANDONMENT", status: "ABANDONED", winner: null, reason: "x", cause: "REJOIN_TIMEOUT" }, "DISCONNECT_TIMEOUT"],
    ["pre-game leave", { kind: "ABANDONMENT", status: "FINISHED", winner: 1, reason: "x", cause: "PREGAME_LEAVE", clearPregame: true }, "PREGAME_LEAVE"],
    ["external result", { kind: "EXTERNAL_RESULT", winner: 1, reason: "Player conceded while disconnected" }, "FALLBACK_CONCEDE"],
    ["engine limit", { kind: "ENGINE_LIMIT", diagnostic: { kind: "ACTION_BUDGET", limit: 1, count: 2 } as never }, "ENGINE_LIMIT"],
    ["engine contract", { kind: "ENGINE_CONTRACT", diagnostic: { kind: "ENGINE_CONTRACT", message: "x" } as never }, "ENGINE_CONTRACT"],
  ];

  it.each(cases)("%s writes and reports its own code", (_name, outcome, code) => {
    const r = rig();
    const ended = terminateGame(r.state, outcome);
    expect(terminalReasonCode(outcome)).toBe(code);
    expect(ended.endReasonCode).toBe(code);
    expect(buildGameResultCallbackPayload(ended).reasonCode).toBe(code);
  });

  it("rule processing names the defeat cause from the checkpoint, not the text", () => {
    const deckOut = rig();
    deckOut.state.players[0].deck = [];
    expect(runRuleProcessing(deckOut.state, {}, deckOut.db).endReasonCode).toBe("DECK_OUT");

    const life = rig();
    life.state.players[1].life = [];
    expect(runRuleProcessing(life.state, { lethalDamage: [1] }, life.db).endReasonCode).toBe("LIFE_LOSS");

    const nami = rig();
    nami.leader(0, "OP03-040");
    nami.state.players[0].deck = [];
    const namiWin = runRuleProcessing(nami.state, {}, nami.db);
    expect(namiWin.winner).toBe(0);
    expect(namiWin.endReasonCode).toBe("DECK_OUT_WIN_INSTEAD");

    const joint = rig();
    joint.state.players[0].deck = [];
    joint.state.players[1].deck = [];
    const draw = runRuleProcessing(joint.state, {}, joint.db);
    expect(draw.winner).toBeNull();
    expect(draw.endReasonCode).toBe("JOINT_DRAW");
  });

  it("the first terminal code stands", () => {
    const r = rig();
    const conceded = terminateGame(r.state, { kind: "CONCESSION", concedingPlayer: 0 });
    const later = terminateGame(conceded, { kind: "WIN_GAME", winner: 0 });
    expect(later.endReasonCode).toBe("CONCEDE");
  });

  it.each([
    ["Player 1 won by a card effect", "FINISHED", null, "CARD_EFFECT_WIN"],
    ["Player 1's deck reached 0 — Player 1 wins instead of losing", "FINISHED", null, "DECK_OUT_WIN_INSTEAD"],
    ["Player 1 decked out; Player 2 decked out — draw", "FINISHED", null, "JOINT_DRAW"],
    ["Engine resolution limit reached — the game ended with no winner", "FINISHED", "ENGINE_LIMIT", "ENGINE_LIMIT"],
    ["Player 2 decked out", "FINISHED", null, "DECK_OUT"],
    ["Player 2's life reached 0", "FINISHED", null, "LIFE_LOSS"],
    ["Player 1 conceded", "FINISHED", null, "CONCEDE"],
    ["Rejoin window expired while both players were away", "ABANDONED", null, "DISCONNECT_TIMEOUT"],
  ] as const)("a save without a stored code still resolves %s", (winReason, status, engineType, code) => {
    const r = rig();
    const legacy: GameState = {
      ...r.state,
      status,
      winner: null,
      winReason,
      engineOutcome: engineType ? ({ type: engineType, diagnostic: {} } as never) : null,
    };
    delete legacy.endReasonCode;
    expect(buildGameResultCallbackPayload(legacy).reasonCode).toBe(code);
  });
});

type SessionInternals = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  undoHistory: GameState[];
  coordinator: SessionCoordinator;
  handleAction(ws: WebSocket, player: 0 | 1, action: GameAction): Promise<void>;
};

function sessionHarness(state: GameState, db: Map<string, CardData>, history: GameState[]) {
  const data = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => data.get(key),
    put: vi.fn(async (entries: Record<string, unknown>) => {
      Object.entries(entries).forEach(([key, value]) => data.set(key, value));
    }),
    setAlarm: vi.fn(),
    deleteAlarm: vi.fn(),
  };
  const durableState = { storage, getWebSockets: () => [], getTags: () => [] } as unknown as DurableObjectState;
  const session = new GameSession(durableState, {
    GAME_WORKER_SECRET: "test",
    NEXTJS_URL: "https://example.test",
  } as Env) as unknown as SessionInternals;
  session.gameState = state;
  session.cardDb = db;
  session.undoHistory = history;
  const sent: Array<{ type: string; reason?: string }> = [];
  const ws = { send: (message: string) => sent.push(JSON.parse(message)) } as unknown as WebSocket;
  return { session, storage, sent, ws };
}

describe("OPT-929: engine exceptions at the GameSession boundary", () => {
  it("an action throw sends one action:rejected, writes nothing, and the next action runs", async () => {
    const r = rig();
    r.state = beginEngineResolution(r.state);
    const previous = structuredClone(r.state);
    previous.turn.number -= 1;
    const before = structuredClone(r.state);
    const { session, storage, sent, ws } = sessionHarness(r.state, r.db, [previous]);
    const spy = vi.spyOn(session.coordinator, "executeAction").mockImplementationOnce(() => {
      throw new Error("[zone-transition] instance id collision");
    });

    await session.handleAction(ws, 0, { type: "ADVANCE_PHASE" });

    expect(sent).toEqual([expect.objectContaining({ type: "action:rejected", reason: ENGINE_ERROR_REJECTION })]);
    expect(storage.put).not.toHaveBeenCalled();
    expect(session.gameState).toEqual(before);
    expect(session.undoHistory).toEqual([previous]);
    expect(session.undoHistory[0]).toBe(previous);

    spy.mockRestore();
    sent.length = 0;
    await session.handleAction(ws, 0, { type: "ADVANCE_PHASE" });
    expect(sent.some((message) => message.type === "action:rejected")).toBe(false);
    expect(storage.put).toHaveBeenCalled();
    expect(session.gameState.turn.activePlayerIndex).toBe(1);
  });

  it("a prompt-reply throw keeps the prompt and the undo history", async () => {
    const { r, state } = mainPhaseDecision();
    const previous = structuredClone(state);
    previous.turn.number -= 1;
    const before = structuredClone(state);
    const { session, storage, sent, ws } = sessionHarness(state, r.db, [previous]);
    const spy = vi.spyOn(session.coordinator, "surfaceRevealTrigger").mockImplementationOnce(() => {
      throw new Error("engine invariant");
    });
    const target = firstValidTarget(state);
    const reply: GameAction = { type: "SELECT_TARGET", selectedInstanceIds: [target], promptId: state.pendingPrompt!.promptId };

    await session.handleAction(ws, 0, reply);

    expect(sent).toEqual([expect.objectContaining({ type: "action:rejected", reason: ENGINE_ERROR_REJECTION })]);
    expect(storage.put).not.toHaveBeenCalled();
    expect(session.gameState).toEqual(before);
    expect(session.undoHistory).toEqual([previous]);

    spy.mockRestore();
    sent.length = 0;
    await session.handleAction(ws, 0, reply);
    expect(sent.some((message) => message.type === "action:rejected")).toBe(false);
    expect(storage.put).toHaveBeenCalled();
    expect(session.gameState.pendingPrompt).toBeNull();
    expect(session.undoHistory).toEqual([]);
  });
});
