import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { createBattleReadyState, createTestCardDb, CARDS } from "./helpers.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { evaluateCondition } from "../engine/conditions.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { runtime, memory, command, save } from "./native7-producer-support.js";
import type { CardData, GameState } from "../types.js";

const fixturePath = resolve(
  __dirname,
  "fixtures/opt-969-history-reader/counter.json"
);
const producerRoot = process.env.OPT969_HISTORY_PRODUCER_ROOT;

async function counterPause() {
  if (!producerRoot)
    return JSON.parse(readFileSync(fixturePath, "utf8")) as Record<
      string,
      unknown
    >;
  return generateCounter(producerRoot, 7);
}

async function generateCounter(
  root?: string,
  version: 7 | 8 = 7,
  mode: 6 | 7 = 7
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
  state.schemaVersion = version;
  if (version === 8) state.costSemanticsVersion = mode;
  else delete state.costSemanticsVersion;
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
    mkdirSync(resolve(fixturePath, ".."), { recursive: true });
    writeFileSync(fixturePath, JSON.stringify(stored, null, 2) + "\n");
  }
  return stored;
}

function activated(state: GameState, db: Map<string, CardData>) {
  return evaluateCondition(
    state,
    {
      type: "ACTION_PERFORMED_THIS_TURN",
      controller: "SELF",
      action: "ACTIVATED_EVENT",
      filter: { base_cost_min: 1 },
    },
    {
      controller: 1,
      sourceCardInstanceId: state.players[1].leader.instanceId,
      cardDb: db,
    }
  );
}

it("actual f19 Counter publication survives repository, Coordinator and two reply/reload boundaries", async () => {
  await completeCounter(await counterPause());
});

async function completeCounter(
  stored: Record<string, unknown>,
  mode: 6 | 7 = 7,
  context = "live"
) {
  const reader = await runtime(process.env.OPT969_HISTORY_READER_ROOT);
  let first = (await memory(reader, stored).repo.load())!;
  if (context !== "live") {
    const m = memory(reader);
    // A legal undo-capable live wrapper restores the exact captured pending
    // frame; this does not claim that Counter play itself is undoable.
    const live = {
      ...first.state,
      pendingPrompt: null,
      effectStack: [],
      turn: { ...first.state.turn, battle: null, battleSubPhase: null },
    };
    await m.repo.save({
      ...first,
      state: live,
      undoHistory: context.endsWith("first")
        ? [first.state]
        : [live, first.state],
    });
    if (context.startsWith("embedded")) {
      (m.values.session as { undoHistory?: unknown }).undoHistory =
        m.values["session:undo-history"];
      delete m.values["session:undo-history"];
    }
    first = (await m.repo.load())!;
    const undone = new reader.SessionCoordinator().executeAction(
      first.state,
      first.undoHistory,
      first.state.turn.activePlayerIndex,
      { type: "UNDO" },
      first.cardDb
    );
    expect(undone.kind).toBe("undo");
    first.state = undone.state;
  }
  const history = structuredClone(first.state.turn.actionsPerformedThisTurn);
  expect(
    history.filter((a) => a.actionType === "USE_COUNTER_EVENT")
  ).toHaveLength(1);
  expect(activated(first.state, first.cardDb)).toBe(true);
  const donId = first.state.players[1].donCostArea.find(
    (d) => d.state === "ACTIVE"
  )!.instanceId;
  const originalDeck = first.state.players[1].donDeck.length;
  const next =
    mode === 7
      ? command(reader, first.state, first.cardDb, {
          type: "PLAYER_CHOICE",
          choiceId: `don-return-ids:${JSON.stringify([donId])}`,
        })
      : first.state;
  expect(next.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  stored = await save(reader, next, first.cardDb);
  const reloaded = (await memory(reader, stored).repo.load())!;
  const leaderId = reloaded.state.players[1].leader.instanceId;
  const done = command(reader, reloaded.state, reloaded.cardDb, {
    type: "SELECT_TARGET",
    selectedInstanceIds: [leaderId],
  });
  expect(done.pendingPrompt).toBeNull();
  expect(done.effectStack).toEqual([]);
  expect(done.schemaVersion).toBe(first.state.schemaVersion);
  expect(done.costSemanticsVersion).toBe(first.state.costSemanticsVersion);
  expect(done.turn.actionsPerformedThisTurn).toEqual(history);
  expect(activated(done, reloaded.cardDb)).toBe(true);
  expect(done.players[1].donCostArea).toEqual(
    first.state.players[1].donCostArea.filter(
      (d) => mode === 6 || d.instanceId !== donId
    )
  );
  expect(done.eventLog.filter((e) => e.type === "DON_DETACHED")).toHaveLength(
    1
  );
  expect(
    done.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
  ).toHaveLength(1);
  expect(done.eventLog.filter((e) => e.type === "COUNTER_USED")).toHaveLength(
    1
  );
  expect(done.players[1].donDeck).toHaveLength(
    originalDeck + (mode === 7 ? 1 : 0)
  );
  if (mode === 7)
    expect(
      done.players[1].donDeck.filter((d) => d.instanceId === donId)
    ).toHaveLength(1);
  expect(
    done.players[1].trash.filter((c) => c.cardId === "ST04-016")
  ).toHaveLength(1);
  expect(
    getEffectivePower(
      done.players[1].leader,
      reloaded.cardDb.get(done.players[1].leader.cardId)!,
      done,
      reloaded.cardDb
    )
  ).toBe(9000);
}

it("Counter staged-entry history repair never blesses stale live history or resources", async () => {
  const rt = await runtime();
  const loaded = (await memory(rt, await counterPause()).repo.load())!;
  const donor = loaded.state.players[1].donCostArea.find(
    (d) => d.state === "ACTIVE"
  )!.instanceId;
  for (const field of ["history", "resources"] as const) {
    const stale = structuredClone(loaded.state);
    if (field === "history")
      stale.turn.actionsPerformedThisTurn.push({
        actionType: "PASS",
        timestamp: 999,
      });
    else
      stale.players[1].donCostArea = stale.players[1].donCostArea.filter(
        (d) => d.instanceId !== donor
      );
    const before = structuredClone(stale);
    const result = rt.resumePromptLifecycle(
      stale,
      {
        type: "PLAYER_CHOICE",
        choiceId: `don-return-ids:${JSON.stringify([donor])}`,
      },
      loaded.cardDb,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
    );
    expect(result.responseRejected).toBe(true);
    expect(result.state).toEqual(before);
    expect(stale).toEqual(before);
  }
});

it("ordinary setup and Repository writes use schema8 with legacy cost mode6", async () => {
  const rt = await runtime();
  const db = createTestCardDb();
  const state = createBattleReadyState(db);
  expect(state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 6 });
  const loaded = (await memory(rt, await save(rt, state, db)).repo.load())!;
  expect(loaded.state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 6 });
});

for (const context of [
  "undo-first",
  "undo-later",
  "embedded-first",
  "embedded-later",
]) {
  it(`actual f19 Counter history survives ${context} restoration and both replies`, async () => {
    await completeCounter(await counterPause(), 7, context);
  });
}

for (const [version, mode] of [
  [7, 7],
  [8, 7],
  [8, 6],
] as const) {
  it(`explicit native${version}/mode${mode} public pipeline retains Counter history`, async () => {
    await completeCounter(
      await generateCounter(undefined, version, mode),
      mode
    );
  });
}
