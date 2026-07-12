/**
 * OPT-433 / OPT-434 / OPT-435 — post-colon "If ..." clauses were encoded as
 * block-level `conditions`, which resolveEffect evaluates at Step 1 (before
 * the optional-effect prompt and cost payment). Per Rules 8-3-1/8-3-3 a
 * post-colon "If" clause only gates the effect AFTER the colon — never the
 * cost before it. The fix moves the condition onto the post-colon action
 * (action-level `conditions`, evaluated in executeActionChain after costs
 * are paid) so the cost is always offered and payable regardless of the
 * clause, and only the gated action is skipped when the clause is false.
 *
 * Cards fixed:
 *   - OP05-082 Shirahoshi: HAND_COUNT OPPONENT >= 6
 *   - OP10-118 Monkey.D.Luffy: HAND_COUNT OPPONENT >= 5
 *   - OP12-094 Monkey.D.Dragon: LEADER_PROPERTY {trait: "Revolutionary Army"}
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { OP05_082_SHIRAHOSHI } from "../engine/schemas/op05.js";
import { OP10_118_MONKEY_D_LUFFY } from "../engine/schemas/op10.js";
import { OP12_094_MONKEY_D_DRAGON } from "../engine/schemas/op12.js";

const SOURCE_CHAR_ID = "char-0-v1";

function withPlayer(state: GameState, idx: 0 | 1, patch: Partial<PlayerState>): GameState {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[idx] = { ...newPlayers[idx], ...patch };
  return { ...state, players: newPlayers };
}

function swapCharCardId(state: GameState, instanceId: string, cardId: string): GameState {
  const chars = [...state.players[0].characters];
  const idx = chars.findIndex((c) => c?.instanceId === instanceId);
  if (idx === -1) throw new Error(`instance ${instanceId} not found`);
  chars[idx] = { ...chars[idx]!, cardId };
  return withPlayer(state, 0, { characters: chars });
}

function trashCard(cardId: string, suffix: string, owner: 0 | 1 = 0): CardInstance {
  return {
    instanceId: `trash-${suffix}`,
    cardId,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
  };
}

function handCard(cardId: string, suffix: string, owner: 0 | 1): CardInstance {
  return {
    instanceId: `hand-${suffix}`,
    cardId,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
  };
}

// ─── OPT-433: OP05-082 Shirahoshi ────────────────────────────────────────────
// [Activate: Main] You may rest this Character and place 2 cards from your
// trash at the bottom of your deck in any order: If your opponent has 6 or
// more cards in their hand, your opponent trashes 1 card from their hand.

describe("OPT-433: OP05-082 Shirahoshi — post-colon HAND_COUNT gates only the discard", () => {
  const block = OP05_082_SHIRAHOSHI.effects.find((e) => e.id === "activate_opponent_discard")!;

  function setup(opponentHandSize: number): { state: GameState; cardDb: Map<string, CardData> } {
    const cardDb = createTestCardDb();
    const source: CardData = { ...CARDS.VANILLA, id: "OP05-082", name: "Shirahoshi", effectSchema: OP05_082_SHIRAHOSHI as never };
    cardDb.set(source.id, source);

    let state = createBattleReadyState(cardDb);
    state = swapCharCardId(state, SOURCE_CHAR_ID, source.id);
    state = withPlayer(state, 0, {
      trash: [trashCard(CARDS.VANILLA.id, "a"), trashCard(CARDS.RUSH.id, "b")],
    });

    const oppHand = Array.from({ length: opponentHandSize }, (_, i) => handCard(CARDS.VANILLA.id, `opp-${i}`, 1));
    state = withPlayer(state, 1, { hand: oppHand });

    return { state, cardDb };
  }

  function acceptAndPayCost(state: GameState, cardDb: Map<string, CardData>) {
    const first = resolveEffect(state, block, SOURCE_CHAR_ID, 0, cardDb);
    expect(first.resolved).toBe(false);
    expect(first.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const afterAccept = resumeFromStack(first.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, cardDb);
    expect(afterAccept.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    const afterArrange = resumeFromStack(
      afterAccept.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-a", "trash-b"],
        destination: "bottom",
      },
      cardDb,
    );
    return afterArrange;
  }

  it("condition false (opponent hand < 6): cost is still offered and paid, discard is skipped, resolved true", () => {
    const { state, cardDb } = setup(5);
    const result = acceptAndPayCost(state, cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.resolved).toBe(true);

    const p0 = result.state.players[0];
    // Cost was paid: source rested, 2 cards moved trash → deck bottom.
    const source = p0.characters.find((c) => c?.instanceId === SOURCE_CHAR_ID);
    expect(source?.state).toBe("RESTED");
    expect(p0.trash).toHaveLength(0);
    expect(p0.deck[p0.deck.length - 1].instanceId).not.toBe("trash-b");
    expect(p0.deck[p0.deck.length - 2].instanceId).not.toBe("trash-a");

    // Post-colon action was skipped — opponent hand untouched.
    expect(result.state.players[1].hand).toHaveLength(5);
  });

  it("condition true (opponent hand >= 6): cost is paid and the opponent discards", () => {
    const { state, cardDb } = setup(6);
    const afterArrange = acceptAndPayCost(state, cardDb);

    // Opponent hand > 1 → TRASH_FROM_HAND prompts the opponent to choose.
    expect(afterArrange.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(afterArrange.pendingPrompt?.respondingPlayer).toBe(1);

    const chosenId = state.players[1].hand.length > 0 ? "hand-opp-0" : "";
    const final = resumeFromStack(
      afterArrange.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [chosenId] },
      cardDb,
    );

    expect(final.pendingPrompt).toBeUndefined();
    expect(final.resolved).toBe(true);

    const p0 = final.state.players[0];
    expect(p0.trash).toHaveLength(0); // cost paid the same way

    const p1 = final.state.players[1];
    expect(p1.hand).toHaveLength(5);
    expect(p1.trash.map((c) => c.instanceId)).not.toContain("hand-opp-0");
  });
});

// ─── OPT-434: OP10-118 Monkey.D.Luffy ────────────────────────────────────────
// [When Attacking] You may place 3 cards from your trash at the bottom of
// your deck in any order: If your opponent has 5 or more cards in their
// hand, your opponent trashes 1 card from their hand.

describe("OPT-434: OP10-118 Monkey.D.Luffy — post-colon HAND_COUNT gates only the discard", () => {
  const block = OP10_118_MONKEY_D_LUFFY.effects.find((e) => e.id === "when_attacking_discard")!;

  function setup(opponentHandSize: number): { state: GameState; cardDb: Map<string, CardData> } {
    const cardDb = createTestCardDb();
    const source: CardData = { ...CARDS.VANILLA, id: "OP10-118", name: "Monkey.D.Luffy", effectSchema: OP10_118_MONKEY_D_LUFFY as never };
    cardDb.set(source.id, source);

    let state = createBattleReadyState(cardDb);
    state = swapCharCardId(state, SOURCE_CHAR_ID, source.id);
    state = withPlayer(state, 0, {
      trash: [trashCard(CARDS.VANILLA.id, "a"), trashCard(CARDS.RUSH.id, "b"), trashCard(CARDS.BLOCKER.id, "c")],
    });

    const oppHand = Array.from({ length: opponentHandSize }, (_, i) => handCard(CARDS.VANILLA.id, `opp-${i}`, 1));
    state = withPlayer(state, 1, { hand: oppHand });

    return { state, cardDb };
  }

  function acceptAndPayCost(state: GameState, cardDb: Map<string, CardData>) {
    const first = resolveEffect(state, block, SOURCE_CHAR_ID, 0, cardDb);
    expect(first.resolved).toBe(false);
    expect(first.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const afterAccept = resumeFromStack(first.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, cardDb);
    expect(afterAccept.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    return resumeFromStack(
      afterAccept.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-a", "trash-b", "trash-c"],
        destination: "bottom",
      },
      cardDb,
    );
  }

  it("condition false (opponent hand < 5): cost is still offered and paid, discard is skipped, resolved true", () => {
    const { state, cardDb } = setup(4);
    const result = acceptAndPayCost(state, cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.resolved).toBe(true);

    const p0 = result.state.players[0];
    expect(p0.trash).toHaveLength(0);
    expect(p0.deck[p0.deck.length - 1].instanceId).not.toBe("trash-c");

    expect(result.state.players[1].hand).toHaveLength(4);
  });

  it("condition true (opponent hand >= 5): cost is paid and the opponent discards", () => {
    const { state, cardDb } = setup(5);
    const afterArrange = acceptAndPayCost(state, cardDb);

    expect(afterArrange.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(afterArrange.pendingPrompt?.respondingPlayer).toBe(1);

    const final = resumeFromStack(
      afterArrange.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["hand-opp-0"] },
      cardDb,
    );

    expect(final.pendingPrompt).toBeUndefined();
    expect(final.resolved).toBe(true);

    const p0 = final.state.players[0];
    expect(p0.trash).toHaveLength(0);

    const p1 = final.state.players[1];
    expect(p1.hand).toHaveLength(4);
    expect(p1.trash.map((c) => c.instanceId)).not.toContain("hand-opp-0");
  });
});

// ─── OPT-435: OP12-094 Monkey.D.Dragon ───────────────────────────────────────
// [On Play] You may place 3 {Revolutionary Army} type cards from your trash
// at the bottom of your deck in any order: If your Leader has the
// {Revolutionary Army} type, play up to 1 Character card with a cost of 6 or
// less from your trash.

describe("OPT-435: OP12-094 Monkey.D.Dragon — post-colon LEADER_PROPERTY gates only the play", () => {
  const block = OP12_094_MONKEY_D_DRAGON.effects.find((e) => e.id === "OP12-094_on_play")!;

  const REV_FODDER: CardData = { ...CARDS.VANILLA, id: "REV-FODDER", name: "Rev Fodder", types: ["Revolutionary Army"] };
  const REV_PLAYABLE: CardData = { ...CARDS.VANILLA, id: "REV-PLAYABLE", name: "Rev Playable", cost: 4, types: [] };
  const REV_LEADER: CardData = { ...CARDS.LEADER, id: "REV-LEADER", name: "Rev Leader", types: ["Revolutionary Army"] };

  function setup(leaderHasTrait: boolean): { state: GameState; cardDb: Map<string, CardData> } {
    const cardDb = createTestCardDb();
    const source: CardData = { ...CARDS.VANILLA, id: "OP12-094", name: "Monkey.D.Dragon", effectSchema: OP12_094_MONKEY_D_DRAGON as never };
    cardDb.set(source.id, source);
    cardDb.set(REV_FODDER.id, REV_FODDER);
    cardDb.set(REV_PLAYABLE.id, REV_PLAYABLE);
    cardDb.set(REV_LEADER.id, REV_LEADER);

    let state = createBattleReadyState(cardDb);
    state = swapCharCardId(state, SOURCE_CHAR_ID, source.id);
    state = withPlayer(state, 0, {
      trash: [
        trashCard(REV_FODDER.id, "f1"),
        trashCard(REV_FODDER.id, "f2"),
        trashCard(REV_FODDER.id, "f3"),
        trashCard(REV_PLAYABLE.id, "p1"),
      ],
    });

    if (leaderHasTrait) {
      state = withPlayer(state, 0, { leader: { ...state.players[0].leader, cardId: REV_LEADER.id } });
    }

    return { state, cardDb };
  }

  function acceptAndPayCost(state: GameState, cardDb: Map<string, CardData>) {
    const first = resolveEffect(state, block, SOURCE_CHAR_ID, 0, cardDb);
    expect(first.resolved).toBe(false);
    expect(first.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const afterAccept = resumeFromStack(first.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, cardDb);
    expect(afterAccept.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    return resumeFromStack(
      afterAccept.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-f1", "trash-f2", "trash-f3"],
        destination: "bottom",
      },
      cardDb,
    );
  }

  it("condition false (Leader is not Revolutionary Army): cost is still offered and paid, play is skipped, resolved true", () => {
    const { state, cardDb } = setup(false);
    const result = acceptAndPayCost(state, cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.resolved).toBe(true);

    const p0 = result.state.players[0];
    // Cost paid: the 3 fodder cards left trash; the playable card stayed.
    expect(p0.trash.map((c) => c.instanceId)).toEqual(["trash-p1"]);
    expect(p0.deck[p0.deck.length - 1].instanceId).not.toBe("trash-f3");

    // Post-colon PLAY_CARD action was skipped — no new character on the field.
    expect(p0.characters.filter(Boolean).map((c) => c!.cardId)).not.toContain(REV_PLAYABLE.id);
  });

  it("condition true (Leader has Revolutionary Army type): cost is paid and the trash Character is played", () => {
    const { state, cardDb } = setup(true);
    const afterArrange = acceptAndPayCost(state, cardDb);

    // Single "up to 1" candidate still prompts (declining is legal).
    expect(afterArrange.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(afterArrange.pendingPrompt?.respondingPlayer).toBe(0);

    const final = resumeFromStack(
      afterArrange.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-p1"] },
      cardDb,
    );

    expect(final.pendingPrompt).toBeUndefined();
    expect(final.resolved).toBe(true);

    const p0 = final.state.players[0];
    expect(p0.trash.map((c) => c.instanceId)).not.toContain("trash-p1");
    expect(p0.characters.filter(Boolean).map((c) => c!.cardId)).toContain(REV_PLAYABLE.id);
  });
});
