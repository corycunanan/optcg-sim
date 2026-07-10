/**
 * OPT-442 — post-colon "If ..." clauses gate resolution actions, not costs.
 *
 * These regressions cover the 17 verified OP05/OP10/OP12 encodings plus the
 * OP02-018 guide example that taught the same incorrect block-level pattern.
 */

import { describe, expect, it } from "vitest";
import type { CardData, GameState, PlayerState } from "../types.js";
import {
  resolveEffect,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { OP02_018_MARCO } from "../engine/schemas/op02.js";
import {
  OP05_016_MORLEY,
  OP05_017_LINDBERGH,
  OP05_060_MONKEY_D_LUFFY,
} from "../engine/schemas/op05.js";
import {
  OP10_021_PUNK_HAZARD,
  OP10_057_LEO,
  OP10_062_VIOLET,
  OP10_075_FOXY,
  OP10_076_BABY_5,
  OP10_087_TONY_TONY_CHOPPER,
  OP10_113_RORONOA_ZORO,
  OP10_114_X_DRAKE,
} from "../engine/schemas/op10.js";
import {
  OP12_028_KOUZUKI_HIYORI,
  OP12_069_CROCODILE,
  OP12_074_PATTY,
  OP12_080_BARATIE,
  OP12_087_NICO_ROBIN,
  OP12_117_SLAM_GIBSON,
} from "../engine/schemas/op12.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function withPlayer(
  state: GameState,
  idx: 0 | 1,
  patch: Partial<PlayerState>
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[idx] = { ...players[idx], ...patch };
  return { ...state, players };
}

const correctedSchemas = [
  ["OP02-018", OP02_018_MARCO],
  ["OP05-016", OP05_016_MORLEY],
  ["OP05-017", OP05_017_LINDBERGH],
  ["OP05-060", OP05_060_MONKEY_D_LUFFY],
  ["OP10-021", OP10_021_PUNK_HAZARD],
  ["OP10-057", OP10_057_LEO],
  ["OP10-062", OP10_062_VIOLET],
  ["OP10-075", OP10_075_FOXY],
  ["OP10-076", OP10_076_BABY_5],
  ["OP10-087", OP10_087_TONY_TONY_CHOPPER],
  ["OP10-113", OP10_113_RORONOA_ZORO],
  ["OP10-114", OP10_114_X_DRAKE],
  ["OP12-028", OP12_028_KOUZUKI_HIYORI],
  ["OP12-069", OP12_069_CROCODILE],
  ["OP12-074", OP12_074_PATTY],
  ["OP12-080", OP12_080_BARATIE],
  ["OP12-087", OP12_087_NICO_ROBIN],
  ["OP12-117", OP12_117_SLAM_GIBSON],
] as const;

describe("OPT-442: corrected post-colon condition placement", () => {
  it.each(correctedSchemas)(
    "%s keeps its condition on an action instead of the effect block",
    (_cardId, schema) => {
      const correctedBlock = schema.effects.find((block) =>
        block.actions?.some((action) => action.conditions !== undefined)
      );

      expect(correctedBlock).toBeDefined();
      expect(correctedBlock?.conditions).toBeUndefined();
    }
  );
});

describe("OPT-442: OP05-060 Monkey.D.Luffy", () => {
  it("allows the Life cost with 1-2 DON and skips only ADD_DON", () => {
    const cardDb = createTestCardDb();
    const leader: CardData = {
      ...cardDb.get("LEADER-T")!,
      id: "OP05-060",
      name: "Monkey.D.Luffy",
      effectSchema: OP05_060_MONKEY_D_LUFFY,
    };
    cardDb.set(leader.id, leader);

    let state = createBattleReadyState(cardDb);
    state = withPlayer(state, 0, {
      leader: { ...state.players[0].leader, cardId: leader.id },
      donCostArea: state.players[0].donCostArea.slice(0, 2),
    });

    const sourceId = state.players[0].leader.instanceId;
    const block = OP05_060_MONKEY_D_LUFFY.effects[0];
    const initialLife = state.players[0].life.length;
    const initialHand = state.players[0].hand.length;
    const initialDonDeck = state.players[0].donDeck.length;

    const offered = resolveEffect(state, block, sourceId, 0, cardDb);
    expect(offered.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const result = resumeFromStack(
      offered.state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb
    );

    expect(result.resolved).toBe(true);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].life).toHaveLength(initialLife - 1);
    expect(result.state.players[0].hand).toHaveLength(initialHand + 1);
    expect(result.state.players[0].donCostArea).toHaveLength(2);
    expect(result.state.players[0].donDeck).toHaveLength(initialDonDeck);
  });
});

describe("OPT-442: OP10-087 Tony Tony.Chopper", () => {
  it("still mills 2 for THEN when the opponent-hand condition is false", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    state = withPlayer(state, 1, { hand: state.players[1].hand.slice(0, 4) });

    const initialDeck = state.players[0].deck.length;
    const initialTrash = state.players[0].trash.length;
    const block = OP10_087_TONY_TONY_CHOPPER.effects[0];

    const result = executeActionChain(
      state,
      block.actions!,
      "char-0-v1",
      0,
      cardDb
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[1].hand).toHaveLength(4);
    expect(result.state.players[0].deck).toHaveLength(initialDeck - 2);
    expect(result.state.players[0].trash).toHaveLength(initialTrash + 2);
  });
});
