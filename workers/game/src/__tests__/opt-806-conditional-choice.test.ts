import { describe, expect, it } from "vitest";
import type {
  Action,
  Condition,
  EffectSchema,
} from "../engine/effect-types.js";
import {
  resolveEffect,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import { validateEffectSchema } from "../engine/schema-registry.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

const myTurn: Condition = { type: "IS_MY_TURN", controller: "SELF" };
const notMyTurn: Condition = { not: myTurn };
function schema(
  type: "PLAYER_CHOICE" | "OPPONENT_CHOICE",
  conditions?: Condition[]
): EffectSchema {
  return {
    card_id: "TEST-806",
    effects: [
      {
        id: "choice",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [
          {
            type,
            params: {
              options: [
                [{ type: "DRAW", params: { amount: 1 } }],
                [{ type: "DRAW", params: { amount: 2 } }],
              ],
              ...(conditions === undefined
                ? {}
                : { option_conditions: conditions }),
            },
          } as Action,
        ],
      },
    ],
  };
}
function offer(value: EffectSchema) {
  const db = createTestCardDb();
  const initial = createBattleReadyState(db);
  const result = resolveEffect(
    initial,
    value.effects[0],
    initial.players[0].leader.instanceId,
    0,
    db
  );
  return { db, initial, result };
}

describe("OPT-806 conditional choice contract", () => {
  it.each(["PLAYER_CHOICE", "OPPONENT_CHOICE"] as const)(
    "%s automatically selects the only eligible branch in effect-controller context",
    (type) => {
      const f = offer(schema(type, [notMyTurn, myTurn]));
      expect(f.result.pendingPrompt).toBeUndefined();
      expect(f.result.state.players[0].hand).toHaveLength(
        f.initial.players[0].hand.length + 2
      );
      expect(f.result.state.players[1].hand).toHaveLength(
        f.initial.players[1].hand.length
      );
    }
  );
  it("executes nothing when no branch is eligible", () => {
    const f = offer(schema("PLAYER_CHOICE", [notMyTurn, notMyTurn]));
    expect(f.result.pendingPrompt).toBeUndefined();
    expect(f.result.state.players[0].hand).toHaveLength(
      f.initial.players[0].hand.length
    );
  });
  it.each(["PLAYER_CHOICE", "OPPONENT_CHOICE"] as const)(
    "%s retains offered branches through a continuation state change",
    (type) => {
      const f = offer(schema(type, [myTurn, myTurn]));
      expect(f.result.pendingPrompt?.respondingPlayer).toBe(
        type === "PLAYER_CHOICE" ? 0 : 1
      );
      expect(f.result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
      // Contract probe: prompt eligibility is captured at creation, not reevaluated on resume.
      const next = {
        ...f.result.state,
        turn: { ...f.result.state.turn, activePlayerIndex: 1 as const },
      };
      const result = resumeFromStack(
        next,
        { type: "PLAYER_CHOICE", choiceId: "1" },
        f.db
      );
      expect(result.pendingPrompt).toBeUndefined();
      expect(result.state.players[0].hand).toHaveLength(
        f.initial.players[0].hand.length + 2
      );
    }
  );
  it.each(["PLAYER_CHOICE", "OPPONENT_CHOICE"] as const)(
    "%s keeps ordinary two-way choice without option conditions",
    (type) => {
      const f = offer(schema(type));
      const prompt = f.result.pendingPrompt?.options;
      expect(prompt?.promptType).toBe("PLAYER_CHOICE");
      if (prompt?.promptType !== "PLAYER_CHOICE")
        throw new Error("missing branch prompt");
      expect(prompt.choices.map((c) => c.id)).toEqual(["0", "1"]);
      const result = resumeFromStack(
        f.result.state,
        { type: "PLAYER_CHOICE", choiceId: "0" },
        f.db
      );
      expect(result.state.players[0].hand).toHaveLength(
        f.initial.players[0].hand.length + 1
      );
    }
  );
  it.each(
    [[], [myTurn], [myTurn, myTurn, myTurn]].map((conditions) => ({
      conditions,
    }))
  )("rejects mismatched condition array %j", ({ conditions }) => {
    const value = schema("PLAYER_CHOICE", conditions);
    expect(validateEffectSchema(value)).toContainEqual(
      expect.stringContaining("one condition object per option")
    );
    const f = offer(value);
    expect(f.result.state.status).toBe("FINISHED");
    expect(f.result.state.players[0].hand).toHaveLength(
      f.initial.players[0].hand.length
    );
  });
  it("accepts the aligned conditional schema", () => {
    expect(
      validateEffectSchema(schema("PLAYER_CHOICE", [myTurn, notMyTurn]))
    ).toEqual([]);
  });
});
