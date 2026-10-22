/** Shape-free producer experiment: use actual writer bytes, then both engines.
 * Synthetic sessions, not captured production sessions (OPT-971 remains open).
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GameAction, GameState } from "../types.js";
import { endPhaseRig, synSchema } from "./opt-962-rig.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { drainPendingWork } from "../engine/pending-work-drain.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { createTriggerExecution } from "../engine/trigger-executor.js";
import { terminateGame } from "../engine/terminal.js";
import { CARDS } from "./helpers.js";

const config = {
  nextJsUrl: "https://app.example.test",
  workerSecret: "secret",
};
const lifecycle = {
  drainPregame: (s: GameState) => s,
  advanceStartOfTurn: (s: GameState) => s,
};
async function write(
  state: GameState,
  db: ReturnType<typeof endPhaseRig>["db"]
) {
  const storage = new MemorySessionStorage();
  await new SessionRepository(storage, config).save({
    state,
    cardDb: db,
    undoHistory: [state],
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
  });
  return Object.fromEntries(storage.data);
}
function storageFor(stored: Record<string, unknown>) {
  const storage = new MemorySessionStorage();
  for (const [key, value] of Object.entries(stored))
    storage.data.set(key, structuredClone(value));
  return storage;
}

describe.each(["attack", "block"] as const)(
  "conditional %s transition writer",
  (step) => {
    it("keeps current live/undo replies equivalent; pinned old reader degrades only to its prior checkpoint defect", async () => {
      const r = endPhaseRig({ handSize: 0 });
      const attacker = r.putSyn("ATTACKER-967", null, 0, "CHARACTER");
      const watcher = r.putSyn(
        "WATCHER-967",
        synSchema("WATCHER-967", "Character", [
          {
            id: "remove-combatant",
            category: "auto",
            trigger: {
              keyword: step === "attack" ? "ON_OPPONENT_ATTACK" : "ON_BLOCK",
            },
            actions: [
              {
                type: "TRASH_CARD",
                target: {
                  type: "CHARACTER",
                  controller: "OPPONENT",
                  count: { up_to: 1 },
                },
              },
            ],
          },
        ]),
        1,
        "CHARACTER",
        { keywords: { ...CARDS.BLOCKER.keywords } }
      );
      const initial = structuredClone(r.state);
      const commands: [GameAction, 0 | 1][] = [
        [
          {
            type: "DECLARE_ATTACK",
            attackerInstanceId: attacker.instanceId,
            targetInstanceId: initial.players[1].leader.instanceId,
          },
          0,
        ],
      ];
      if (step === "block")
        commands.push([
          { type: "DECLARE_BLOCKER", blockerInstanceId: watcher.instanceId },
          1,
        ]);
      for (const [action, player] of commands) r.act(action, player);
      expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      const held = r.state.effectStack
        .flatMap((f) => f.accumulatedEvents)
        .filter(
          (e) =>
            e.type === "PHASE_CHANGED" &&
            e.payload?.from ===
              (step === "attack" ? "ATTACK_STEP" : "BLOCK_STEP")
        );
      expect(held).toHaveLength(1);
      expect(held[0].propagation).toBeUndefined();
      expect(
        r.state.eventLog.some(
          (e) =>
            e.type === "PHASE_CHANGED" &&
            e.payload?.from ===
              (step === "attack" ? "ATTACK_STEP" : "BLOCK_STEP")
        )
      ).toBe(false);
      r.state.pendingPrompt!.promptId = `opt967-${step}`;
      const stored = await write(r.state, r.db);
      const loaded = (await new SessionRepository(
        storageFor(stored),
        config
      ).load())!;
      const reply: GameAction = {
        type: "SELECT_TARGET",
        selectedInstanceIds: [attacker.instanceId],
      };
      const expected = resumePromptLifecycle(
        structuredClone(r.state),
        reply,
        r.db,
        lifecycle
      );
      expect(expected.responseRejected).toBe(false);
      expect(expected.state.turn.battle).toBeNull();
      for (const current of [loaded.state, loaded.undoHistory[0]]) {
        const rejected = resumePromptLifecycle(
          current,
          { type: "SELECT_TARGET", selectedInstanceIds: ["invalid"] },
          loaded.cardDb,
          lifecycle
        );
        expect(rejected.responseRejected).toBe(true);
        expect(rejected.state).toEqual(current);
        const actual = resumePromptLifecycle(
          current,
          reply,
          loaded.cardDb,
          lifecycle
        );
        expect(actual).toEqual({ ...expected, state: { ...expected.state, schemaVersion: 6 } });
        expect(actual.state.effectStack).toEqual([]);
        expect(actual.state.pendingPrompt).toBeNull();
        expect(
          actual.state.eventLog.filter((e) => e.type === "END_OF_BATTLE")
        ).toHaveLength(1);
        expect(
          actual.state.eventLog.some(
            (e) => e.type === "CHARACTER_BATTLES" || e.type === "DAMAGE_DEALT"
          )
        ).toBe(false);
      }
      // Completing an inner owner must not release the outer window's held
      // notification while its original decision remains outstanding.
      const child = createTriggerExecution(structuredClone(loaded.state), [
        {
          sourceCardInstanceId: watcher.instanceId,
          controller: 1,
          triggeringEvent: {
            type: "CARD_DRAWN",
            playerIndex: 1,
            payload: { cardId: "probe" },
          },
          effectBlock: { id: "nested-noop", category: "auto", actions: [] },
        },
      ]);
      const innerDone = drainPendingWork(
        child,
        loaded.cardDb,
        resolverExecutionServices
      );
      expect(innerDone.state.pendingPrompt).toEqual(loaded.state.pendingPrompt);
      expect(innerDone.state.eventLog).toEqual(loaded.state.eventLog);
      expect(
        innerDone.state.effectStack
          .flatMap((frame) => frame.accumulatedEvents)
          .filter((event) => event.type === "PHASE_CHANGED")
      ).toHaveLength(1);
      expect(
        resumePromptLifecycle(innerDone.state, reply, loaded.cardDb, lifecycle)
          .state.turn.battle
      ).toBeNull();
      const terminal = drainPendingWork(
        {
          state: terminateGame(structuredClone(loaded.state), {
            kind: "WIN_GAME",
            winner: 0,
          }),
          events: held,
          resolved: true,
        },
        loaded.cardDb,
        resolverExecutionServices
      );
      expect(terminal.kind).toBe("terminal");
      expect(terminal.state.effectStack).toEqual([]);
      expect(
        terminal.state.eventLog.some(
          (event) =>
            event.type === "PHASE_CHANGED" &&
            event.payload?.from ===
              (step === "attack" ? "ATTACK_STEP" : "BLOCK_STEP")
        )
      ).toBe(false);
      expect(terminal.state.eventLog.at(-1)?.type).toBe("GAME_OVER");
      const root = process.env.OPT967_BASELINE_ROOT;
      if (!root) return;
      const oldPersistence = (await import(
        `${root}/workers/game/src/session/persistence.ts`
      )) as typeof import("../session/persistence.js");
      const oldPipeline = (await import(
        `${root}/workers/game/src/engine/pipeline.ts`
      )) as typeof import("../engine/pipeline.js");
      const oldLifecycle = (await import(
        `${root}/workers/game/src/session/prompt-lifecycle.ts`
      )) as typeof import("../session/prompt-lifecycle.js");
      const oldLoaded = (await new oldPersistence.SessionRepository(
        storageFor(stored),
        config
      ).load())!;
      let baseline = initial;
      for (const [action, player] of commands)
        baseline = oldPipeline.runPipeline(
          baseline,
          action,
          r.db,
          player
        ).state;
      const baselineOutcome = oldLifecycle.resumePromptLifecycle(
        baseline,
        reply,
        r.db,
        lifecycle
      );
      const rollbackOutcomes = [oldLoaded.state, oldLoaded.undoHistory[0]].map(
        (state) =>
          oldLifecycle.resumePromptLifecycle(
            state,
            reply,
            oldLoaded.cardDb,
            lifecycle
          )
      );
      const dir = process.env.OPT967_EXPERIMENT_DIR;
      if (dir) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, `${step}.json`),
          JSON.stringify(
            {
              provenance: "synthetic actual pipeline/writer",
              stored,
              current: expected,
              baselineOutcome,
              rollbackOutcomes,
            },
            null,
            2
          )
        );
      }
      for (const actual of rollbackOutcomes) {
        expect(actual.responseRejected).toBe(false);
        expect(actual.state.pendingPrompt).toBeNull();
        expect(actual.state.effectStack).toEqual([]);
        // This is the baseline's pre-OPT951 defect, not semantic equivalence to
        // the corrected candidate: old engine still exposes the next step.
        expect(actual.state.turn.battleSubPhase).toBe(
          step === "attack" ? "BLOCK_STEP" : "COUNTER_STEP"
        );
        // Exact observed deltas from this fixed-seed, pinned-main experiment.
        // Do not normalize identities: assert every other byte/field, and pin
        // the moved card's new identity together with its event payload.
        const expectedRollback = structuredClone(baselineOutcome);
        if (step === "attack") {
          expectedRollback.state.eventLog[2].timestamp = 7;
          expectedRollback.state.turn.actionsPerformedThisTurn[0].timestamp = 4;
        } else {
          expectedRollback.state.eventLog[2].timestamp = 4;
          expectedRollback.state.eventLog[6].timestamp = 16;
          const moved = expectedRollback.state.eventLog[7];
          if (moved.type !== "CARD_TRASHED")
            throw new Error("experiment event shape changed");
          moved.payload.newCardInstanceId = "card_00000044";
          expectedRollback.state.executionContext.idCounter = 148;
          expectedRollback.state.players[0].trash[0].instanceId =
            "card_00000044";
          expectedRollback.state.turn.actionsPerformedThisTurn[1].timestamp = 13;
        }
        expect(actual).toEqual(expectedRollback);
        let closed = actual.state;
        for (let index = 0; closed.turn.battle && index < 2; index++) {
          const passed = oldPipeline.runPipeline(
            closed,
            { type: "PASS" },
            oldLoaded.cardDb,
            1
          );
          expect(passed.valid).toBe(true);
          closed = passed.state;
        }
        expect(closed.turn.battle).toBeNull();
        expect(
          closed.eventLog.filter((event) => event.type === "END_OF_BATTLE")
        ).toHaveLength(1);
        expect(
          closed.eventLog.some(
            (event) =>
              event.type === "CHARACTER_BATTLES" ||
              event.type === "DAMAGE_DEALT"
          )
        ).toBe(false);
      }
    });
  }
);
