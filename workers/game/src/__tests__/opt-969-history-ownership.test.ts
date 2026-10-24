import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { runtime, command } from "./native7-producer-support.js";
import {
  applyCostTransactionState,
  captureCostExpectedRoot,
  enterCostTransactionState,
  publishCostOwnerRoots,
} from "../engine/effect-resolver/cost/transaction.js";

async function ownerFixture() {
  const rt = await runtime();
  const r = rig();
  r.state.schemaVersion = 7;
  r.deck(0, 5);
  r.state.turn.actionsPerformedThisTurn = [
    { actionType: "PASS", timestamp: 699 },
  ];
  const source = r.put("history-owner", 0, "CHARACTER", {
    schema: synSchema("history-owner", [
      {
        id: "activate",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        costs: [
          { type: "REST_DON", amount: 1 },
          { type: "DON_MINUS", amount: 1 },
        ],
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ]),
  });
  const state = command(rt, r.state, r.db, {
    type: "ACTIVATE_EFFECT",
    cardInstanceId: source.instanceId,
    effectId: "activate",
  });
  const owner = state.effectStack.find(
    (f) => f.costExpectedRoot && f.costTransactionState
  )!;
  expect(owner).toBeTruthy();
  return { state, owner };
}
const published = { actionType: "PASS" as const, timestamp: 700 };
const staged = { actionType: "PASS" as const, timestamp: 701 };

for (const longer of ["live", "staged"] as const) {
  it(`staged entry preserves exact ${longer} history suffix and staged resources`, async () => {
    const { state, owner } = await ownerFixture();
    const snapshot = owner.costTransactionState!;
    if (longer === "live")
      state.turn = {
        ...state.turn,
        actionsPerformedThisTurn: [
          ...state.turn.actionsPerformedThisTurn,
          published,
        ],
      };
    else
      snapshot.turn = {
        ...snapshot.turn,
        actionsPerformedThisTurn: [
          ...snapshot.turn.actionsPerformedThisTurn,
          staged,
        ],
      };
    owner.costExpectedRoot = captureCostExpectedRoot(state);
    const expected =
      longer === "live"
        ? state.turn.actionsPerformedThisTurn
        : snapshot.turn.actionsPerformedThisTurn;
    const entered = enterCostTransactionState(state, owner)!;
    expect(entered.turn.actionsPerformedThisTurn).toEqual(expected);
    expect(entered.players).toEqual(snapshot.players);
    expect(entered.turn.oncePerTurnUsed).toEqual(snapshot.turn.oncePerTurnUsed);
    // Rollback remains byte-exact even when staged entry used the longer list.
    const rolledBack = applyCostTransactionState(
      entered,
      captureCostExpectedRoot(state)
    );
    expect(rolledBack.turn.actionsPerformedThisTurn).toEqual(
      state.turn.actionsPerformedThisTurn
    );
    expect(rolledBack.players).toEqual(state.players);
  });
}

it("publication carries the proven B→L suffix after legitimate staged history and is idempotent", async () => {
  const { state, owner } = await ownerFixture();
  const baseline = structuredClone(state.turn.actionsPerformedThisTurn);
  owner.costTransactionState!.turn = {
    ...owner.costTransactionState!.turn,
    actionsPerformedThisTurn: [...baseline, staged],
  };
  state.turn = {
    ...state.turn,
    actionsPerformedThisTurn: [...baseline, published],
  };
  const result = publishCostOwnerRoots(state)!;
  const next = result.effectStack.find((f) => f.id === owner.id)!;
  expect(next.costTransactionState!.turn.actionsPerformedThisTurn).toEqual([
    ...baseline,
    published,
    staged,
  ]);
  expect(next.costTransactionState!.players).toEqual(
    owner.costTransactionState!.players
  );
  expect(publishCostOwnerRoots(result)).toEqual(result);
  const secondRecord = { actionType: "PASS" as const, timestamp: 702 };
  const second = publishCostOwnerRoots({
    ...result,
    turn: {
      ...result.turn,
      actionsPerformedThisTurn: [
        ...result.turn.actionsPerformedThisTurn,
        secondRecord,
      ],
    },
  })!;
  expect(
    second.effectStack.find((f) => f.id === owner.id)!.costTransactionState!
      .turn.actionsPerformedThisTurn
  ).toEqual([...baseline, published, secondRecord, staged]);
  const rollback = applyCostTransactionState(
    enterCostTransactionState(result, next)!,
    captureCostExpectedRoot(state)
  );
  expect(rollback.turn.actionsPerformedThisTurn).toEqual([
    ...baseline,
    published,
  ]);
});

it("publication cannot refresh an owner with missing staged evidence", async () => {
  const { state, owner } = await ownerFixture();
  delete owner.costTransactionState;
  const before = structuredClone(state);
  expect(publishCostOwnerRoots(state)).toBeUndefined();
  expect(state).toEqual(before);
});

it("ambiguous historical divergence is rejected without mutation and absent evidence is never invented", async () => {
  const { state, owner } = await ownerFixture();
  owner.costTransactionState!.turn = {
    ...owner.costTransactionState!.turn,
    actionsPerformedThisTurn: [staged],
  };
  const before = structuredClone(state);
  expect(enterCostTransactionState(state, owner)).toBeUndefined();
  expect(publishCostOwnerRoots(state)).toBeUndefined();
  expect(state).toEqual(before);
  delete owner.costExpectedRoot;
  expect(enterCostTransactionState(state, owner)).toEqual(
    applyCostTransactionState(state, owner.costTransactionState!)
  );
  expect(
    publishCostOwnerRoots(state)!.effectStack.find((f) => f.id === owner.id)!
      .costExpectedRoot
  ).toBeUndefined();
});

for (const version of [6, 8] as const) {
  it(`legacy cost capability ${version} preserves exact staged overlay`, async () => {
    const { state, owner } = await ownerFixture();
    state.schemaVersion = version;
    if (version === 8) state.costSemanticsVersion = 6;
    state.turn = {
      ...state.turn,
      actionsPerformedThisTurn: [
        ...state.turn.actionsPerformedThisTurn,
        published,
      ],
    };
    expect(enterCostTransactionState(state, owner)).toEqual(
      applyCostTransactionState(state, owner.costTransactionState!)
    );
    expect(publishCostOwnerRoots(state)).toBe(state);
  });
}
