import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect } from "vitest";
import type { GameAction, GameState } from "../../types.js";
import { SessionRepository } from "../../session/persistence.js";
import { MemorySessionStorage } from "./opt-940-synthetic-states.js";
import type { EndPhaseRig } from "../opt-962-rig.js";

export function writerProducer() {
  execFileSync("git", ["diff", "--exit-code", "HEAD", "--", "workers/game/src"], { stdio: "pipe" });
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

export async function writerRoundTrip(state: GameState, cardDb: EndPhaseRig["db"]) {
  const storage = new MemorySessionStorage();
  const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
  await new SessionRepository(storage, options).save({ state, cardDb, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [state] });
  return (await new SessionRepository(storage, options).load())!.state;
}

export async function replayPauses(rig: Pick<EndPhaseRig, "state" | "db" | "act">, choose: (state: GameState) => GameAction, name: string) {
  const root = process.env.OPT966_READER_ROOT!;
  const { SessionRepository: ReaderRepository } = await import(`${root}/workers/game/src/session/persistence.ts`) as typeof import("../../session/persistence.js");
  const { resumePromptLifecycle: readerResume } = await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`) as typeof import("../../session/prompt-lifecycle.js");
  const pauses: GameState[] = [];
  const actions: GameAction[] = [];
  while (rig.state.pendingPrompt) {
    expect(pauses.length).toBeLessThan(12);
    rig.state.pendingPrompt.promptId = `crossbuild-${pauses.length}`;
    rig.state = await writerRoundTrip(rig.state, rig.db);
    pauses.push(structuredClone(rig.state));
    const reply = choose(rig.state);
    actions.push(reply);
    rig.act(reply, rig.state.pendingPrompt!.respondingPlayer);
  }
  expect(pauses.length).toBeGreaterThan(0);
  const corpus: unknown[] = [];
  for (const [index, state] of pauses.entries()) {
    const storage = new MemorySessionStorage();
    const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
    await new SessionRepository(storage, options).save({ state, cardDb: rig.db,
      mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [state] });
    corpus.push({ index, stored: Object.fromEntries(storage.data), replies: actions.slice(index) });
    const loaded = (await new ReaderRepository(storage, options).load())!;
    for (const initial of [loaded.state, loaded.undoHistory[0]]) {
      let actual = initial;
      for (const [offset, action] of actions.slice(index).entries()) {
        actual.pendingPrompt!.promptId = `crossbuild-${index + offset}`;
        const nextStorage = new MemorySessionStorage();
        await new ReaderRepository(nextStorage, options).save({ ...loaded, state: actual, undoHistory: [actual] });
        actual = (await new ReaderRepository(nextStorage, options).load())!.state;
        expect(actual).toEqual(pauses[index + offset]);
        expect(actual.pendingPrompt?.options).toEqual(pauses[index + offset].pendingPrompt?.options);
        expect(actual.pendingPrompt?.respondingPlayer).toEqual(pauses[index + offset].pendingPrompt?.respondingPlayer);
        const result = readerResume(actual, action, rig.db, { drainPregame: s => s, advanceStartOfTurn: s => s });
        expect(result.responseRejected).toBeFalsy();
        actual = result.state;
      }
      expect(actual.pendingPrompt).toBeNull();
      expect(actual.effectStack).toEqual([]);
      expect(actual.eventLog).toEqual(rig.state.eventLog);
      expect(actual.players).toEqual(rig.state.players);
      expect(actual.turn).toEqual(rig.state.turn);
      expect(actual.executionContext).toEqual(rig.state.executionContext);
      expect(actual).toEqual(rig.state);
    }
  }
  if (process.env.OPT966_WRITE_ADDITIONAL_CORPUS) writeFileSync(`${process.env.OPT966_WRITE_ADDITIONAL_CORPUS}/${name}.json`, JSON.stringify({ writerBase: writerProducer(), cases: corpus, expected: rig.state }, null, 2) + "\n");
  return pauses;
}
