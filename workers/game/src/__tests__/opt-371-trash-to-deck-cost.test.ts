import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
/**
 * OPT-371 — PLACE_FROM_TRASH_TO_DECK cost: player selection + "in any order"
 * arrangement.
 *
 * Previously the cost auto-paid by grabbing the first N trash cards in array
 * order — no card choice, no ordering, and cost.filter was ignored. The cost
 * is now a selection cost: SELECT_TARGET over the (filtered) trash when there
 * is a real choice, chained into an ARRANGE_TOP_CARDS prompt for multi-card
 * costs ("in any order"), skipped when the block shuffles the deck afterward
 * (OP05-080) or for amount 1.
 */

import { describe, it, expect } from "vitest";
import type { CardInstance, PlayerState } from "../types.js";
import type { Cost, EffectBlock, SimpleCost } from "../engine/effect-types.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";
import { payCostsWithSelection } from "../engine/effect-resolver/cost-handler.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";

const SOURCE_CHAR_ID = "char-0-v1";

function makeBlock(costs: Cost[], opts: { shuffleAfter?: boolean } = {}): EffectBlock {
  return {
    id: "test-trash-to-deck-block",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    costs,
    actions: [
      { type: "DRAW", params: { amount: 1 } },
      ...(opts.shuffleAfter ? [{ type: "SHUFFLE_DECK", target: { type: "SELF" } }] : []),
    ],
    flags: { optional: true },
  } as EffectBlock;
}

function trashCard(cardId: string, suffix: string): CardInstance {
  return {
    instanceId: `trash-${suffix}`,
    cardId,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
}

function withTrash(
  state: ReturnType<typeof createBattleReadyState>,
  cards: CardInstance[],
): ReturnType<typeof createBattleReadyState> {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[0] = { ...newPlayers[0], trash: cards };
  return { ...state, players: newPlayers };
}

const cost = (amount: number, extra: Partial<SimpleCost> = {}): Cost =>
  ({ type: "PLACE_FROM_TRASH_TO_DECK", amount, ...extra }) as Cost;

describe("OPT-371: PLACE_FROM_TRASH_TO_DECK selection", () => {
  it("prompts SELECT_TARGET over the trash when trash > amount", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
      trashCard(CARDS.BLOCKER.id, "c"),
      trashCard(CARDS.COUNTER.id, "d"),
    ]);

    const block = makeBlock([cost(2)]);
    const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);

    expect(result.cannotPay).toBeFalsy();
    expect(result.pendingPrompt).toBeTruthy();
    const prompt = result.pendingPrompt!;
    expect(prompt.options.promptType).toBe("SELECT_TARGET");
    if (prompt.options.promptType === "SELECT_TARGET") {
      expect(prompt.options.validTargets.sort()).toEqual(["trash-a", "trash-b", "trash-c", "trash-d"]);
      expect(prompt.options.countMin).toBe(2);
      expect(prompt.options.countMax).toBe(2);
      expect(prompt.options.cards.map((c) => c.instanceId).sort()).toEqual(
        ["trash-a", "trash-b", "trash-c", "trash-d"],
      );
    }
  });

  it("respects cost.filter when computing selectable targets", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
      trashCard(CARDS.VANILLA.id, "c"),
    ]);

    // Filter to the VANILLA card's name — only trash-a / trash-c qualify.
    const block = makeBlock([cost(2, { filter: { name: CARDS.VANILLA.name } })]);
    const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);

    expect(result.cannotPay).toBeFalsy();
    // Exactly amount candidates remain → no selection, straight to arrange.
    expect(result.pendingPrompt).toBeTruthy();
    expect(result.pendingPrompt!.options.promptType).toBe("ARRANGE_TOP_CARDS");
    if (result.pendingPrompt!.options.promptType === "ARRANGE_TOP_CARDS") {
      expect(result.pendingPrompt!.options.cards.map((c) => c.instanceId).sort())
        .toEqual(["trash-a", "trash-c"]);
    }
  });

  it("returns cannotPay when the (filtered) trash has fewer than amount cards", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [trashCard(CARDS.VANILLA.id, "a")]);

    const block = makeBlock([cost(2)]);
    const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    expect(result.cannotPay).toBe(true);
  });
});

describe("OPT-371: selection → arrange chaining", () => {
  it("chains an ARRANGE prompt after selection and places the arranged order at the deck bottom", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
      trashCard(CARDS.BLOCKER.id, "c"),
    ]);
    const deckBefore = state.players[0].deck.length;
    const handBefore = state.players[0].hand.length;

    const block = makeBlock([cost(2)]);
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    // Player picks c and a (not b).
    const afterSelect = resumeFromStack(
      first.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-c", "trash-a"] },
      cardDb,
    );
    expect(afterSelect.pendingPrompt).toBeTruthy();
    expect(afterSelect.pendingPrompt!.options.promptType).toBe("ARRANGE_TOP_CARDS");
    if (afterSelect.pendingPrompt!.options.promptType === "ARRANGE_TOP_CARDS") {
      expect(afterSelect.pendingPrompt!.options.cards.map((c) => c.instanceId).sort())
        .toEqual(["trash-a", "trash-c"]);
      expect(afterSelect.pendingPrompt!.options.maxKeep).toBe(0);
    }

    // Player orders a before c (a nearer the top of the placed group).
    const done = resumeFromStack(
      afterSelect.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-a", "trash-c"],
        destination: "bottom",
      },
      cardDb,
    );

    expect(done.pendingPrompt).toBeUndefined();
    const p = done.state.players[0];
    // Both cards left the trash; b stayed.
    expect(p.trash.map((c) => c.instanceId)).toEqual(["trash-b"]);
    // Placed at the bottom in the arranged order: ..., a, c (c bottom-most).
    expect(p.deck.length).toBe(deckBefore + 2 - 1); // +2 placed, −1 drawn by the action
    expect(p.deck[p.deck.length - 1].instanceId).not.toBe("trash-c");
    expect(p.deck[p.deck.length - 2].instanceId).not.toBe("trash-a");
    // The block's DRAW action ran after the cost.
    expect(p.hand.length).toBe(handBefore + 1);
  });

  it("goes straight to the arrange prompt when trash equals amount (no choice, order matters)", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
    ]);

    const block = makeBlock([cost(2)]);
    const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);

    expect(result.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    const done = resumeFromStack(
      result.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-b", "trash-a"],
        destination: "bottom",
      },
      cardDb,
    );
    expect(done.pendingPrompt).toBeUndefined();
    const p = done.state.players[0];
    expect(p.trash).toHaveLength(0);
    expect(p.deck[p.deck.length - 1].instanceId).not.toBe("trash-a");
    expect(p.deck[p.deck.length - 2].instanceId).not.toBe("trash-b");
  });

  it("ignores unknown ids in the arrange response and still pays in full", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
    ]);

    const block = makeBlock([cost(2)]);
    const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    expect(result.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    // Response contains a bogus id and omits trash-a — the omitted card is
    // appended so the cost still moves both cards.
    const done = resumeFromStack(
      result.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["bogus-id", "trash-b"],
        destination: "bottom",
      },
      cardDb,
    );
    expect(done.pendingPrompt).toBeUndefined();
    const p = done.state.players[0];
    expect(p.trash).toHaveLength(0);
    expect(p.deck[p.deck.length - 1].instanceId).not.toBe("trash-a");
    expect(p.deck[p.deck.length - 2].instanceId).not.toBe("trash-b");
  });
});

describe("OPT-371: arrange-skip cases", () => {
  it("amount 1 needs selection but no arrange", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
    ]);

    const block = makeBlock([cost(1)]);
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const done = resumeFromStack(
      first.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-b"] },
      cardDb,
    );
    expect(done.pendingPrompt).toBeUndefined();
    const p = done.state.players[0];
    expect(p.trash.map((c) => c.instanceId)).toEqual(["trash-a"]);
    expect(p.deck[p.deck.length - 1].instanceId).not.toBe("trash-b");
  });

  it("amount 1 with trash of exactly 1 auto-pays with no prompt", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [trashCard(CARDS.VANILLA.id, "a")]);

    const block = makeBlock([cost(1)]);
    const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.cannotPay).toBeFalsy();
    const p = result.state.players[0];
    expect(p.trash).toHaveLength(0);
    expect(p.deck[p.deck.length - 1].instanceId).not.toBe("trash-a");
  });

  it("shuffle-after block (OP05-080 pattern) skips the arrange step entirely", () => {
    const cardDb = createTestCardDb();
    // Trash equals amount and the block shuffles → no prompts at all.
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
      trashCard(CARDS.BLOCKER.id, "c"),
    ]);

    const block = makeBlock([cost(3)], { shuffleAfter: true });
    const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.cannotPay).toBeFalsy();
    expect(result.state.players[0].trash).toHaveLength(0);
  });

  it("shuffle-after block still prompts selection when trash > amount, without arrange", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
      trashCard(CARDS.BLOCKER.id, "c"),
    ]);

    const block = makeBlock([cost(2)], { shuffleAfter: true });
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const done = resumeFromStack(
      first.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-a", "trash-c"] },
      cardDb,
    );
    // No arrange step — the block shuffles afterward.
    expect(done.pendingPrompt).toBeUndefined();
    expect(done.state.players[0].trash.map((c) => c.instanceId)).toEqual(["trash-b"]);
  });
});

describe("OPT-371: malformed / out-of-order responses (Codex review)", () => {
  it("ignores an ARRANGE packet sent while still on the select stage", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
      trashCard(CARDS.BLOCKER.id, "c"),
      trashCard(CARDS.COUNTER.id, "d"),
    ]);

    const block = makeBlock([cost(2)]);
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    // A premature arrange packet must NOT pay the cost with all 4 candidates.
    const result = resumeFromStack(
      first.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-a", "trash-b", "trash-c", "trash-d"],
        destination: "bottom",
      },
      cardDb,
    );
    expect(result.resolved).toBe(false);
    expect(result.state.players[0].trash).toHaveLength(4);
  });

  it("rejects duplicate ids in the selection response", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
      trashCard(CARDS.BLOCKER.id, "c"),
    ]);

    const block = makeBlock([cost(2)]);
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const result = resumeFromStack(
      first.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-a", "trash-a"] },
      cardDb,
    );
    expect(result.resolved).toBe(false);
    expect(result.state.players[0].trash).toHaveLength(3);
  });

  it("ignores a SELECT packet sent during the arrange stage (no ordering bypass)", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
      trashCard(CARDS.BLOCKER.id, "c"),
    ]);

    const block = makeBlock([cost(2)]);
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    const afterSelect = resumeFromStack(
      first.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-a", "trash-b"] },
      cardDb,
    );
    expect(afterSelect.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    // Re-sending a selection must not skip the ordering step.
    const result = resumeFromStack(
      afterSelect.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-a", "trash-b"] },
      cardDb,
    );
    expect(result.resolved).toBe(false);
    expect(result.state.players[0].trash).toHaveLength(3);

    // The proper arrange response still completes the payment.
    const done = resumeFromStack(
      result.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-b", "trash-a"],
        destination: "bottom",
      },
      cardDb,
    );
    expect(done.pendingPrompt).toBeUndefined();
    expect(done.state.players[0].trash.map((c) => c.instanceId)).toEqual(["trash-c"]);
  });
});

describe("OPT-371: OP05-082 Shirahoshi cost shape (REST_SELF + place 2, integration)", () => {
  it("rests the source, prompts selection then order, and runs the action chain", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
      trashCard(CARDS.BLOCKER.id, "c"),
    ]);
    const handBefore = state.players[0].hand.length;

    // Mirrors OP05-082's cost list: rest self + place 2 at the bottom.
    const block = makeBlock([
      { type: "REST_SELF" } as Cost,
      cost(2, { position: "BOTTOM" }),
    ]);

    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    // REST_SELF auto-paid — the source is already rested when selection opens.
    const sourceAfterRest = first.state.players[0].characters.find(
      (c) => c?.instanceId === SOURCE_CHAR_ID,
    );
    expect(sourceAfterRest?.state).toBe("RESTED");
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const afterSelect = resumeFromStack(
      first.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-a", "trash-b"] },
      cardDb,
    );
    expect(afterSelect.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    const done = resumeFromStack(
      afterSelect.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-b", "trash-a"],
        destination: "bottom",
      },
      cardDb,
    );
    expect(done.pendingPrompt).toBeUndefined();
    const p = done.state.players[0];
    expect(p.trash.map((c) => c.instanceId)).toEqual(["trash-c"]);
    expect(p.deck[p.deck.length - 1].instanceId).not.toBe("trash-a");
    expect(p.deck[p.deck.length - 2].instanceId).not.toBe("trash-b");
    // Action chain (DRAW) resolved after both costs.
    expect(p.hand.length).toBe(handBefore + 1);
  });
});
