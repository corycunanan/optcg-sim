/** Shared synthetic Counter producer through the selected actual public runtime.
 * Historical regeneration is byte-checked against the immutable f19 capture. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect } from "vitest";
import { createBattleReadyState, createTestCardDb, CARDS } from "./helpers.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runtime, save } from "./native7-producer-support.js";
export async function generateCounter(
  root?: string,
  version?: 7 | 8,
  mode: 6 | 7 | 8 = 7
) {
  if (root)
    expect(
      execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim()
    ).toBe("f19da7bb59aa4ef30185ed1d0f029a87c7fe3a3c");
  const producer = await runtime(root);
  const { runPipeline } = root
    ? ((await import(
        `${root}/workers/game/src/engine/pipeline.ts`
      )) as typeof import("../engine/pipeline.js"))
    : await import("../engine/pipeline.js");
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  if (version !== undefined) {
    state.schemaVersion = version;
    if (version === 8) state.costSemanticsVersion = mode;
    else delete state.costSemanticsVersion;
  } else {
    // Combined writer proof begins from real setup, before any first action.
    expect(state.schemaVersion).toBe(8);
    expect(state.costSemanticsVersion).toBe(8);
  }
  state.players[1].hand = [
    {
      cardId: "ST04-016",
      instanceId: "history-counter",
      owner: 1,
      controller: 1,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    },
  ];
  const canonical = readFileSync(
    resolve(__dirname, "../../../../docs/cards/ST-04.md"),
    "utf8"
  )
    .split("**ST04-016**")[1]
    .split("\n---")[0]
    .split("\n")
    .slice(1)
    .join("\n")
    .trim();
  db.set("ST04-016", {
    ...CARDS.VANILLA,
    id: "ST04-016",
    type: "Event",
    cost: 1,
    power: null,
    counter: null,
    effectText: canonical,
    effectSchema: getEffectSchema("ST04-016")!,
  });
  for (const [action, actor] of [
    [
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: state.players[0].leader.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
      },
      0,
    ],
    [{ type: "PASS" }, 0],
    [
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: "history-counter",
        counterTargetInstanceId: state.players[1].leader.instanceId,
      },
      1,
    ],
  ] as const) {
    const result = runPipeline(state, action, db, actor);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  expect(state.pendingPrompt?.options.promptType).toBe(
    mode === 7 ? "PLAYER_CHOICE" : "SELECT_TARGET"
  );
  const stored = await save(producer, state, db);
  if (root && process.env.OPT969_HISTORY_CAPTURE === "1") {
    const output = process.env.OPT969_HISTORY_CAPTURE_DIRECTORY;
    if (!output)
      throw Error(
        "Historical regeneration requires an isolated output directory"
      );
    mkdirSync(output, { recursive: true });
    writeFileSync(
      resolve(output, "counter.json"),
      JSON.stringify(stored, null, 2) + "\n"
    );
  }
  return stored;
}
