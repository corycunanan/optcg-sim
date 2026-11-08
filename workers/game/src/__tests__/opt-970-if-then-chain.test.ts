/**
 * OPT-970 — rule 4-10 "If" and "Then".
 *
 * 4-10-1: if a preceding "if" clause cannot be resolved, the following clause
 * cannot be resolved either. The engine encodes an "if" clause as an inline
 * `conditions` on the action, so a failed inline condition also skips the
 * `chain: "THEN"` actions that follow it (OP05-047, OP06-116, OP11-066 and
 * EB01-029 FAQs).
 *
 * 4-10-2: if a preceding "then" clause cannot be resolved, the following
 * clause still resolves. An action that runs but fails does not skip the next
 * THEN (ST34-002 FAQ: "If I have no cards in my DON!! deck, can I still …
 * K.O.? Yes").
 */
import { describe, expect, it } from "vitest";
import type { Action, Condition, EffectBlock } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const NEVER: Condition = {
  type: "LIFE_COUNT",
  controller: "SELF",
  operator: ">=",
  value: 99,
};
const ALWAYS: Condition = {
  type: "LIFE_COUNT",
  controller: "SELF",
  operator: ">=",
  value: 0,
};

const draw = (extra: Partial<Action> = {}): Action =>
  ({ type: "DRAW", params: { amount: 1 }, ...extra }) as Action;

function chainBlock(actions: Action[]): EffectBlock {
  return {
    id: "opt970_chain",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    actions,
  } as EffectBlock;
}

function character(
  cardId: string,
  instanceId: string,
  controller: 0 | 1
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

function drawsFor(actions: Action[]): number {
  const db = createTestCardDb();
  const state = createBattleReadyState(db);
  const source =
    state.players[0].characters.find(Boolean) ?? state.players[0].leader;
  const handBefore = state.players[0].hand.length;
  const result = resolveEffect(
    state,
    chainBlock(actions),
    source.instanceId,
    0,
    db
  );
  expect(result.pendingPrompt ?? null).toBeNull();
  return result.state.players[0].hand.length - handBefore;
}

describe("OPT-970 rule 4-10-1: a failed inline condition also skips the following THEN", () => {
  it("skips the THEN action after a failed condition", () => {
    expect(
      drawsFor([draw({ conditions: NEVER }), draw({ chain: "THEN" })])
    ).toBe(0);
  });

  it("skips the whole THEN tail of that sentence (OP10-058 shape)", () => {
    expect(
      drawsFor([
        draw({ conditions: NEVER }),
        draw({ chain: "THEN" }),
        draw({ chain: "THEN" }),
      ])
    ).toBe(0);
  });

  it("skips a THEN after a conditional THEN clause that fails", () => {
    expect(
      drawsFor([
        draw(),
        draw({ chain: "THEN", conditions: NEVER }),
        draw({ chain: "THEN" }),
      ])
    ).toBe(1);
  });

  it("does not skip an unchained action after a failed condition", () => {
    expect(drawsFor([draw({ conditions: NEVER }), draw()])).toBe(1);
  });

  it("runs the THEN when the condition holds", () => {
    expect(
      drawsFor([draw({ conditions: ALWAYS }), draw({ chain: "THEN" })])
    ).toBe(2);
  });
});

describe("OPT-970 rule 4-10-2: a failed action still lets the following THEN resolve", () => {
  it("runs the THEN after an action that resolved nothing", () => {
    const koNothing = {
      type: "KO",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { up_to: 1 },
        filter: { cost_max: 0, cost_min: 99 },
      },
    } as Action;
    expect(drawsFor([koNothing, draw({ chain: "THEN" })])).toBe(1);
  });
});

describe("OPT-970 ST34-002 Charlotte Cracker", () => {
  const schema = getEffectSchema("ST34-002");
  if (!schema) throw new Error("ST34-002 schema not registered");
  const onPlay = schema.effects.find(
    (e) => e.id === "on_play_add_don_then_ko"
  )!;

  function setup(
    leaderTraits: string[],
    donDeck: boolean
  ): { state: GameState; db: Map<string, CardData> } {
    const db = createTestCardDb();
    db.set("ST34-002", {
      ...CARDS.VANILLA,
      id: "ST34-002",
      name: "Charlotte Cracker",
      effectSchema: schema,
    });
    db.set(CARDS.LEADER.id, { ...CARDS.LEADER, types: leaderTraits });
    db.set("OPT970-COST-2", { ...CARDS.VANILLA, id: "OPT970-COST-2", cost: 2 });
    const state = createBattleReadyState(db);
    state.players[0].characters = padChars([
      character("ST34-002", "cracker", 0),
    ]);
    state.players[1].characters = padChars([
      character("OPT970-COST-2", "small", 1),
    ]);
    if (!donDeck) state.players[0].donDeck = [];
    return { state, db };
  }

  it("without a {Big Mom Pirates} Leader, neither adds DON!! nor K.O.s (rule 4-10-1)", () => {
    const { state, db } = setup([], true);
    const donBefore = state.players[0].donDeck.length;
    const result = resolveEffect(state, onPlay, "cracker", 0, db);
    expect(result.pendingPrompt ?? null).toBeNull();
    expect(result.state.players[0].donDeck.length).toBe(donBefore);
    expect(
      result.state.players[1].characters.some((c) => c?.instanceId === "small")
    ).toBe(true);
  });

  it("with an empty DON!! deck, still offers the K.O. (rule 4-10-2, ST34 FAQ)", () => {
    const { state, db } = setup(["Big Mom Pirates"], false);
    const result = resolveEffect(state, onPlay, "cracker", 0, db);
    const prompt = result.pendingPrompt?.options;
    expect(prompt?.promptType).toBe("SELECT_TARGET");
    expect((prompt as { validTargets?: string[] }).validTargets).toContain(
      "small"
    );
  });
});
