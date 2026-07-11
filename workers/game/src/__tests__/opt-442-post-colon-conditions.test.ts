/**
 * OPT-442 / OPT-457 — post-colon "If ..." clauses gate the whole action
 * chain, never the cost.
 *
 * OPT-442 moved these 18 predicates off block-level `conditions` (which
 * wrongly suppressed cost payment). OPT-457 completed the migration onto
 * `post_cost_conditions` — evaluated exactly once after costs are fully
 * paid, gating the ENTIRE chain including "Then, ..." actions (Rules
 * 8-3-1/8-3-3/4-10-1) — replacing the interim per-action placement, which
 * re-evaluated mid-chain and left THEN actions ungated.
 */

import { describe, expect, it } from "vitest";
import type { CardData, GameState, PlayerState } from "../types.js";
import {
  resolveEffect,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
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
import { createBattleReadyState, createTestCardDb, CARDS } from "./helpers.js";

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

describe("OPT-457: corrected post-colon condition placement", () => {
  it.each(correctedSchemas)(
    "%s carries its post-colon If on post_cost_conditions, not on actions or the block",
    (_cardId, schema) => {
      const correctedBlock = schema.effects.find(
        (block) => block.post_cost_conditions !== undefined
      );

      expect(correctedBlock).toBeDefined();
      // Pre-cost block conditions would wrongly suppress cost payment...
      expect(correctedBlock?.conditions).toBeUndefined();
      // ...and per-action conditions re-evaluate mid-chain and leave
      // "Then, ..." actions ungated (the interim OPT-442 pattern).
      expect(
        correctedBlock?.actions?.some((action) => action.conditions !== undefined)
      ).toBe(false);
    }
  );
});

describe("OPT-442: OP05-060 Monkey.D.Luffy", () => {
  function luffyState(donCount: number): { state: GameState; cardDb: Map<string, CardData>; sourceId: string } {
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
      donCostArea: state.players[0].donCostArea.slice(0, donCount),
    });
    return { state, cardDb, sourceId: state.players[0].leader.instanceId };
  }

  it.each([
    [0, true],   // "0 or 3 or more" — zero DON passes
    [2, false],  // 1-2 DON fails
    [3, true],   // boundary: exactly 3 passes
  ])("with %i DON on the field, the ADD_DON gate is %s", (donCount, gatePasses) => {
    const { state, cardDb, sourceId } = luffyState(donCount as number);
    const block = OP05_060_MONKEY_D_LUFFY.effects[0];
    const initialDonDeck = state.players[0].donDeck.length;

    const offered = resolveEffect(state, block, sourceId, 0, cardDb);
    const result = resumeFromStack(offered.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, cardDb);

    expect(result.resolved).toBe(true);
    // Cost always paid (life → hand); the gate decides only the DON add.
    expect(result.state.players[0].donDeck).toHaveLength(
      gatePasses ? initialDonDeck - 1 : initialDonDeck,
    );
  });

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

describe("OPT-457: OP10-087 Tony Tony.Chopper", () => {
  function chopperState(opponentHandSize: number): { state: GameState; cardDb: Map<string, CardData> } {
    const cardDb = createTestCardDb();
    const source: CardData = {
      ...cardDb.get(CARDS.VANILLA.id)!,
      id: "OP10-087",
      name: "Tony Tony.Chopper",
      effectSchema: OP10_087_TONY_TONY_CHOPPER,
    };
    const dressrosaLeader: CardData = {
      ...cardDb.get("LEADER-T")!,
      id: "LEADER-DRESSROSA",
      types: ["Dressrosa"],
    };
    cardDb.set(source.id, source);
    cardDb.set(dressrosaLeader.id, dressrosaLeader);

    let state = createBattleReadyState(cardDb);
    const chars = [...state.players[0].characters];
    const idx = chars.findIndex((c) => c?.instanceId === "char-0-v1");
    chars[idx] = { ...chars[idx]!, cardId: source.id };
    state = withPlayer(state, 0, {
      characters: chars,
      leader: { ...state.players[0].leader, cardId: dressrosaLeader.id },
    });
    state = withPlayer(state, 1, { hand: state.players[1].hand.slice(0, opponentHandSize) });
    return { state, cardDb };
  }

  function activateAndAccept(state: GameState, cardDb: Map<string, CardData>) {
    const block = OP10_087_TONY_TONY_CHOPPER.effects[0];
    const first = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(first.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    let step = resumeFromStack(first.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, cardDb);
    // The REST_CARDS half of the cost selects the Dressrosa leader.
    if (step.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      step = resumeFromStack(
        step.state,
        { type: "SELECT_TARGET", selectedInstanceIds: [state.players[0].leader.instanceId] },
        cardDb,
      );
    }
    return step;
  }

  it("a failed If skips the WHOLE chain — the THEN mill included (Rule 4-10-1)", () => {
    const { state, cardDb } = chopperState(4);
    const initialDeck = state.players[0].deck.length;
    const initialTrash = state.players[0].trash.length;

    const result = activateAndAccept(state, cardDb);

    expect(result.resolved).toBe(true);
    expect(result.pendingPrompt).toBeUndefined();
    // Cost stands: source and the Dressrosa leader are rested.
    const p0 = result.state.players[0];
    expect(p0.characters.find((c) => c?.instanceId === "char-0-v1")?.state).toBe("RESTED");
    expect(p0.leader.state).toBe("RESTED");
    // Whole chain skipped: no discard AND no mill. (The interim per-action
    // encoding ran the THEN mill here.)
    expect(result.state.players[1].hand).toHaveLength(4);
    expect(p0.deck).toHaveLength(initialDeck);
    expect(p0.trash).toHaveLength(initialTrash);
  });

  it("a passing If runs the discard and then the mill", () => {
    const { state, cardDb } = chopperState(5);
    const initialDeck = state.players[0].deck.length;
    const initialOppDeck = state.players[1].deck.length;

    let result = activateAndAccept(state, cardDb);
    // Opponent chooses which card to trash (mandatory discard).
    if (result.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      const oppCard = state.players[1].hand[0].instanceId;
      result = resumeFromStack(
        result.state,
        { type: "SELECT_TARGET", selectedInstanceIds: [oppCard] },
        cardDb,
      );
    }
    expect(result.resolved).toBe(true);
    expect(result.state.players[1].hand).toHaveLength(4);
    // The opponent controls only the prompted discard. The resumed THEN
    // chain retains Chopper's controller, so "your deck" mills player 0.
    expect(result.state.players[0].deck).toHaveLength(initialDeck - 2);
    expect(result.state.players[1].deck).toHaveLength(initialOppDeck);
  });
});
