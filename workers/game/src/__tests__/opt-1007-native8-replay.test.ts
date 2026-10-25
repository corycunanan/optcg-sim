/** Synthetic isolated-writer captures through the actual session storage/router. */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ABORT_TRASH_STEP, assertStoredEnvelope } from "./opt-1006-envelope-expectations.js";
import { command, memory, runtime } from "./native7-producer-support.js";
import { computeExpiry } from "../engine/effect-resolver/action-utils.js";
import { executePass } from "../engine/battle.js";
import { continuePipelineFromExecution } from "../engine/pipeline.js";
import type { GameAction, GameState, CardData } from "../types.js";

const directory = fileURLToPath(
  new URL("./fixtures/opt-1007-native8/", import.meta.url)
);
interface Corpus {
  id: string;
  family: string;
  mode: 6 | 7;
  disposition: "completed" | "legacy-cost-debt";
  sourceId: string;
  targetId: string;
  victimId: string;
  initial: Record<string, unknown>;
  steps: {
    action: GameAction;
    actor: 0 | 1;
    stored: Record<string, unknown>;
  }[];
}
const files = readdirSync(directory).filter(
  (f) => f.endsWith(".json") && f !== "manifest.json"
);
const corpusOf = (file: string) =>
  JSON.parse(readFileSync(`${directory}/${file}`, "utf8")) as Corpus;

function assertBoundary(state: GameState, corpus: Corpus, version: 8 | 9 = 8) {
  expect(state.schemaVersion).toBe(version);
  expect(state.costSemanticsVersion).toBe(corpus.mode);
  const owner = state.effectStack.find((frame) => frame.battleCompletion);
  if (owner) {
    expect(state.effectStack[0]).toBe(owner);
    expect(state.turn.battle).toBeNull();
    expect(state.turn.battleSubPhase).toBeNull();
    expect(
      state.eventLog.filter((e) => e.type === "END_OF_BATTLE")
    ).toHaveLength(1);
    expect(
      state.eventLog.filter((e) => e.type === "BATTLE_RESOLVED")
    ).toHaveLength(0);
    expect(computeExpiry({ type: "THIS_BATTLE" }, state, 0)).toEqual({
      wave: "END_OF_BATTLE",
      battleId: owner.battleCompletion!.battleId,
    });
  }
  for (const frame of state.effectStack)
    if (frame.costExpectedRoot) {
      expect(corpus.mode).toBe(7);
      const expected = {
        players: state.players,
        turn: state.turn,
        activeEffects: state.activeEffects,
        prohibitions: state.prohibitions,
        scheduledActions: state.scheduledActions,
        oneTimeModifiers: state.oneTimeModifiers,
        triggerRegistry: state.triggerRegistry,
      };
      expect(frame.costExpectedRoot).toEqual(expected);
    }
}

function assertCompletion(state: GameState, corpus: Corpus, version: 8 | 9 = 8) {
  assertBoundary(state, corpus, version);
  const count = (type: string) =>
    state.eventLog.filter((e) => e.type === type).length;
  const onField = (id: string) =>
    state.players.some(
      (p) =>
        p.leader.instanceId === id ||
        p.characters.some((c) => c?.instanceId === id)
    );
  if (corpus.disposition === "legacy-cost-debt") {
    expect(state.status).toBe("IN_PROGRESS");
    expect(state.pendingPrompt).toBeNull();
    expect(state.effectStack.at(-1)?.costReplacementChecked).toBe(true);
    expect(state.effectStack.at(-1)?.costReplacementResolution).toBeUndefined();
    expect(state.players[0].hand).toHaveLength(1);
    expect(count("BATTLE_RESOLVED")).toBe(0);
    return;
  }
  expect(state.pendingPrompt).toBeNull();
  expect(state.effectStack).toHaveLength(0);
  expect(state.turn.battle).toBeNull();
  if (corpus.family === "terminal" || corpus.family === "stack-exhaustion") {
    expect(state.status).toBe("FINISHED");
    expect(count("BATTLE_RESOLVED")).toBe(0);
    expect(state.eventLog.at(-1)?.type).toBe("GAME_OVER");
    expect(count("GAME_OVER")).toBe(1);
    if (corpus.family === "terminal") {
      expect(state.winner).toBe(0);
      expect(
        state.eventLog.findIndex((e) => e.type === "CARD_DRAWN")
      ).toBeLessThan(state.eventLog.findIndex((e) => e.type === "GAME_OVER"));
    } else expect(state.engineOutcome?.type).toBe("ENGINE_LIMIT");
    return;
  }
  expect(state.status).toBe("IN_PROGRESS");
  expect(count("END_OF_BATTLE")).toBe(1);
  expect(count("BATTLE_RESOLVED")).toBe(1);
  expect(
    state.activeEffects.filter((e) => e.expiresAt.wave === "END_OF_BATTLE")
  ).toHaveLength(0);
  switch (corpus.family) {
    case "protected":
      expect(onField(corpus.sourceId)).toBe(true);
      expect(onField(corpus.targetId)).toBe(true);
      expect(count("CARD_KO")).toBe(0);
      expect(state.prohibitions).toHaveLength(0);
      break;
    case "character":
    case "replacement-decline":
      expect(onField(corpus.targetId)).toBe(false);
      expect(count("CARD_KO")).toBe(1);
      expect(state.players[0].hand).toHaveLength(1);
      break;
    case "replacement-accept":
      expect(onField(corpus.targetId)).toBe(true);
      expect(count("CARD_KO")).toBe(0);
      expect(state.players[1].life).toHaveLength(3);
      expect(state.players[0].hand).toHaveLength(1);
      break;
    case "nested":
    case "source-leaves":
      expect(onField(corpus.victimId)).toBe(false);
      expect(onField(corpus.sourceId)).toBe(corpus.family === "nested");
      expect(state.players[1].hand).toHaveLength(1);
      expect(
        state.eventLog.findIndex((e) => e.type === "CARD_DRAWN")
      ).toBeLessThan(
        state.eventLog.findIndex((e) => e.type === "BATTLE_RESOLVED")
      );
      break;
    case "abort-attack":
    case "abort-block":
    case "abort-counter":
      expect(count("BATTLE_ABORTED")).toBe(1);
      expect(count("DAMAGE_DEALT")).toBe(0);
      expect(
        state.eventLog.find((e) => e.type === "END_OF_BATTLE")?.payload.aborted
      ).toBe(true);
      expect(state.players[1].life).toHaveLength(4);
      expect(state.players[0].hand).toHaveLength(1);
      break;
    case "leader":
      expect(state.players[1].life).toHaveLength(3);
      expect(state.players[1].hand).toHaveLength(1);
      break;
    case "life-trigger":
      expect(state.players[1].life).toHaveLength(3);
      expect(
        state.players[1].characters.filter((c) => c?.cardId === "ST01-002")
      ).toHaveLength(1);
      expect(state.players[0].hand).toHaveLength(1);
      break;
    case "cost":
      expect(state.players[0].donCostArea).toHaveLength(7);
      expect(state.players[0].hand).toHaveLength(1);
      break;
    case "cost-replacement":
      // Existing Decision10: the substitute commits; earlier staged costs
      // roll back, DON suffix and post-colon DRAW do not execute.
      expect(state.players[0].donCostArea).toHaveLength(8);
      expect(state.players[0].hand).toHaveLength(1);
      expect(
        onField(
          state.players[0].characters.find(
            (c) => c?.cardId === "EOB-cost-replacement"
          )!.instanceId
        )
      ).toBe(true);
      break;
    case "power-condition":
      expect(state.players[0].hand).toHaveLength(1);
      break;
    case "both-players": {
      const draws = state.eventLog.filter(
        (e) => e.type === "DRAW_OUTSIDE_DRAW_PHASE"
      );
      expect(draws.map((e) => e.playerIndex)).toEqual([0, 1]);
      break;
    }
    default:
      throw Error(`Missing independent oracle for ${corpus.family}`);
  }
}

async function saveBoth(
  rt: Awaited<ReturnType<typeof runtime>>,
  state: GameState,
  cardDb: Map<string, CardData>
) {
  const m = memory(rt);
  const saved = await m.repo.save({
    state,
    cardDb,
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
    undoHistory: [],
  });
  await m.repo.save({ ...saved, undoHistory: [saved.state] });
  // The fixture medium is JSON: omit only undefined object properties, exactly
  // as the producer's JSON encoding does. IDs, counters and arrays are exact.
  return JSON.parse(JSON.stringify(m.values)) as Record<string, unknown>;
}

describe.each(files)("native8 isolated writer %s", (file) => {
  it.each(["live", "undo", "embedded-undo"])(
    "resumes every starting/later boundary through %s",
    async (location) => {
      const floor = await runtime(process.env.OPT1006_WRITER_FLOOR_ROOT);
      // With the env supplied, retain the original exact8 reader replay as
      // well as current-writer capability expectations. Default CI is self-runtime.
      for (const branch of ["writer", ...(process.env.OPT1006_WRITER_FLOOR_ROOT ? ["deployed-reader"] : [])]) {
      const rt = branch === "writer" ? await runtime() : floor;
      const corpus = corpusOf(file);
      const starts = [
        corpus.initial,
        ...corpus.steps.map((step) => step.stored),
      ];
      for (let start = 0; start < starts.length; start++) {
        let loaded = (await memory(rt, starts[start]).repo.load())!;
        if (location !== "live") {
          const baseline = (await memory(
            rt,
            corpusOf("leader-mode6.json").initial
          ).repo.load())!;
          const m = memory(rt);
          await m.repo.save({
            ...baseline,
            cardDb: loaded.cardDb,
            undoHistory: [loaded.state],
          });
          if (location === "embedded-undo") {
            (m.values.session as { undoHistory?: unknown }).undoHistory =
              m.values["session:undo-history"];
            delete m.values["session:undo-history"];
          }
          const restore = (await m.repo.load())!;
          const undone = new rt.SessionCoordinator().executeAction(
            restore.state,
            restore.undoHistory,
            0,
            { type: "UNDO" },
            restore.cardDb
          );
          expect(undone.kind).toBe("undo");
          loaded = { ...loaded, state: undone.state };
        }
        assertBoundary(loaded.state, corpus);
        let version: 8 | 9 = 8;
        let rollback: typeof loaded | undefined;
        const trashStep = ABORT_TRASH_STEP[corpus.family];
        for (const [suffixIndex, step] of corpus.steps.slice(start).entries()) {
          let next: GameState;
          if (corpus.family === "stack-exhaustion") {
            const executed = executePass(loaded.state, loaded.cardDb);
            next = continuePipelineFromExecution(
              executed.state,
              executed,
              loaded.cardDb,
              step.actor
            ).state;
          } else
            next = command(
              rt,
              loaded.state,
              loaded.cardDb,
              step.action,
              step.actor
            );
          const stored = await saveBoth(rt, next, loaded.cardDb);
          // Only replays that actually execute this captured Character-trash
          // selection promote. Starting after historical movement remains8.
          if (branch === "writer" && trashStep !== undefined && start <= trashStep && start + suffixIndex >= trashStep) version = 9;
          assertStoredEnvelope(stored, step.stored, version);
          if (version === 9) {
            if (rollback) {
              const floorNext = command(floor, rollback.state, rollback.cardDb, step.action, step.actor);
              expect(await saveBoth(floor, floorNext, rollback.cardDb)).toEqual(stored);
            }
            rollback = (await memory(floor, stored).repo.load())!;
          }
          loaded = (await memory(rt, stored).repo.load())!;
          assertBoundary(loaded.state, corpus, version);
        }
        assertCompletion(loaded.state, corpus, version);
      }
      }
    }
  );
});

it("pins the actual producer/generator and derives corpus coverage from immutable payloads", async () => {
  const { createHash } = await import("node:crypto");
  const manifest = JSON.parse(
    readFileSync(`${directory}/manifest.json`, "utf8")
  ) as {
    scenarioCount: number;
    completedScenarios: number;
    diagnosticLegacyDebtScenarios: number;
    actionTransitions: number;
    startingBoundariesIncludingFinal: number;
    completionOwnerBoundaries: number;
    files: Record<string, { sha256: string; bytes: number }>;
  };
  for (const [file, entry] of Object.entries(manifest.files)) {
    const bytes = readFileSync(`${directory}/${file}`);
    expect(bytes.byteLength, file).toBe(entry.bytes);
    expect(createHash("sha256").update(bytes).digest("hex"), file).toBe(
      entry.sha256
    );
  }
  const scenarios = files.map(corpusOf);
  expect(manifest.scenarioCount).toBe(scenarios.length);
  expect(manifest.completedScenarios).toBe(
    scenarios.filter((c) => c.disposition === "completed").length
  );
  expect(manifest.diagnosticLegacyDebtScenarios).toBe(
    scenarios.filter((c) => c.disposition === "legacy-cost-debt").length
  );
  expect(manifest.actionTransitions).toBe(
    scenarios.reduce((n, c) => n + c.steps.length, 0)
  );
  expect(manifest.startingBoundariesIncludingFinal).toBe(
    scenarios.reduce((n, c) => n + 1 + c.steps.length, 0)
  );
  expect(manifest.completionOwnerBoundaries).toBe(
    scenarios.reduce(
      (n, c) =>
        n +
        c.steps.filter((step) => {
          const state = (step.stored.session as { state: GameState }).state;
          return state.effectStack.some((frame) => frame.battleCompletion);
        }).length,
      0
    )
  );
});

it("rejects native7 COST evidence under mode6 in live and undo without inferring provenance", async () => {
  const rt = await runtime();
  const original = corpusOf("cost-mode7.json").steps.find((step) =>
    (step.stored.session as { state: GameState }).state.effectStack.some(
      (frame) => frame.costExpectedRoot
    )
  )!.stored;
  for (const location of ["live", "undo"]) {
    const stored = structuredClone(original);
    const state =
      location === "live"
        ? (stored.session as { state: GameState }).state
        : (stored["session:undo-history"] as GameState[])[0];
    state.costSemanticsVersion = 6;
    await expect(memory(rt, stored).repo.load()).rejects.toThrow(
      /COST outcome or DON identity picker requiring schemaVersion 7/
    );
  }
});

it("a completion boundary can never own a player prompt", async () => {
  const rt = await runtime();
  const stored = structuredClone(
    corpusOf("protected-mode6.json").steps.find((step) =>
      (step.stored.session as { state: GameState }).state.effectStack.some(
        (frame) => frame.battleCompletion
      )
    )!.stored
  );
  const state = (stored.session as { state: GameState }).state;
  state.pendingPrompt!.resumeContext = state.effectStack[0].id;
  await expect(memory(rt, stored).repo.load()).rejects.toThrow(
    /BATTLE_COMPLETION frame that cannot own a prompt/
  );
});
