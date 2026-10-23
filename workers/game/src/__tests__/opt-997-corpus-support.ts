/** Exact synthetic capture/replay boundary; no engine implementation or state repair. */
import { expect } from "vitest";
import { SessionCoordinator } from "../session/coordinator.js";
import { SessionRepository, type SessionStorage } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import type { GameAction, GameState } from "../types.js";
import type { Rig } from "./opt-960-rig.js";
export function memoryRepository(initial: Record<string, unknown> = {}) {
  const values = structuredClone(initial);
  const storage: SessionStorage = {
    async get<T>(key: string) { return values[key] as T | undefined; },
    async put(keyOrEntries: string | Record<string, unknown>, value?: unknown) {
      Object.assign(values, structuredClone(typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries));
    }, async setAlarm() {}, async deleteAlarm() {},
  };
  return { values, repo: new SessionRepository(storage, { nextJsUrl: "https://example.test", workerSecret: "secret" }) };
}
export async function capture(r: Rig) {
  const { repo, values } = memoryRepository();
  const saved = await repo.save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [] });
  r.state = saved.state;
  await repo.save({ ...saved, undoHistory: [saved.state] });
  const loaded = (await repo.load())!;
  expect(loaded.state).toEqual(toPersistedGameState(saved.state));
  expect(loaded.undoHistory).toEqual([loaded.state]);
  r.state = loaded.state;
  return values;
}
export function command(state: GameState, action: GameAction, db: Rig["db"], actor = state.pendingPrompt?.respondingPlayer ?? state.turn.activePlayerIndex) {
  const bound = { ...action, ...(state.pendingPrompt?.promptId ? { promptId: state.pendingPrompt.promptId } : {}) } as GameAction;
  const result = new SessionCoordinator().executeAction(state, [], actor, bound, db);
  expect(result.kind, result.kind === "reject" ? result.reason : "").not.toBe("reject");
  if (result.kind !== "resume") return result.state;
  const resumed = resumePromptLifecycle(result.state, bound, db, { drainPregame: s => s, advanceStartOfTurn: s => s });
  expect(resumed.responseRejected).toBe(false);
  return resumed.state;
}
export interface CostCorpus {
  family: string;
  initial: Record<string, unknown>;
  steps: { action: GameAction; expected: GameState; stored: Record<string, unknown> }[];
  sourceId: string;
  activationSourceId?: string;
  owner: 0 | 1;
  decline: boolean;
  terminal: boolean;
  knownDebt?: boolean;
}
