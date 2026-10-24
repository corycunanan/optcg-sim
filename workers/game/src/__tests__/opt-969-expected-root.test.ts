import { readFileSync } from "node:fs";
import type { ProducerScenario } from "./native7-producer-support.js";
import { it, expect } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { runtime, memory, save, command } from "./native7-producer-support.js";
it("staged REST_DON then rested-filter DON accepts offered newly rested donor", async () => {
  const rt = await runtime();
  const r = rig();
  r.state.schemaVersion = 7;
  r.deck(0, 5);
  const ds = r.state.players[0].donCostArea;
  ds[1].state = "RESTED";
  const source = r.put("review-rest-prefix", 0, "CHARACTER", {
    schema: synSchema("review-rest-prefix", [
      {
        id: "activate",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        costs: [
          { type: "REST_DON", amount: 1 },
          { type: "DON_MINUS", amount: 1, filter: { is_rested: true } },
        ],
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ]),
  });
  r.state.prohibitions.push({
    id: "review-held",
    sourceCardInstanceId: source.instanceId,
    sourceEffectBlockId: "activate",
    prohibitionType: "CANNOT_REFRESH",
    scope: {},
    duration: { type: "SKIP_NEXT_REFRESH" },
    controller: 0,
    appliesTo: [ds[0].instanceId],
    usesRemaining: null,
  });
  let loaded = (await memory(rt, await save(rt, r.state, r.db)).repo.load())!;
  let s = command(rt, loaded.state, loaded.cardDb, {
    type: "ACTIVATE_EFFECT",
    cardInstanceId: source.instanceId,
    effectId: "activate",
  });
  loaded = (await memory(rt, await save(rt, s, r.db)).repo.load())!;
  const p = loaded.state.pendingPrompt!.options;
  expect(p.promptType).toBe("PLAYER_CHOICE");
  if (p.promptType !== "PLAYER_CHOICE") throw Error("not choice");
  const c = p.choices.find((c) => c.id.includes(ds[0].instanceId))!;
  expect(c).toBeTruthy();
  expect(
    loaded.state.effectStack.at(-1)?.costExpectedRoot?.players[0].donCostArea[0]
      .state
  ).toBe("ACTIVE");
  s = command(rt, loaded.state, loaded.cardDb, {
    type: "PLAYER_CHOICE",
    choiceId: c.id,
  });
  expect(s.pendingPrompt).toBeNull();
  expect(s.players[0].hand).toHaveLength(1);
});

import type { GameState, GameAction } from "../types.js";
import { withoutAssertedCostEvidence } from "./cost-expected-root-support.js";
async function offered(filter: boolean = false, pauses = 1) {
  const rt = await runtime();
  const r = rig();
  r.state.schemaVersion = 7;
  r.deck(0, 6);
  const ds = r.state.players[0].donCostArea;
  ds[1].state = "RESTED";
  const source = r.put("root-source", 0, "CHARACTER", {
    schema: synSchema("root-source", [
      {
        id: "activate",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        costs: [
          { type: "REST_DON", amount: 1 },
          ...Array.from({ length: pauses }, () => ({
            type: "DON_MINUS" as const,
            amount: 1,
            ...(filter ? { filter: { is_rested: true } } : {}),
          })),
        ],
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ]),
  });
  r.state.prohibitions.push({
    id: "held",
    sourceCardInstanceId: source.instanceId,
    sourceEffectBlockId: "activate",
    prohibitionType: "CANNOT_REFRESH",
    scope: {},
    duration: { type: "SKIP_NEXT_REFRESH" },
    controller: 0,
    appliesTo: [ds[0].instanceId],
    usesRemaining: null,
  });
  const state = command(rt, r.state, r.db, {
    type: "ACTIVATE_EFFECT",
    cardInstanceId: source.instanceId,
    effectId: "activate",
  });
  const p = state.pendingPrompt!.options;
  if (p.promptType !== "PLAYER_CHOICE") throw Error("missing DON offer");
  const choice = p.choices.find((c) => c.id.includes(ds[0].instanceId))!;
  return {
    rt,
    r,
    state,
    action: {
      type: "PLAYER_CHOICE",
      choiceId: choice.id,
      promptId: state.pendingPrompt!.promptId,
    } as GameAction,
    donor: ds[0].instanceId,
  };
}
function reply(
  rt: Awaited<ReturnType<typeof runtime>>,
  state: GameState,
  action: GameAction,
  db: ReturnType<typeof rig>["db"]
) {
  const routed = new rt.SessionCoordinator().executeAction(
    state,
    [],
    0,
    action,
    db
  );
  return routed.kind === "resume"
    ? rt.resumePromptLifecycle(routed.state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      })
    : { state: routed.state, responseRejected: routed.kind === "reject" };
}
for (const reload of [false, true])
  for (const mutation of [
    "absent",
    "moved",
    "state-still-eligible",
    "effect",
    "unrelated",
    "array-order",
  ] as const) {
    it(`rejects ${mutation} root drift ${reload ? "after reload" : "in memory"} without state/events`, async () => {
      const f = await offered();
      const state = reload
        ? (await memory(f.rt, await save(f.rt, f.state, f.r.db)).repo.load())!
            .state
        : f.state;
      const player = state.players[0];
      const donor = player.donCostArea.find((d) => d.instanceId === f.donor)!;
      if (mutation === "absent")
        player.donCostArea = player.donCostArea.filter((d) => d !== donor);
      if (mutation === "moved") {
        player.donCostArea = player.donCostArea.filter((d) => d !== donor);
        player.leader.attachedDon.push({
          ...donor,
          attachedTo: player.leader.instanceId,
        });
      }
      if (mutation === "state-still-eligible") donor.state = "RESTED";
      if (mutation === "effect") state.prohibitions[0].usesRemaining = 3;
      if (mutation === "unrelated") state.players[1].leader.state = "RESTED";
      if (mutation === "array-order") player.donCostArea.reverse();
      const before = structuredClone(state);
      const result = reply(f.rt, state, f.action, f.r.db);
      expect(result.responseRejected).toBe(true);
      expect(result.state).toEqual(before);
      expect(state).toEqual(before);
    });
  }
it("retains the known conservative rejection when old saved frame lacks evidence", async () => {
  const f = await offered(true);
  delete f.state.effectStack.at(-1)!.costExpectedRoot;
  const loaded = (await memory(
    f.rt,
    await save(f.rt, f.state, f.r.db)
  ).repo.load())!;
  const before = structuredClone(loaded.state);
  const result = reply(f.rt, loaded.state, f.action, loaded.cardDb);
  expect(result.responseRejected).toBe(true);
  expect(result.state).toEqual(before);
});
it("preserves object-key reorder and exact staged identity through two pauses", async () => {
  const f = await offered(false, 2);
  let state = f.state;
  withoutAssertedCostEvidence(state);
  state.players[0].leader = Object.fromEntries(
    Object.entries(state.players[0].leader).reverse()
  ) as (typeof state.players)[0]["leader"];
  state = command(f.rt, state, f.r.db, f.action);
  expect(state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  expect(
    state.players[0].donCostArea.some((d) => d.instanceId === f.donor)
  ).toBe(true); // still staged
  withoutAssertedCostEvidence(state);
  state = (await memory(f.rt, await save(f.rt, state, f.r.db)).repo.load())!
    .state;
  const p = state.pendingPrompt!.options;
  if (p.promptType !== "PLAYER_CHOICE") throw Error("no second pause");
  state = command(f.rt, state, f.r.db, {
    type: "PLAYER_CHOICE",
    choiceId: p.choices[0].id,
  });
  expect(state.pendingPrompt).toBeNull();
  expect(state.players[0].hand).toHaveLength(1);
  expect(
    state.players[0].donCostArea.some((d) => d.instanceId === f.donor)
  ).toBe(false);
  expect(state.eventLog.filter((e) => e.type === "CARD_DRAWN")).toHaveLength(1);
});
for (const field of [
  "players",
  "turn",
  "activeEffects",
  "prohibitions",
  "scheduledActions",
  "oneTimeModifiers",
  "triggerRegistry",
] as const)
  it(`strictly validates evidence ${field} in live and all undo ingress`, async () => {
    const f = await offered();
    const good = structuredClone(f.state);
    const bad = structuredClone(good);
    (
      bad.effectStack.at(-1)!.costExpectedRoot as unknown as Record<
        string,
        unknown
      >
    )[field] = null;
    expect(() => f.rt.convertPersistedGameState(bad, "state")).toThrow();
    const values = await save(f.rt, good, f.r.db);
    for (const embedded of [false, true]) {
      const stored = structuredClone(values);
      const undo = [...Array.from({ length: 11 }, () => good), bad];
      if (embedded) {
        (stored.session as Record<string, unknown>).undoHistory = undo;
        delete stored["session:undo-history"];
      } else stored["session:undo-history"] = undo;
      await expect(memory(f.rt, stored).repo.load()).rejects.toThrow();
    }
  });
it("preserves evidence on native7 live/undo save and bounds its serialized size", async () => {
  const f = await offered();
  const m = memory(f.rt);
  await m.repo.save({
    state: f.state,
    cardDb: f.r.db,
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
    undoHistory: [f.state],
  });
  const loaded = (await m.repo.load())!;
  expect(loaded.state.effectStack.at(-1)!.costExpectedRoot).toEqual(
    f.state.effectStack.at(-1)!.costExpectedRoot
  );
  expect(loaded.undoHistory[0].effectStack.at(-1)!.costExpectedRoot).toEqual(
    f.state.effectStack.at(-1)!.costExpectedRoot
  );
  const bytes = JSON.stringify(
    f.state.effectStack.at(-1)!.costExpectedRoot
  ).length;
  // Representative measured size: 11,210 evidence bytes / 36,943 state bytes.
  expect(bytes).toBeGreaterThan(1000);
  expect(bytes).toBeLessThan(JSON.stringify(f.state).length / 2);
});

for (const optional of [true, false])
  for (const accept of [false, true]) {
    if (!optional && !accept) continue;
    it(`${optional ? "optional" : "mandatory"} replacement ${accept ? "commits and aborts" : "declines then continues"} with evidence across child pauses`, async () => {
      const rt = await runtime();
      const r = rig();
      r.state.schemaVersion = 7;
      r.deck(0, 6);
      for (let n = 0; n < 3; n++) r.put(`replace-hand-${n}`, 0, "HAND");
      r.state.players[0].donCostArea[1].state = "RESTED";
      const source = r.put("root-replacement", 0, "CHARACTER", {
        schema: synSchema("root-replacement", [
          {
            id: "replace",
            category: "replacement",
            replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" },
            flags: { optional, once_per_turn: true },
            replacement_actions: [
              { type: "DRAW", params: { amount: 1 } },
              { type: "TRASH_FROM_HAND", params: { amount: 1 } },
            ],
          },
          {
            id: "activate",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            costs: [
              { type: "REST_DON", amount: 1 },
              { type: "TRASH_SELF" },
              { type: "DON_MINUS", amount: 1 },
            ],
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ]),
      });
      let state = command(rt, r.state, r.db, {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: source.instanceId,
        effectId: "activate",
      });
      withoutAssertedCostEvidence(state);
      state = (await memory(rt, await save(rt, state, r.db)).repo.load())!
        .state;
      if (optional)
        state = command(rt, state, r.db, {
          type: "PLAYER_CHOICE",
          choiceId: accept ? "accept" : "skip",
        });
      withoutAssertedCostEvidence(state);
      if (accept) {
        expect(state.players[0].hand).toHaveLength(4);
        expect(state.players[0].deck).toHaveLength(5);
        expect(
          state.effectStack.find((f) => f.kind === "COST")!.costExpectedRoot!
            .players[0].hand
        ).toHaveLength(4);
        // Root drift under a replacement child cannot be blessed by its reply.
        const bad = structuredClone(state);
        bad.players[1].leader.state = "RESTED";
        const p = bad.pendingPrompt!.options;
        if (p.promptType !== "SELECT_TARGET")
          throw Error("no replacement child");
        const a = {
          type: "SELECT_TARGET",
          selectedInstanceIds: p.validTargets.slice(0, p.countMin),
          promptId: bad.pendingPrompt!.promptId,
        } as GameAction;
        const before = structuredClone(bad);
        expect(reply(rt, bad, a, r.db).state).toEqual(before);
        state = (await memory(rt, await save(rt, state, r.db)).repo.load())!
          .state;
        state = command(rt, state, r.db, a);
        expect(
          state.players[0].characters.some(
            (c) => c?.instanceId === source.instanceId
          )
        ).toBe(true);
        expect(state.players[0].hand).toHaveLength(3);
        expect(state.players[0].deck).toHaveLength(5);
        expect(
          state.players[0].donCostArea.filter((d) => d.state === "RESTED")
        ).toHaveLength(1); // staged prefix abandoned
      } else {
        expect(state.players[0].hand).toHaveLength(3);
        expect(state.pendingPrompt!.options.promptType).toBe("PLAYER_CHOICE");
        const p = state.pendingPrompt!.options;
        if (p.promptType !== "PLAYER_CHOICE") throw Error("no DON offer");
        state = command(rt, state, r.db, {
          type: "PLAYER_CHOICE",
          choiceId: p.choices[0].id,
        });
        expect(
          state.players[0].characters.some(
            (c) => c?.instanceId === source.instanceId
          )
        ).toBe(false);
        expect(state.players[0].hand).toHaveLength(4);
      }
      expect(state.pendingPrompt).toBeNull();
      expect(state.effectStack).toHaveLength(0);
    });
  }

it("disconnect/reload/reconnect remains answerable and preserves presence after overlay", async () => {
  const f = await offered(true);
  const coordinator = new f.rt.SessionCoordinator();
  let state = coordinator.setPlayerPresence(f.state, 0, {
    connected: false,
    awayReason: "DISCONNECTED",
    rejoinDeadlineAt: 123456,
  });
  withoutAssertedCostEvidence(state);
  state = (await memory(f.rt, await save(f.rt, state, f.r.db)).repo.load())!
    .state;
  state = coordinator.setPlayerPresence(state, 0, {
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
  });
  withoutAssertedCostEvidence(state);
  state = command(f.rt, state, f.r.db, f.action);
  expect(state.pendingPrompt).toBeNull();
  expect(state.players[0].hand).toHaveLength(1);
  expect(state.players[0]).toMatchObject({
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
  });
});
it("presence cannot refresh evidence after gameplay drift", async () => {
  const f = await offered();
  const expected = structuredClone(
    f.state.effectStack.at(-1)!.costExpectedRoot
  );
  f.state.players[1].leader.state = "RESTED";
  const state = new f.rt.SessionCoordinator().setPlayerPresence(f.state, 0, {
    connected: false,
    awayReason: "DISCONNECTED",
    rejoinDeadlineAt: 123456,
  });
  expect(state.effectStack.at(-1)!.costExpectedRoot).toEqual(expected);
  const before = structuredClone(state);
  const result = reply(f.rt, state, f.action, f.r.db);
  expect(result.responseRejected).toBe(true);
  expect(result.state).toEqual(before);
});
it("rejects unknown executable evidence and evidence on a non-COST owner", async () => {
  const f = await offered();
  for (const mutate of [
    (s: GameState) => {
      s.effectStack.at(-1)!.costExpectedRoot!.scheduledActions.push({
        id: "bad",
        timing: "END_OF_THIS_TURN",
        action: { type: "UNKNOWN" },
        boundToInstanceId: null,
        sourceEffectId: "bad",
        controller: 0,
      } as never);
    },
    (s: GameState) => {
      s.effectStack.at(-1)!.costExpectedRoot!.turn = {
        ...s.effectStack.at(-1)!.costExpectedRoot!.turn,
        unknown: true,
      } as never;
    },
    (s: GameState) => {
      s.effectStack.at(-1)!.phase = "AWAITING_OPTIONAL_RESPONSE";
    },
    (s: GameState) => {
      s.schemaVersion = 6;
    },
  ]) {
    const bad = structuredClone(f.state);
    mutate(bad);
    expect(() => f.rt.convertPersistedGameState(bad, "state")).toThrow();
  }
});

for (const version of [undefined, 6] as const)
  it(`ordinary ${version ?? "default"} writer never emits evidence`, async () => {
    const rt = await runtime();
    const r = rig();
    r.state.schemaVersion = version;
    r.deck(0, 5);
    r.state.players[0].donCostArea[1].state = "RESTED";
    const source = r.put("ordinary-root", 0, "CHARACTER", {
      schema: synSchema("ordinary-root", [
        {
          id: "activate",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          costs: [{ type: "DON_MINUS", amount: 1 }],
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ]),
    });
    const state = command(rt, r.state, r.db, {
      type: "ACTIVATE_EFFECT",
      cardInstanceId: source.instanceId,
      effectId: "activate",
    });
    expect(
      state.effectStack.every((frame) => frame.costExpectedRoot === undefined)
    ).toBe(true);
    expect(
      (await memory(rt, await save(rt, state, r.db)).repo.load())!.state
        .schemaVersion
    ).toBe(6);
  });
for (const mutation of [
  "wrong-player",
  "stale-prompt",
  "foreign",
  "duplicate",
  "under",
  "over",
] as const)
  it(`new evidence preserves ${mutation} guard`, async () => {
    const f = await offered(true);
    f.state = (await memory(
      f.rt,
      await save(f.rt, f.state, f.r.db)
    ).repo.load())!.state;
    const before = structuredClone(f.state);
    let action = { ...f.action, promptId: f.state.pendingPrompt!.promptId };
    if (action.type !== "PLAYER_CHOICE") throw Error("missing choice");
    const ids = JSON.parse(
      action.choiceId.slice("don-return-ids:".length)
    ) as string[];
    if (mutation === "stale-prompt") action = { ...action, promptId: "old" };
    if (["foreign", "duplicate", "under", "over"].includes(mutation))
      action = {
        ...action,
        choiceId: `don-return-ids:${JSON.stringify(mutation === "foreign" ? ["foreign"] : mutation === "duplicate" ? [ids[0], ids[0]] : mutation === "under" ? [] : [...ids, "foreign"])}`,
      };
    const routed = new f.rt.SessionCoordinator().executeAction(
      f.state,
      [],
      mutation === "wrong-player" ? 1 : 0,
      action,
      f.r.db
    );
    const result =
      routed.kind === "resume"
        ? f.rt.resumePromptLifecycle(routed.state, action, f.r.db, {
            drainPregame: (s) => s,
            advanceStartOfTurn: (s) => s,
          })
        : { state: routed.state };
    expect(result.state).toEqual(before);
    expect(f.state).toEqual(before);
  });

it("historical COST owner stays evidence-free across replacement resuspension and reload", async () => {
  const rt = await runtime();
  const corpus = JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/opt-969-native7-producers/positive-ko-decline.json",
        import.meta.url
      ),
      "utf8"
    )
  ) as ProducerScenario;
  const loaded = (await memory(rt, corpus.steps[0].stored).repo.load())!;
  const owner = loaded.state.effectStack.at(-1)!;
  expect(owner.phase).toBe("AWAITING_COST_SELECTION");
  expect(owner.costExpectedRoot).toBeUndefined();
  const after = command(
    rt,
    loaded.state,
    loaded.cardDb,
    corpus.steps[1].action
  );
  expect(after.effectStack.at(-1)!.phase).toBe("AWAITING_OPTIONAL_RESPONSE");
  const preserved = after.effectStack.find((frame) => frame.id === owner.id)!;
  expect(preserved).toBeDefined();
  expect(preserved.costExpectedRoot).toBeUndefined();
  const persisted = (await memory(
    rt,
    await save(rt, after, loaded.cardDb)
  ).repo.load())!;
  expect(
    persisted.state.effectStack.find((frame) => frame.id === owner.id)!
      .costExpectedRoot
  ).toBeUndefined();
});
