import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import legacy from "./fixtures/opt-968-legacy-pauses.json";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { SessionRepository } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import type { GameAction, GameState } from "../types.js";
import type { Action } from "../engine/effect-types.js";

type Captured = { name: string; kind: "KO" | "RETURN_TO_HAND" | "SET_REST"; phase: "first" | "prefix" | "declined"; nested: boolean; stored: Record<string, unknown>; a: string; b: string; hand: string[] };
const inputs = legacy as unknown as { producer: string; cases: Captured[] };
const config = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
const services = { drainPregame: (state: GameState) => state, advanceStartOfTurn: (state: GameState) => state };

it("pins actual old-producer inputs and can recapture them through its immutable session writer", async () => {
  const root = process.env.OPT968_OLD_PRODUCER_ROOT;
  const output = process.env.OPT968_CAPTURE_LEGACY;
  if (!root || !output) { expect(inputs.producer).toBe("dc08a5ac953ba3e1b1bb5c151f2380c6b9b2cbeb"); expect(inputs.cases).toHaveLength(12); return; }
  const old = await import(`${root}/workers/game/src/__tests__/opt-960-rig.ts`) as { rig: typeof rig };
  const repository = await import(`${root}/workers/game/src/session/persistence.ts`) as { SessionRepository: typeof SessionRepository };
  const captured: Captured[] = [];
  for (const [kind, nested] of [["KO", false], ["KO", true], ["RETURN_TO_HAND", false], ["SET_REST", false]] as const) {
    const r: Rig = old.rig(); r.deck(0, 10); r.deck(1, 10);
    r.state.players[0].donCostArea = [0, 1, 2].map((i) => ({ instanceId: `old-don-${i}`, state: "ACTIVE", attachedTo: null }));
    const primary = kind === "KO" ? "WOULD_BE_KO" : kind === "SET_REST" ? "WOULD_BE_RESTED" : "WOULD_BE_REMOVED_FROM_FIELD";
    const make = (id: string, event: typeof primary | "WOULD_LEAVE_FIELD", actions: Action[], wildcard = false) => r.put(id, 0, "CHARACTER", {
      data: { power: wildcard ? 9000 : 5000, types: id.endsWith("B") ? ["Navy"] : [] },
      schema: synSchema(id, [{ id: "replace", category: "replacement", replaces: { event,
        ...(wildcard ? { target_filter: { controller: "SELF", card_type: "CHARACTER", traits: ["Navy"] } } : {}),
      }, flags: { optional: true }, replacement_actions: actions }]),
    });
    const pay: Action[] = [{ type: "REST_DON", params: { amount: 1 } }];
    const a = make("OPT968-OLD-A", primary, pay);
    const b = make("OPT968-OLD-B", kind === "SET_REST" ? primary : "WOULD_BE_REMOVED_FROM_FIELD", nested ? [{ type: "TRASH_FROM_HAND", params: { amount: 2 } }] : pay);
    make("OPT968-OLD-C", "WOULD_LEAVE_FIELD", pay, true);
    const hand = [0, 1, 2].map((i) => r.put(`OPT968-OLD-HAND-${i}`, 0, "HAND").instanceId);
    const eventSchema = synSchema("OPT968-OLD-EVENT", [{ id: "main", category: "activate", trigger: { keyword: "MAIN_EVENT" }, actions: [{ type: kind, target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true }, filter: { power_max: 6000 } } } as Action] }], "Event");
    const source = r.put("OPT968-OLD-EVENT", 1, "HAND", { schema: eventSchema, data: { type: "Event", cost: 0, power: null, effectText: "[Main] Resolve this test action." } });
    r.state.turn.activePlayerIndex = 1; r.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId }, 1);
    let firstPause: GameState | undefined;
    for (const phase of ["first", "prefix", "declined"] as const) {
      expect(r.promptType()).toBe("OPTIONAL_EFFECT");
      const storage = new MemorySessionStorage(); const repo = new repository.SessionRepository(storage, config);
      await repo.save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [r.state] });
      const loaded = (await repo.load())!; r.state = loaded.state;
      const batch = r.state.effectStack.find((frame) => frame.replacementBatch)!.replacementBatch!;
      expect(batch.events).toBeUndefined(); expect(batch.currentMatchIndex).toBe(phase === "first" ? 0 : 1);
      captured.push({ name: `${kind}-${nested ? "nested" : "don"}-${phase}`, kind, phase, nested, stored: Object.fromEntries(storage.data), a: a.instanceId, b: b.instanceId, hand });
      if (phase === "first") { firstPause = structuredClone(r.state); r.accept(); }
      if (phase === "prefix") { r.state = structuredClone(firstPause!); r.decline(); }
    }
  }
  writeFileSync(output, JSON.stringify({ producer: inputs.producer, synthetic: true, cases: captured }) + "\n");
});

describe("OPT-968 complete legacy families on v6 emission and rollback resume", () => {
  for (const input of inputs.cases) for (const mode of ["live", "undo"] as const) for (const accept of [true, false]) {
    it(`${input.name}/${mode}/${accept ? "accept" : "decline"}: preserves offer/prefix and resumes exact emitted bytes`, async () => {
      const readerRoot = process.env.OPT968_DEPLOYED_READER_ROOT;
      const readerRepo = readerRoot ? await import(`${readerRoot}/workers/game/src/session/persistence.ts`) as { SessionRepository: typeof SessionRepository } : { SessionRepository };
      const readerResume = readerRoot ? await import(`${readerRoot}/workers/game/src/session/prompt-lifecycle.ts`) as { resumePromptLifecycle: typeof resumePromptLifecycle } : { resumePromptLifecycle };
      const readerWriter = readerRoot ? await import(`${readerRoot}/workers/game/src/session/game-state-schema.ts`) as { toPersistedGameState: typeof toPersistedGameState } : { toPersistedGameState };
      const oldStorage = new MemorySessionStorage(); await oldStorage.put(structuredClone(input.stored));
      const oldLoaded = (await new SessionRepository(oldStorage, config).load())!;
      const starting = mode === "undo" ? oldLoaded.undoHistory[0] : oldLoaded.state;
      const originalBatch = starting.effectStack.find((frame) => frame.replacementBatch)!.replacementBatch!;
      const currentId = originalBatch.pendingMatches[originalBatch.currentMatchIndex].effectId;
      const output = new MemorySessionStorage();
      expect(originalBatch.events).toBeUndefined();
      const saved = await new SessionRepository(output, config).save({ ...oldLoaded, state: starting, undoHistory: [starting, ...oldLoaded.undoHistory] });
      const emitted = output.data.get("session") as { state: GameState };
      const family = input.kind === "KO" ? ["WOULD_BE_KO", "WOULD_BE_REMOVED_FROM_FIELD", "WOULD_LEAVE_FIELD"] : input.kind === "SET_REST" ? ["WOULD_BE_RESTED"] : ["WOULD_BE_REMOVED_FROM_FIELD", "WOULD_LEAVE_FIELD"];
      for (const state of [emitted.state, ...(output.data.get("session:undo-history") as GameState[])]) {
        expect(state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 6 });
        const batch = state.effectStack.find((frame) => frame.replacementBatch)!.replacementBatch!;
        expect(batch.events).toEqual(family); expect(batch.currentMatchIndex).toBe(originalBatch.currentMatchIndex);
        expect(batch.pendingMatches).toEqual(originalBatch.pendingMatches); expect(batch.protectedIds).toEqual(originalBatch.protectedIds);
      }
      // save() returns the authoritative runtime with any genuine prompt-ID
      // allocation, but does not inject serialized v6 event metadata into it.
      let loaded = saved;
      expect(loaded.state.effectStack.find((frame) => frame.replacementBatch)!.replacementBatch!.events).toBeUndefined();
      const untouched = loaded.state.effectStack.find((frame) => frame.replacementBatch)!.replacementBatch!;
      expect(untouched.currentMatchIndex).toBe(originalBatch.currentMatchIndex);
      expect(untouched.pendingMatches[untouched.currentMatchIndex].effectId).toBe(currentId);
      expect(loaded.state.activeEffects.find((effect) => effect.id === currentId)?.sourceCardInstanceId)
        .toBe(starting.activeEffects.find((effect) => effect.id === currentId)?.sourceCardInstanceId);
      const readerStorage = new MemorySessionStorage(); await readerStorage.put(Object.fromEntries(output.data));
      let rollback = (await new readerRepo.SessionRepository(readerStorage, config).load())!;
      const replies: GameAction[] = []; const pauses: Record<string, unknown>[] = [];
      let next: GameAction = { type: "PLAYER_CHOICE", choiceId: accept ? "accept" : "skip" };
      let sawLeave = false; let sawNested = false;
      for (let guard = 0; loaded.state.pendingPrompt && guard < 10; guard++) {
        pauses.push(Object.fromEntries(output.data)); replies.push(next);
        const current = loaded.state.effectStack.find((frame) => frame.replacementBatch)?.replacementBatch;
        if (current) {
          const effect = loaded.state.activeEffects.find((effect) => effect.id === current.pendingMatches[current.currentMatchIndex].effectId);
          if (effect?.sourceCardInstanceId.startsWith("OPT968-OLD-C")) sawLeave = true;
          if (input.phase !== "first") expect(effect?.sourceCardInstanceId).not.toBe(input.a);
        }
        const result = resumePromptLifecycle(loaded.state, next, loaded.cardDb, services);
        const replay = readerResume.resumePromptLifecycle(rollback.state, next, rollback.cardDb, services);
        expect(result.responseRejected).toBeFalsy(); expect(replay.responseRejected).toBeFalsy();
        await new SessionRepository(output, config).save({ ...loaded, state: result.state });
        const nextReader = new MemorySessionStorage();
        await new readerRepo.SessionRepository(nextReader, config).save({ ...rollback, state: replay.state });
        loaded = (await new SessionRepository(output, config).load())!;
        rollback = (await new readerRepo.SessionRepository(nextReader, config).load())!;
        expect(JSON.parse(JSON.stringify(toPersistedGameState(loaded.state)))).toEqual(JSON.parse(JSON.stringify(readerWriter.toPersistedGameState(rollback.state))));
        const prompt = loaded.state.pendingPrompt?.options;
        if (prompt?.promptType === "SELECT_TARGET") { sawNested = true; next = { type: "SELECT_TARGET", selectedInstanceIds: input.hand.slice(0, 2) }; }
        else next = { type: "PLAYER_CHOICE", choiceId: "skip" };
      }
      expect(loaded.state.pendingPrompt).toBeNull(); expect(loaded.state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 6 });
      if (input.phase !== "first") {
        if (input.kind !== "SET_REST") expect(loaded.state.players[0].characters.some((card) => card?.instanceId === input.a)).toBe(input.phase === "prefix");
        if (accept) {
          expect(loaded.state.players[0].characters.some((card) => card?.instanceId === input.b)).toBe(true);
          if (input.kind === "SET_REST") expect(loaded.state.players[0].characters.find((card) => card?.instanceId === input.b)?.state).toBe("ACTIVE");
          expect(loaded.state.players[0].donCostArea.filter((don) => don.state === "RESTED")).toHaveLength((input.phase === "prefix" ? 1 : 0) + (input.nested ? 0 : 1));
        }
        if (!accept && input.kind !== "SET_REST") expect(sawLeave).toBe(true);
        if (input.nested && accept) expect(sawNested).toBe(true);
      }
      if (!accept) {
        if (input.kind === "KO") expect(loaded.state.eventLog.filter((event) => event.type === "CARD_KO")).toHaveLength(input.phase === "prefix" ? 1 : 2);
        if (input.kind === "SET_REST") expect(sawLeave).toBe(false);
      }
      if (process.env.OPT968_CAPTURE_MIGRATION) writeFileSync(`${process.env.OPT968_CAPTURE_MIGRATION}/${input.name}-${mode}-${accept}.json`, JSON.stringify({ input: input.name, mode, accept, pauses, replies, expected: toPersistedGameState(loaded.state) }) + "\n");
      if (accept && input.phase === "declined" && input.kind === "KO") expect(loaded.state.eventLog.filter((event) => event.type === "CARD_KO")).toHaveLength(1);
    });
  }
});
