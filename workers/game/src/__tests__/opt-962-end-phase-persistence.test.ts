/**
 * OPT-962 (OPT-924): a staged End Phase gives the same result whether it runs
 * continuously in memory, is saved and reloaded at every prompt (version 2
 * writer, OPT-980 reader), or is reached again after an undo through the
 * persisted undo snapshot. Fixed choices on every path.
 *
 * Rules: 6-6-1-1 (line 607), 6-6-1-1-2 (line 611), 6-6-1-2 (line 617),
 * 6-6-1-3 (line 622), 6-6-1-4 (line 624). Cards: OP04-034 (docs/cards/OP-04.md:234),
 * OP03-015 Lim (docs/cards/OP-03.md:95); the rest are synthetic stand-ins.
 *
 * | Stage reached | Prompt | Chooser | Fixed answer |
 * |---|---|---|---|
 * | END_OF_YOUR_TURN_WAVE | OP04-034 K.O. target | p0 | Lim |
 * | END_OF_YOUR_TURN_WAVE (nested) | Lim's −2000 target | p1 | p0's Leader |
 * | END_OF_OPPONENT_TURN_WAVE | p1's optional [End of Your Opponent's Turn] draw | p1 | accept |
 * | TURN_PLAYER_END_OF_TURN | p0's scheduled K.O. | p0 | none |
 * | NON_TURN_PLAYER_END_OF_TURN | p1's scheduled K.O. | p1 | none |
 */

import { describe, expect, it } from "vitest";
import type { GameState } from "../types.js";
import {
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
  SessionRepository,
} from "../session/persistence.js";
import { GAME_STATE_SCHEMA_VERSION_KEY } from "../session/game-state-schema.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { EXPECTED_STAGES, fullEndPhaseScenario as scenario, fullEndPhaseReply as reply, type EndPhaseRig } from "./opt-962-rig.js";

async function roundTrip(r: EndPhaseRig): Promise<void> {
  const storage = new MemorySessionStorage();
  const repo = new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
  await repo.save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [] });
  const written = storage.data.get(SESSION_STORAGE_KEY) as { state: Record<string, unknown> };
  expect(written.state[GAME_STATE_SCHEMA_VERSION_KEY]).toBe(4);
  r.state = (await new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" }).load())!.state;
}

function stageOf(state: GameState): string | undefined {
  return state.effectStack.find((f) => f.phaseBoundaryContinuation)?.phaseBoundaryContinuation?.stage;
}

/** Run the End Phase from MAIN with the fixed replies; `afterEach` runs after every action. */
async function endTurn(r: EndPhaseRig, afterEach: (r: EndPhaseRig) => Promise<void> = async () => {}) {
  const from = r.state.eventLog.length;
  const stages: string[] = [];
  r.act({ type: "ADVANCE_PHASE" });
  await afterEach(r);
  for (let n = 0; r.state.pendingPrompt; n += 1) {
    stages.push(stageOf(r.state) ?? "none");
    const { action, player } = reply(r, n);
    r.act(action, player);
    await afterEach(r);
  }
  const events = r.state.eventLog.slice(from).map((e) => ({ type: e.type, playerIndex: e.playerIndex, payload: e.payload }));
  return { events, stages, final: r.state };
}

/**
 * Saving assigns each new prompt a `promptId` from the engine id counter
 * (persistence.ts ensurePromptId), so engine-allocated ids (`card_…`, `ef_…`)
 * shift by one per save. Compare them by order of first appearance.
 */
function normalizeIds<T>(value: T): unknown {
  const seen = new Map<string, string>();
  return JSON.parse(JSON.stringify(value).replace(/"(card|ef|prompt)_[0-9a-z]+"/g, (id) => {
    if (!seen.has(id)) seen.set(id, `"$engine-id-${seen.size}"`);
    return seen.get(id)!;
  }));
}

function zones(state: GameState) {
  return state.players.map((p) => ({
    hand: p.hand.map((c) => c.instanceId),
    deck: p.deck.length,
    trash: p.trash.map((c) => c.cardId),
    characters: p.characters.map((c) => c?.cardId ?? null),
    life: p.life.length,
  }));
}

describe("OPT-962 End Phase: continuous, reloaded and undo paths agree", () => {
  it("parks in every stage in rule order and hands off once", async () => {
    const { events, stages, final } = await endTurn(scenario());
    expect(stages).toEqual(EXPECTED_STAGES);
    const log = events.map((e) => `${e.type}:p${e.playerIndex}`);
    expect(log.filter((e) => e === "TURN_ENDED:p0")).toHaveLength(1);
    expect(log.indexOf("CARD_KO:p1")).toBeLessThan(log.indexOf("TURN_ENDED:p0"));
    // p1's accepted wave-2 draw, then p0's step-1 draw, then p1's step-2 draw, all before the hand-off.
    const draws = log.filter((e) => e.startsWith("CARD_DRAWN"));
    expect(draws).toEqual(["CARD_DRAWN:p1", "CARD_DRAWN:p0", "CARD_DRAWN:p1"]);
    expect(log.lastIndexOf("CARD_DRAWN:p1")).toBeLessThan(log.indexOf("TURN_ENDED:p0"));
    expect(final.turn.activePlayerIndex).toBe(1);
    expect(final.effectStack).toEqual([]);
    expect(final.scheduledActions).toEqual([]);
  });

  it("saving and reloading at every prompt gives identical events, stages and zones", async () => {
    const continuous = await endTurn(scenario());
    const reloaded = await endTurn(scenario(), roundTrip);
    expect(reloaded.stages).toEqual(EXPECTED_STAGES);
    expect(reloaded.stages).toEqual(continuous.stages);
    expect(normalizeIds(reloaded.events)).toEqual(normalizeIds(continuous.events));
    expect(normalizeIds(zones(reloaded.final))).toEqual(normalizeIds(zones(continuous.final)));
    expect(normalizeIds(reloaded.final.activeEffects)).toEqual(normalizeIds(continuous.final.activeEffects));
  });

  it("an undo through the persisted version 2 undo snapshot, then the same End Phase, gives identical events", async () => {
    const continuous = await endTurn(scenario());

    const r = scenario();
    const coordinator = new SessionCoordinator();
    const attached = coordinator.executeAction(r.state, [], 0, { type: "ATTACH_DON", targetInstanceId: r.state.players[0].leader.instanceId, count: 1 }, r.db);
    expect(attached.kind).toBe("applied");
    // Persist and reload the live state and its undo snapshot (both version 2).
    const storage = new MemorySessionStorage();
    const repo = new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
    await repo.save({ state: attached.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: attached.undoHistory });
    // Both persisted objects are version 4 (the OPT-964 writer), not v1 bytes.
    const stored = storage.data.get(SESSION_STORAGE_KEY) as { state: Record<string, unknown> };
    expect(stored.state[GAME_STATE_SCHEMA_VERSION_KEY]).toBe(4);
    const storedUndo = storage.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY) as Array<Record<string, unknown>>;
    expect(storedUndo).toHaveLength(1);
    expect(storedUndo[0][GAME_STATE_SCHEMA_VERSION_KEY]).toBe(4);
    const loaded = (await new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" }).load())!;
    expect(loaded.undoHistory).toHaveLength(1);
    const undone = coordinator.executeAction(loaded.state, loaded.undoHistory, 0, { type: "UNDO" }, r.db);
    expect(undone.kind).toBe("undo");
    r.state = undone.state;

    const replay = await endTurn(r);
    // The replay must be the staged End Phase itself, not just equal to another run.
    expect(replay.stages).toEqual(EXPECTED_STAGES);
    expect(replay.stages).toEqual(continuous.stages);
    expect(normalizeIds(replay.events)).toEqual(normalizeIds(continuous.events));
    expect(normalizeIds(zones(replay.final))).toEqual(normalizeIds(zones(continuous.final)));
  });
});
