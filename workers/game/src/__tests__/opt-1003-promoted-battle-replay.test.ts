import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { SessionRepository } from "../session/persistence.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import type { GameAction, GameState } from "../types.js";
import manifest from "./fixtures/opt-1003-promoted-battles.manifest.json";
const bytes = readFileSync(
  new URL(
    "./fixtures/opt-1003-promoted-battles.synthetic.json.gz",
    import.meta.url
  )
);
const corpus: {
  producerCommit: string;
  provenance: string;
  traces: {
    name: string;
    index: number;
    initialStored: Record<string, unknown>;
    steps: { action: GameAction; stored: Record<string, unknown> }[];
    final: GameState;
    promptAllocations: number;
  }[];
} = JSON.parse(gunzipSync(bytes).toString());
const oldBytes = readFileSync(
  new URL("./fixtures/opt-966-final-writer-corpus.json.gz", import.meta.url)
);
const historical: Record<
  string,
  {
    cases: { index: number; stored: Record<string, unknown> }[];
    expected: GameState;
  }
> = JSON.parse(gunzipSync(oldBytes).toString());
const config = {
  nextJsUrl: "https://app.example.test",
  workerSecret: "secret",
};
function stateOf(values: Record<string, unknown>) {
  return (values.session as { state: GameState }).state;
}
function ownerContract(state: GameState) {
  expect(state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 6 });
  const owner = state.effectStack.find((frame) => frame.battleCompletion);
  if (owner) {
    expect(state.effectStack[0]).toBe(owner);
    expect(state.turn.battle).toBeNull();
    expect(
      state.eventLog.filter((e) => e.type === "BATTLE_RESOLVED")
    ).toHaveLength(0);
    expect(
      state.eventLog.filter((e) => e.type === "END_OF_BATTLE")
    ).toHaveLength(1);
    expect(owner.battleCompletion!.battleId).not.toBe("");
  }
}
for (const trace of corpus.traces)
  describe(`${trace.name}/start${trace.index}`, () => {
    for (const ingress of ["live", "undo", "embedded"] as const)
      it(`replays frozen785 already8/mode6 writer boundaries through ${ingress}`, async () => {
        const root = process.env.OPT1003_READER_ROOT;
        const rt = root
          ? {
              SessionRepository: (
                await import(`${root}/workers/game/src/session/persistence.ts`)
              ).SessionRepository as typeof SessionRepository,
              SessionCoordinator: (
                await import(`${root}/workers/game/src/session/coordinator.ts`)
              ).SessionCoordinator as typeof SessionCoordinator,
              resumePromptLifecycle: (
                await import(
                  `${root}/workers/game/src/session/prompt-lifecycle.ts`
                )
              ).resumePromptLifecycle as typeof resumePromptLifecycle,
            }
          : { SessionRepository, SessionCoordinator, resumePromptLifecycle };
        const old = historical[trace.name];
        const original = old.cases.find((c) => c.index === trace.index)!.stored;
        const startsBattle = stateOf(original).turn.battle !== null;
        const storage = new MemorySessionStorage();
        // Frozen785 output is already activated8/mode6 and must remain so.
        // Current source<=6 activation is tested separately; do not retag these bytes.
        await storage.put(
          structuredClone(trace.initialStored)
        );
        const repo = new rt.SessionRepository(storage, config);
        let loaded = (await repo.load())!;
        let promptAllocations = Number(
          root
            ? stateOf(original).pendingPrompt &&
                !stateOf(original).pendingPrompt!.promptId
            : loaded.state.pendingPrompt && !loaded.state.pendingPrompt.promptId
        );
        loaded = await repo.save({ ...loaded, undoHistory: [loaded.state] });
        loaded = await repo.save({ ...loaded, undoHistory: [loaded.state] });
        expect(Object.fromEntries(storage.data)).toEqual(trace.initialStored);
        for (const step of trace.steps) {
          const current = structuredClone(Object.fromEntries(storage.data));
          if (ingress === "embedded") {
            (current.session as { undoHistory?: unknown }).undoHistory =
              current["session:undo-history"];
            delete current["session:undo-history"];
          }
          const reloaded = new MemorySessionStorage();
          await reloaded.put(current);
          const repository = new rt.SessionRepository(reloaded, config);
          loaded = (await repository.load())!;
          if (ingress !== "live") loaded.state = loaded.undoHistory[0];
          ownerContract(loaded.state);
          const routed = new rt.SessionCoordinator().executeAction(
            loaded.state,
            [],
            loaded.state.pendingPrompt!.respondingPlayer,
            step.action,
            loaded.cardDb
          );
          expect(routed.kind).toBe("resume");
          const resumed = rt.resumePromptLifecycle(
            routed.state,
            step.action,
            loaded.cardDb,
            { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
          );
          expect(resumed.responseRejected).toBe(false);
          if (
            resumed.state.pendingPrompt &&
            !resumed.state.pendingPrompt.promptId
          )
            promptAllocations++;
          // Save-returned runtime, including its real allocator prompt ID, is the
          // next command's input. No identity or event normalization occurs.
          loaded = await repo.save({
            ...loaded,
            state: resumed.state,
            undoHistory: [resumed.state],
          });
          loaded = await repo.save({ ...loaded, undoHistory: [loaded.state] });
          expect(Object.fromEntries(storage.data)).toEqual(step.stored);
          expect(loaded.state.pendingPrompt).toEqual(
            stateOf(step.stored).pendingPrompt
          );
          ownerContract(loaded.state);
        }
        loaded = (await repo.load())!;
        expect(loaded.state).toEqual(trace.final);
        expect(loaded.state.effectStack).toHaveLength(0);
        expect(loaded.state.pendingPrompt).toBeNull();
        expect(loaded.state.status).toBe(old.expected.status);
        expect(loaded.state.winner).toBe(old.expected.winner);
        for (const player of [0, 1] as const) {
          expect(
            loaded.state.players[player].hand.map((c) => c.cardId)
          ).toEqual(old.expected.players[player].hand.map((c) => c.cardId));
          expect(
            loaded.state.players[player].characters.map((c) => c?.cardId)
          ).toEqual(
            old.expected.players[player].characters.map((c) => c?.cardId)
          );
        }
        // Independently account for every new ID: one completion owner plus each
        // genuinely new prompt ID, against the frozen historical final counter.
        expect(loaded.state.executionContext!.idCounter).toBe(
          old.expected.executionContext!.idCounter +
            Number(startsBattle) +
            promptAllocations
        );
        expect(promptAllocations).toBe(trace.promptAllocations);
        const events = loaded.state.eventLog;
        expect(events.filter((e) => e.type === "END_OF_BATTLE")).toHaveLength(
          1
        );
        if (startsBattle && loaded.state.status === "FINISHED") {
          expect(
            events.filter((e) => e.type === "BATTLE_RESOLVED")
          ).toHaveLength(0);
          expect(events.at(-1)?.type).toBe("GAME_OVER");
          expect(loaded.state.executionContext!.clockCounter).toBe(
            old.expected.executionContext!.clockCounter - 4
          );
        } else {
          expect(
            events.filter((e) => e.type === "BATTLE_RESOLVED")
          ).toHaveLength(1);
          expect(loaded.state.executionContext!.clockCounter).toBe(
            old.expected.executionContext!.clockCounter
          );
          if (startsBattle)
            expect(
              events.map((e) => e.type).lastIndexOf("CARD_DRAWN")
            ).toBeLessThan(
              events.findIndex((e) => e.type === "BATTLE_RESOLVED")
            );
        }
        if (!startsBattle) expect(events).toEqual(old.expected.eventLog); // Legacy EOB stays committed.
      });
  });
it("pins immutable writer source, raw input/output hashes and manifest-derived totals", () => {
  const sha = (data: Uint8Array) =>
    createHash("sha256").update(data).digest("hex");
  expect(manifest.producerCommit).toBe(
    "7ba54dfd70f06b59939fcc7e6def0c946f3a0130"
  );
  expect(corpus.producerCommit).toBe(manifest.producerCommit);
  expect(corpus.provenance).toBe("synthetic");
  expect(sha(bytes)).toBe(manifest.output.sha256);
  expect(sha(oldBytes)).toBe(manifest.input.sha256);
  expect(new Set(corpus.traces.map((t) => t.name)).size).toBe(
    manifest.families
  );
  expect(corpus.traces).toHaveLength(manifest.traces);
  expect(corpus.traces.reduce((n, t) => n + t.steps.length, 0)).toBe(
    manifest.transitions
  );
  expect(Object.keys(manifest.sourceHashes)).toContain(
    "scripts/capture-opt1003-promoted-battles.ts"
  );
});
