import { LegacyReaderRepository } from "./legacy-reader-repository.js";
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import type { GameAction, GameState } from "../types.js";

const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
const fixturePath = new URL("./fixtures/opt-968-thatch-corpus.json", import.meta.url);
type Capture = { stored: Record<string, unknown>; replies: GameAction[]; expected: unknown[] };
type Scenario = { name: string; cases: Capture[] };
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

function start(make: typeof rig, kind: string) {
  const r = make(); r.state.schemaVersion = 6; r.deck(0, 8); r.deck(1, 8);
  const thatch = r.put("OP08-045", 0, "CHARACTER", { data: { power: 6000 } });
  if (kind === "rayleigh") {
    const rayleigh = r.put("OP08-118", 1, "HAND", { data: { cost: 0, type: "Character" } });
    r.state.turn.activePlayerIndex = 1; r.act({ type: "PLAY_CARD", cardInstanceId: rayleigh.instanceId }, 1);
  } else {
    if (kind === "two-instances") r.put("OP08-045", 0, "CHARACTER");
    if (kind === "group-then-nested-payment") {
      r.put("OP17-043", 0, "CHARACTER");
      for (let i = 0; i < 3; i++) r.put(`OPT968-NESTED-HAND-${i}`, 0, "HAND");
    }
    if (kind === "declined-prefix") r.put("OPT968-OPTIONAL-PREFIX", 0, "CHARACTER", { schema: synSchema("OPT968-OPTIONAL-PREFIX", [{
      id: "prefix", category: "replacement", replaces: { event: "WOULD_BE_KO" },
      replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }], flags: { optional: true },
    }]) });
    if (kind === "nested-watch" || kind === "declined-prefix") {
      r.put("OPT968-TRASH-WATCH", 1, "CHARACTER", { schema: synSchema("OPT968-TRASH-WATCH", [{ id: "watch", category: "auto",
        trigger: { event: "ANY_CHARACTER_TRASHED" }, flags: { once_per_turn: true },
        actions: [{ type: "PLAYER_CHOICE", params: { labels: ["Draw 1", "Draw 2"], options: [
          [{ type: "DRAW", params: { amount: 1 } }], [{ type: "DRAW", params: { amount: 2 } }],
        ] } }] }]) });
    }
    const schema = synSchema("OPT968-THATCH-KO", [{ id: "main", category: "activate", trigger: { keyword: "MAIN_EVENT" },
      actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } }] }], "Event");
    const event = r.put("OPT968-THATCH-KO", 1, "HAND", { schema, data: { type: "Event", cost: 0, power: null, effectText: "[Main] K.O. opposing Characters." } });
    r.state.turn.activePlayerIndex = 1; r.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId }, 1);
  }
  return { r, thatch };
}
function reply(state: GameState, thatchId: string, kind: string, branch: string): GameAction {
  const prompt = state.pendingPrompt!;
  const p = prompt.options;
  if (p.promptType === "SELECT_TARGET") return { type: "SELECT_TARGET", selectedInstanceIds: p.validTargets.includes(thatchId)
    ? [thatchId] : p.validTargets.slice(0, p.countMin), promptId: prompt.promptId };
  if (p.promptType === "OPTIONAL_EFFECT") return { type: "PLAYER_CHOICE", choiceId: kind === "group-then-nested-payment" ? "accept" : "skip", promptId: prompt.promptId };
  if (p.promptType !== "PLAYER_CHOICE") throw new Error(`Unexpected ${p.promptType}`);
  const candidates = state.activeEffects.filter((e) => p.choices.some((c) => c.id === e.id));
  let chosen = candidates.find((e) => e.sourceEffectBlockId === branch && e.sourceCardInstanceId === thatchId);
  if (kind === "declined-prefix") chosen = candidates.find((e) => e.sourceCardInstanceId !== thatchId);
  return { type: "PLAYER_CHOICE", choiceId: chosen?.id ?? p.choices[0].id, promptId: prompt.promptId };
}

it.skipIf(!process.env.OPT968_CAPTURE_THATCH)("capture exact nondeployed writer emitted bytes, preserving authoritative allocated prompt IDs", async () => {
  const scenarios: Scenario[] = [];
  const oldRoot = process.env.OPT968_OLD_WRITER_ROOT!;
  const old = await import(`${oldRoot}/workers/game/src/__tests__/opt-960-rig.ts`) as { rig: typeof rig };
  const oldPersistence = await import(`${oldRoot}/workers/game/src/session/persistence.ts`) as { SessionRepository: typeof SessionRepository };
  for (const [name, kind, branch, legacy] of [
    ["authored-Rayleigh", "rayleigh", "replacement_ko", false],
    ["two-instances", "two-instances", "replacement_ko", false],
    ["group-then-nested-payment", "group-then-nested-payment", "replacement_ko", false],
    ["nested-trash-watcher", "nested-watch", "replacement_ko", false],
    ["declined-prefix-trash-watcher", "declined-prefix", "replacement_ko", false],
    ["old-offered-ko", "old-order", "replacement_ko", true],
    ["old-offered-removal", "old-order", "replacement_removal", true],
  ] as const) {
    const { r, thatch } = start(legacy ? old.rig : rig, kind);
    const source = { state: r.state, cardDb: r.db, mode: "PVP" as const, pregameMode: "PRIORITY_ROLL" as const, testPriorityRolls: null, undoHistory: [r.state] };
    const storage = new MemorySessionStorage();
    const ProducerRepository = legacy ? oldPersistence.SessionRepository : SessionRepository;
    const authoritative = await new ProducerRepository(storage, options).save(source);
    // Save-returned live state owns allocated IDs. Capture an actual restored-undo
    // checkpoint of that same authoritative pause, without editing any IDs.
    await new ProducerRepository(storage, options).save({ ...authoritative, undoHistory: [authoritative.state] });
    const initial = json(Object.fromEntries(storage.data));
    let loaded = (await new SessionRepository(storage, options).load())!;
    const pauses: Record<string, unknown>[] = []; const replies: GameAction[] = []; const expected: unknown[] = [];
    for (let step = 0; loaded.state.pendingPrompt && step < 12; step++) {
      const at = new MemorySessionStorage(); await new SessionRepository(at, options).save({ ...loaded, undoHistory: [loaded.state] });
      loaded = (await new SessionRepository(at, options).load())!;
      pauses.push(step === 0 ? initial : json(Object.fromEntries(at.data)));
      const action = reply(loaded.state, thatch.instanceId, kind, branch); replies.push(action);
      const result = resumePromptLifecycle(loaded.state, action, loaded.cardDb, { drainPregame: (s) => s, advanceStartOfTurn: (s) => s });
      expect(result.responseRejected).toBeFalsy();
      const saved = new MemorySessionStorage();
      await new SessionRepository(saved, options).save({ ...loaded, state: result.state });
      loaded = (await new SessionRepository(saved, options).load())!;
      expected.push(json(toPersistedGameState(loaded.state)));
    }
    expect(loaded.state.pendingPrompt).toBeNull(); expect(loaded.state.effectStack).toEqual([]);
    if (kind === "group-then-nested-payment") {
      const nested = pauses.map((stored) => (stored.session as { state: GameState }).state)
        .find((state) => state.pendingPrompt?.options.promptType === "SELECT_TARGET")!;
      expect(nested).toBeDefined();
      expect(nested.players[0].characters.some((card) => card?.instanceId === thatch.instanceId)).toBe(false);
      const batch = nested.effectStack.find((frame) => frame.replacementBatch)!.replacementBatch!;
      expect(batch.visitedEffectIds).toHaveLength(2);
      expect(new Set(batch.visitedEffectIds).size).toBe(2);
      expect(loaded.state.players[0].hand).toHaveLength(2);
    }
    expect(loaded.state.players[0].trash.filter((c) => c.cardId === "OP08-045")).toHaveLength(kind === "two-instances" ? 2 : 1);
    expect(loaded.state.eventLog.filter((e) => e.type === "CARD_KO" && e.payload.cardInstanceId === thatch.instanceId)).toHaveLength(0);
    scenarios.push({ name, cases: pauses.map((stored, i) => ({ stored, replies: replies.slice(i), expected: expected.slice(i) })) });
  }
  const producer = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  fs.writeFileSync(process.env.OPT968_CAPTURE_THATCH!, JSON.stringify({ producer, oldProducer: "085d64af31b730fe4db21c02a957e9f84f9309f8", provenance: "Synthetic actual SessionRepository emitted bytes; source-generated prompts/save-returned allocation; no ID setters or normalization. Old ordering inputs are unmodified old-producer emissions, suffix expectations use amended nondeployed producer.", scenarios }));
});

// Only the explicit generator bootstrap may run without its future artifact.
// Normal CI must fail on a missing, empty, or changed corpus.
const captureMode = !!process.env.OPT968_CAPTURE_THATCH;
const corpusBytes = captureMode ? "" : fs.readFileSync(fixturePath, "utf8");
const corpus = captureMode ? { scenarios: [] as Scenario[], producer: "" }
  : JSON.parse(corpusBytes) as { scenarios: Scenario[]; producer: string };
it.skipIf(captureMode)("pinned Thatch corpus is complete and unchanged", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("./fixtures/opt-968-thatch-corpus-manifest.json", import.meta.url), "utf8"));
  expect(createHash("sha256").update(corpusBytes).digest("hex")).toBe(manifest.sha256);
  expect(corpus.producer).toBe(manifest.producer);
  expect(corpus.scenarios.length).toBe(manifest.scenarioCount);
  const pauses = corpus.scenarios.flatMap((scenario) => scenario.cases);
  expect(pauses.length).toBe(manifest.startingPauseCount);
  expect(pauses.reduce((sum, captured) => sum + captured.replies.length, 0)).toBe(manifest.suffixReplyCount);
  expect(pauses.length * 2).toBe(manifest.replayExecutionCount);
  expect(manifest.scenarioCount).toBeGreaterThan(0);
  expect(manifest.startingPauseCount).toBeGreaterThan(0);
});
describe.skipIf(corpus.scenarios.length === 0)("OPT-968 alias-reader corpus: current parser/runtime with legacy repository boundary", () => {
  for (const scenario of corpus.scenarios) for (const [index, captured] of scenario.cases.entries()) for (const mode of ["live", "undo"] as const) {
    it(`${scenario.name} / pause ${index} / ${mode}: exact later states, prompts, events, allocator identities`, async () => {
      const storage = new MemorySessionStorage(); await storage.put(structuredClone(captured.stored));
      let loaded = (await new LegacyReaderRepository(storage, options).load())!;
      if (mode === "undo") loaded = { ...loaded, state: loaded.undoHistory[0] };
      for (const [i, action] of captured.replies.entries()) {
        const result = resumePromptLifecycle(loaded.state, action, loaded.cardDb, { drainPregame: (s) => s, advanceStartOfTurn: (s) => s });
        expect(result.responseRejected).toBeFalsy();
        const next = new MemorySessionStorage(); await new LegacyReaderRepository(next, options).save({ ...loaded, state: result.state });
        loaded = (await new LegacyReaderRepository(next, options).load())!;
        expect(json(toPersistedGameState(loaded.state))).toEqual(captured.expected[i]);
      }
      expect(loaded.state.pendingPrompt).toBeNull(); expect(loaded.state.effectStack).toEqual([]);
    });
  }
});
