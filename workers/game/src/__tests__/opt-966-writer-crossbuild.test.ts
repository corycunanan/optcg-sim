/** Execute actual writer snapshots with the separately pinned deployed reader.
 * Run with OPT966_READER_ROOT; no reader mocks or schema-only substitute. */
import { expect, it } from "vitest";
import type { GameAction, GameState } from "../types.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { fullEndPhaseScenario, fullEndPhaseReply } from "./opt-962-rig.js";

it.skipIf(!process.env.OPT966_READER_ROOT)("replays every End Phase pause from live and undo on deployed reader", async () => {
  const root = process.env.OPT966_READER_ROOT!;
  const { SessionRepository: ReaderRepository } = await import(`${root}/workers/game/src/session/persistence.ts`) as typeof import("../session/persistence.js");
  const { resumePromptLifecycle: readerResume } = await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`) as typeof import("../session/prompt-lifecycle.js");
  const rig = fullEndPhaseScenario();
  rig.act({ type: "ADVANCE_PHASE" });
  const snapshots: GameState[] = [];
  const replies: GameAction[] = [];
  for (let n = 0; rig.state.pendingPrompt; n++) {
    expect(n).toBeLessThan(12);
    rig.state.pendingPrompt.promptId = `crossbuild-phase-${n}`;
    snapshots.push(structuredClone(rig.state));
    const reply = fullEndPhaseReply(rig, n);
    replies.push(reply.action);
    rig.act(reply.action, reply.player);
  }
  expect(snapshots.length).toBe(5);
  for (const [index, paused] of snapshots.entries()) {
    const storage = new MemorySessionStorage();
    const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
    await new SessionRepository(storage, options).save({ state: paused, cardDb: rig.db,
      mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [paused] });
    const loaded = (await new ReaderRepository(storage, options).load())!;
    for (const initial of [loaded.state, loaded.undoHistory[0]]) {
      let actual = initial;
      for (const action of replies.slice(index)) {
        const result = readerResume(actual, action, rig.db, {
          drainPregame: (s) => s, advanceStartOfTurn: (s) => s,
        });
        expect(result.responseRejected).toBeFalsy();
        actual = result.state;
      }
      expect(actual.pendingPrompt).toBeNull();
      expect(actual.effectStack).toEqual([]);
      expect(actual.eventLog).toEqual(rig.state.eventLog);
      expect(actual.players).toEqual(rig.state.players);
      expect(actual.turn).toEqual(rig.state.turn);
    }
  }
});
