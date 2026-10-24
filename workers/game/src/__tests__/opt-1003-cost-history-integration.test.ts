/** Bounded c50 history-reader interaction: authored Counter publication followed
 * by a synthetic conditional EOB payment. Every captured prompt uses the real
 * writer's returned allocator state, then the selected reader/live/undo path. */
import { expect, it } from "vitest";
import { endPhaseRig, synSchema } from "./opt-962-rig.js";
import {
  runtime,
  command,
  memory,
  type Runtime,
} from "./native7-producer-support.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { evaluateCondition } from "../engine/conditions.js";
import type { GameState } from "../types.js";

function counterHistory(state: GameState) {
  return state.turn.actionsPerformedThisTurn.filter(
    (a) => a.actionType === "USE_COUNTER_EVENT"
  );
}
async function scenario(
  context: "live" | "undo" | "embedded",
  reader: Runtime
) {
  const writer = await runtime();
  const r = endPhaseRig();
  r.state = { ...r.state, schemaVersion: 8, costSemanticsVersion: 7 };
  const condition = {
    type: "ACTION_PERFORMED_THIS_TURN",
    controller: "SELF",
    action: "ACTIVATED_EVENT",
    filter: { base_cost_min: 1 },
  } as const;
  r.putSyn(
    "EOB-HISTORY-1003",
    synSchema("EOB-HISTORY-1003", "Character", [
      {
        id: "history-payment",
        category: "auto",
        trigger: { event: "END_OF_BATTLE" },
        conditions: condition,
        costs: [{ type: "DON_MINUS", amount: 1 }],
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ]),
    1,
    "CHARACTER"
  );
  const counter = r.put("ST04-016", 1, "HAND", {
    type: "Event",
    cost: 1,
    power: null,
    counter: null,
    effectText:
      "[Counter] DON!! −1: Up to 1 of your Leader or Character cards gains +4000 power during this battle.",
  });
  const startingHand = r.state.players[1].hand.length;
  const startingDon = r.state.players[1].donDeck.length;
  const startingArea = r.state.players[1].donCostArea.length;
  r.state = command(
    writer,
    r.state,
    r.db,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: r.state.players[0].leader.instanceId,
      targetInstanceId: r.state.players[1].leader.instanceId,
    },
    0
  );
  r.state = command(writer, r.state, r.db, { type: "PASS" }, 1);
  r.state = command(
    writer,
    r.state,
    r.db,
    {
      type: "USE_COUNTER_EVENT",
      cardInstanceId: counter.instanceId,
      counterTargetInstanceId: r.state.players[1].leader.instanceId,
    },
    1
  );
  expect(r.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  const publishedCounter = structuredClone(counterHistory(r.state));
  expect(publishedCounter).toHaveLength(1);
  const donorIds: string[] = [];
  const query = (state: GameState) =>
    evaluateCondition(state, condition, {
      controller: 1,
      sourceCardInstanceId: state.players[1].leader.instanceId,
      cardDb: r.db,
    });
  async function boundary(state: GameState) {
    const output = memory(writer);
    let saved = await output.repo.save({
      state,
      cardDb: r.db,
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      testPriorityRolls: null,
      undoHistory: [],
    });
    saved = await output.repo.save({ ...saved, undoHistory: [saved.state] });
    expect(counterHistory(saved.state)).toEqual(publishedCounter);
    expect(query(saved.state)).toBe(true);
    const emitted = structuredClone(output.values);
    if (context === "embedded") {
      (emitted.session as { undoHistory?: unknown }).undoHistory =
        emitted["session:undo-history"];
      delete emitted["session:undo-history"];
    }
    const loaded = (await memory(reader, emitted).repo.load())!;
    const next = context === "live" ? loaded.state : loaded.undoHistory[0];
    expect(next).toEqual((output.values.session as { state: GameState }).state);
    expect(next).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 7 });
    expect(counterHistory(next)).toEqual(publishedCounter);
    expect(query(next)).toBe(true);
    return next;
  }
  r.state = await boundary(r.state);
  donorIds.push(
    r.state.players[1].donCostArea.find((d) => d.state === "ACTIVE")!.instanceId
  );
  r.state = command(reader, r.state, r.db, {
    type: "PLAYER_CHOICE",
    choiceId: `don-return-ids:${JSON.stringify([donorIds[0]])}`,
  });
  expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  r.state = await boundary(r.state);
  r.state = command(reader, r.state, r.db, {
    type: "SELECT_TARGET",
    selectedInstanceIds: [r.state.players[1].leader.instanceId],
  });
  expect(
    getEffectivePower(
      r.state.players[1].leader,
      r.db.get(r.state.players[1].leader.cardId)!,
      r.state,
      r.db
    )
  ).toBe(9000);
  r.state = command(reader, r.state, r.db, { type: "PASS" }, 1);
  // The preserved Counter query must open this new EOB COST prompt. Its owner
  // stays above the exact battle completion and sees the still-live buff.
  expect(r.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  expect(r.state.effectStack[0].battleCompletion).toBeDefined();
  expect(
    r.state.eventLog.filter((e) => e.type === "BATTLE_RESOLVED")
  ).toHaveLength(0);
  const owner = r.state.effectStack.find(
    (f) => f.costExpectedRoot && f.costTransactionState
  )!;
  expect(owner).toBeDefined();
  expect(
    owner.costExpectedRoot!.turn.actionsPerformedThisTurn.filter(
      (a) => a.actionType === "USE_COUNTER_EVENT"
    )
  ).toEqual(publishedCounter);
  expect(
    owner.costTransactionState!.turn.actionsPerformedThisTurn.filter(
      (a) => a.actionType === "USE_COUNTER_EVENT"
    )
  ).toEqual(publishedCounter);
  expect(
    getEffectivePower(
      r.state.players[1].leader,
      r.db.get(r.state.players[1].leader.cardId)!,
      r.state,
      r.db
    )
  ).toBe(9000);
  r.state = await boundary(r.state);
  donorIds.push(
    r.state.players[1].donCostArea.find((d) => d.state === "ACTIVE")!.instanceId
  );
  r.state = command(reader, r.state, r.db, {
    type: "PLAYER_CHOICE",
    choiceId: `don-return-ids:${JSON.stringify([donorIds[1]])}`,
  });
  r.state = await boundary(r.state);
  expect(r.state.pendingPrompt).toBeNull();
  expect(r.state.effectStack).toEqual([]);
  expect(counterHistory(r.state)).toEqual(publishedCounter);
  expect(query(r.state)).toBe(true);
  expect(r.state.players[1].hand).toHaveLength(startingHand);
  expect(r.state.players[1].donCostArea).toHaveLength(startingArea - 2);
  expect(r.state.players[1].donDeck).toHaveLength(startingDon + 2);
  for (const id of donorIds)
    expect(
      r.state.players[1].donDeck.filter((d) => d.instanceId === id)
    ).toHaveLength(1);
  expect(
    r.state.players[1].trash.filter((c) => c.cardId === "ST04-016")
  ).toHaveLength(1);
  expect(
    r.state.eventLog.filter((e) => e.type === "COUNTER_USED")
  ).toHaveLength(1);
  expect(
    r.state.eventLog.filter((e) => e.type === "EVENT_ACTIVATED_FROM_HAND")
  ).toHaveLength(1);
  expect(
    r.state.eventLog.filter((e) => e.type === "DON_DETACHED")
  ).toHaveLength(2);
  expect(
    r.state.eventLog.filter((e) => e.type === "END_OF_BATTLE")
  ).toHaveLength(1);
  expect(
    r.state.eventLog.filter((e) => e.type === "BATTLE_RESOLVED")
  ).toHaveLength(1);
  expect(
    r.state.eventLog.findIndex((e) => e.type === "CARD_DRAWN")
  ).toBeLessThan(
    r.state.eventLog.findIndex((e) => e.type === "BATTLE_RESOLVED")
  );
  expect(
    getEffectivePower(
      r.state.players[1].leader,
      r.db.get(r.state.players[1].leader.cardId)!,
      r.state,
      r.db
    )
  ).toBe(5000);
  return r.state;
}
for (const context of ["live", "undo", "embedded"] as const)
  it(`native8 mode7 Counter publication survives prompted EOB cost via ${context}`, async () => {
    const writer = await runtime();
    const expected = await scenario("live", writer);
    const reader = await runtime(process.env.OPT1003_HISTORY_READER_ROOT);
    const actual = await scenario(context, reader);
    expect(actual).toEqual(expected); // Exact IDs, counters, records and events.
  });
