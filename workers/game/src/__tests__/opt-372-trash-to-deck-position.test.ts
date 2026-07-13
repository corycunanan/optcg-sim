import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
/**
 * OPT-372 — PLACE_FROM_TRASH_TO_DECK honors cost.position.
 *
 * The handler hardcoded bottom placement; position TOP now prepends (deck
 * index 0 = top), and TOP_OR_BOTTOM prompts the player first (LIFE_TO_HAND-
 * style Top/Bottom PLAYER_CHOICE), then re-enters the select/arrange flow
 * with the concrete position. BOTTOM/default behavior is covered by the
 * OPT-371 suite.
 */

import { describe, it, expect } from "vitest";
import type { CardInstance, GameState, PlayerState } from "../types.js";
import type { Cost, EffectBlock, SimpleCost } from "../engine/effect-types.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";
import { payCostsWithSelection } from "../engine/effect-resolver/cost-handler.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";

const SOURCE_CHAR_ID = "char-0-v1";

function makeBlock(costs: Cost[]): EffectBlock {
  return {
    id: "test-trash-position-block",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    costs,
    actions: [{ type: "DRAW", params: { amount: 1 } }],
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

function withTrash(state: GameState, cards: CardInstance[]): GameState {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[0] = { ...newPlayers[0], trash: cards };
  return { ...state, players: newPlayers };
}

const cost = (amount: number, extra: Partial<SimpleCost> = {}): Cost =>
  ({ type: "PLACE_FROM_TRASH_TO_DECK", amount, ...extra }) as Cost;

describe("OPT-372: position TOP", () => {
  it("auto-pay places the card on top of the deck", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [trashCard(CARDS.VANILLA.id, "a")]);

    const block = makeBlock([cost(1, { position: "TOP" })]);
    const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.cannotPay).toBeFalsy();
    expect(result.state.players[0].deck[0].instanceId).not.toBe("trash-a");
  });

  it("select → arrange places the arranged order at the top (deck[0] = first arranged)", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
      trashCard(CARDS.BLOCKER.id, "c"),
    ]);

    const block = makeBlock([cost(2, { position: "TOP" })]);
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    expect(first.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const afterSelect = resumeFromStack(
      first.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["trash-a", "trash-c"] },
      cardDb,
    );
    expect(afterSelect.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    if (afterSelect.pendingPrompt!.options.promptType === "ARRANGE_TOP_CARDS") {
      // The modal's single destination button reads "Place on Top".
      expect(afterSelect.pendingPrompt!.options.canSendToBottom).toBe(false);
      expect(afterSelect.pendingPrompt!.options.effectDescription).toContain("top");
    }

    const done = resumeFromStack(
      afterSelect.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-c", "trash-a"],
        destination: "top",
      },
      cardDb,
    );
    expect(done.pendingPrompt).toBeUndefined();
    const p = done.state.players[0];
    expect(p.trash.map((c) => c.instanceId)).toEqual(["trash-b"]);
    // The arranged group went to the top (trash-c first, then trash-a), and
    // the block's DRAW action then consumed the new top card (trash-c) —
    // leaving trash-a as the topmost deck card.
    expect(p.deck.some((c) => c.instanceId === "trash-c")).toBe(false);
    expect(p.deck[0].instanceId).not.toBe("trash-a");
  });
});

describe("OPT-372: position TOP_OR_BOTTOM prompts the player first", () => {
  it("choosing Top routes the whole flow to top placement", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [
      trashCard(CARDS.VANILLA.id, "a"),
      trashCard(CARDS.RUSH.id, "b"),
    ]);

    const block = makeBlock([cost(2, { position: "TOP_OR_BOTTOM" })]);
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);

    expect(first.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (first.pendingPrompt!.options.promptType === "PLAYER_CHOICE") {
      expect(first.pendingPrompt!.options.choices.map((c) => c.label)).toEqual(["Top", "Bottom"]);
    }

    // Choose Top (id "0") → trash == amount so the flow goes straight to arrange.
    const afterChoice = resumeFromStack(
      first.state,
      { type: "PLAYER_CHOICE", choiceId: "0" },
      cardDb,
    );
    expect(afterChoice.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    if (afterChoice.pendingPrompt!.options.promptType === "ARRANGE_TOP_CARDS") {
      expect(afterChoice.pendingPrompt!.options.canSendToBottom).toBe(false);
    }

    const done = resumeFromStack(
      afterChoice.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ["trash-b", "trash-a"],
        destination: "top",
      },
      cardDb,
    );
    expect(done.pendingPrompt).toBeUndefined();
    const p = done.state.players[0];
    expect(p.trash).toHaveLength(0);
    // trash-b was placed topmost then drawn by the block's DRAW action;
    // trash-a is the remaining top card.
    expect(p.deck[0].instanceId).not.toBe("trash-a");
  });

  it("rejects malformed choice ids instead of defaulting to TOP (Codex review)", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [trashCard(CARDS.VANILLA.id, "a")]);

    const block = makeBlock([cost(1, { position: "TOP_OR_BOTTOM" })]);
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    expect(first.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    for (const bad of ["BOTTOM", "2", "top"]) {
      const result = resumeFromStack(
        first.state,
        { type: "PLAYER_CHOICE", choiceId: bad },
        cardDb,
      );
      expect(result.resolved).toBe(false);
      expect(result.state.players[0].trash).toHaveLength(1); // nothing paid
    }
  });

  it("choosing Bottom keeps bottom placement", () => {
    const cardDb = createTestCardDb();
    const state = withTrash(createBattleReadyState(cardDb), [trashCard(CARDS.VANILLA.id, "a")]);

    const block = makeBlock([cost(1, { position: "TOP_OR_BOTTOM" })]);
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block, resolverExecutionServices);
    expect(first.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    // Choose Bottom (id "1") — amount 1 + trash 1 → auto-pays, no more prompts.
    const done = resumeFromStack(
      first.state,
      { type: "PLAYER_CHOICE", choiceId: "1" },
      cardDb,
    );
    expect(done.pendingPrompt).toBeUndefined();
    const p = done.state.players[0];
    expect(p.trash).toHaveLength(0);
    expect(p.deck[p.deck.length - 1].instanceId).not.toBe("trash-a");
  });
});
