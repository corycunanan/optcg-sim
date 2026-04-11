/**
 * TRASH_FROM_HAND integration tests
 *
 * Tests the full flow: effect triggers → cost prompt → player selects → card trashed.
 * Verifies the cost selection resume path actually modifies state.
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
  PendingPromptState,
} from "../types.js";
import type { EffectSchema, EffectBlock, Cost } from "../engine/effect-types.js";
import { setupGame, createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { executeActionChain, executeEffectAction } from "../engine/effect-resolver/resolver.js";
import { payCostsWithSelection, applyCostSelection } from "../engine/effect-resolver/cost-handler.js";
import { resumeEffectChain } from "../engine/effect-resolver/resume.js";
import { pushFrame, peekFrame, popFrame } from "../engine/effect-stack.js";
import type { Action } from "../engine/effect-types.js";

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TRASH_FROM_HAND cost selection flow", () => {
  it("applyCostSelection actually removes cards from hand", () => {
    const { state } = setupGame();
    const controller = 0 as const;
    const handBefore = state.players[controller].hand;
    const cardToTrash = handBefore[0];

    const newState = applyCostSelection(
      state,
      { type: "TRASH_FROM_HAND", amount: 1 } as Cost,
      [cardToTrash.instanceId],
      controller,
    );

    const handAfter = newState.players[controller].hand;
    const trashAfter = newState.players[controller].trash;

    expect(handAfter.length).toBe(handBefore.length - 1);
    expect(handAfter.find((c) => c.instanceId === cardToTrash.instanceId)).toBeUndefined();
    expect(trashAfter.find((c) => c.instanceId === cardToTrash.instanceId)).toBeTruthy();
    expect(trashAfter[0].zone).toBe("TRASH");
  });

  it("payCostsWithSelection creates a prompt for TRASH_FROM_HAND", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const controller = 0 as const;

    // Give player 0 some hand cards
    expect(state.players[controller].hand.length).toBeGreaterThan(0);

    const block: EffectBlock = {
      id: "test-block",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    } as EffectBlock;

    const result = payCostsWithSelection(
      state,
      block.costs!,
      0,
      controller,
      cardDb,
      "char-0-v1",
      block,
    );

    // Should prompt for selection (not auto-pay)
    expect(result.pendingPrompt).toBeTruthy();
    expect(result.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");
    expect(result.pendingPrompt!.respondingPlayer).toBe(controller);

    // Cards in prompt should have real cardIds
    if (result.pendingPrompt!.options.promptType === "SELECT_TARGET") {
      for (const card of result.pendingPrompt!.options.cards) {
        expect(card.cardId).not.toBe("hidden");
      }
      expect(result.pendingPrompt!.options.validTargets.length).toBeGreaterThan(0);
    }
  });

  it("full cost selection → resume → card is trashed", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const controller = 0 as const;

    const block: EffectBlock = {
      id: "test-block",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      actions: [],
    } as EffectBlock;

    // Step 1: Pay costs → get prompt
    const costResult = payCostsWithSelection(
      state,
      block.costs!,
      0,
      controller,
      cardDb,
      "char-0-v1",
      block,
    );

    expect(costResult.pendingPrompt).toBeTruthy();
    const prompt = costResult.pendingPrompt!;
    const stateWithFrame = costResult.state;

    // The effect stack should have a frame
    expect(stateWithFrame.effectStack.length).toBeGreaterThan(0);

    // Step 2: Select a card (first valid target)
    const validTargets = (prompt.options as any).validTargets as string[];
    const selectedId = validTargets[0];
    const handBefore = stateWithFrame.players[controller].hand;
    const selectedCard = handBefore.find((c) => c.instanceId === selectedId);
    expect(selectedCard).toBeTruthy();

    // Step 3: Resume from stack with SELECT_TARGET action
    const resumeResult = resumeFromStack(
      stateWithFrame,
      { type: "SELECT_TARGET", selectedInstanceIds: [selectedId] },
      cardDb,
    );

    // Step 4: Verify the card was trashed
    const handAfter = resumeResult.state.players[controller].hand;
    const trashAfter = resumeResult.state.players[controller].trash;

    expect(handAfter.find((c) => c.instanceId === selectedId)).toBeUndefined();
    expect(trashAfter.find((c) => c.instanceId === selectedId)).toBeTruthy();
    expect(handAfter.length).toBe(handBefore.length - 1);
  });

  it("TRASH_FROM_HAND as action (not cost) with preselection works", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const controller = 0 as const;
    const hand = state.players[controller].hand;
    const cardToTrash = hand[0];

    const actions = [
      {
        type: "TRASH_FROM_HAND",
        params: { amount: 1 },
      },
    ];

    // First call: no preselection → should create a prompt
    const chainResult = executeActionChain(
      state,
      actions as any,
      "char-0-v1",
      controller,
      cardDb,
    );

    if (hand.length > 1) {
      // Multiple cards → prompt needed
      expect(chainResult.pendingPrompt).toBeTruthy();

      // Simulate the resume with preselected targets
      const stateWithFrame = chainResult.state;
      const prompt = chainResult.pendingPrompt!;
      const validTargets = (prompt.options as any).validTargets as string[];
      const selectedId = validTargets[0];

      const resumeResult = resumeFromStack(
        stateWithFrame,
        { type: "SELECT_TARGET", selectedInstanceIds: [selectedId] },
        cardDb,
      );

      const handAfter = resumeResult.state.players[controller].hand;
      expect(handAfter.find((c) => c.instanceId === selectedId)).toBeUndefined();
    } else {
      // Single card → auto-selected, no prompt
      expect(chainResult.pendingPrompt).toBeUndefined();
      const handAfter = chainResult.state.players[controller].hand;
      expect(handAfter.length).toBe(0);
    }
  });
});

describe("OPPONENT_ACTION → TRASH_FROM_HAND (Perona OP06-093 pattern)", () => {
  it("opponent's card is trashed when OPPONENT_ACTION wraps TRASH_FROM_HAND", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const peronaController = 0 as const;
    const opponent = 1 as const;

    // Ensure opponent has cards in hand
    expect(state.players[opponent].hand.length).toBeGreaterThan(0);
    const oppHandBefore = state.players[opponent].hand;
    const oppCardToTrash = oppHandBefore[0];

    // Simulate the OPPONENT_ACTION → TRASH_FROM_HAND chain
    // This is the exact pattern from Perona OP06-093's PLAYER_CHOICE option 1
    const actions: Action[] = [
      {
        type: "OPPONENT_ACTION",
        params: {
          action: {
            type: "TRASH_FROM_HAND",
            params: { amount: 1 },
          },
        },
      } as Action,
    ];

    // Execute the action chain as Perona's controller (player 0)
    const chainResult = executeActionChain(
      state,
      actions,
      "char-0-v1", // Perona's instance
      peronaController,
      cardDb,
    );

    // Should create a prompt for the OPPONENT (player 1) to select a card
    expect(chainResult.pendingPrompt).toBeTruthy();
    expect(chainResult.pendingPrompt!.respondingPlayer).toBe(opponent);

    // The cards in the prompt should be from the opponent's hand
    if (chainResult.pendingPrompt!.options.promptType === "SELECT_TARGET") {
      const promptCards = chainResult.pendingPrompt!.options.cards;
      expect(promptCards.length).toBeGreaterThan(0);
      // All prompt cards should be from opponent's hand
      for (const card of promptCards) {
        expect(oppHandBefore.some((c) => c.instanceId === card.instanceId)).toBe(true);
      }
    }

    // Simulate opponent selecting a card and responding
    const stateWithFrame = chainResult.state;
    const validTargets = (chainResult.pendingPrompt!.options as any).validTargets as string[];
    const selectedId = validTargets[0];

    // Verify the selected ID is from opponent's hand (not controller's)
    expect(oppHandBefore.some((c) => c.instanceId === selectedId)).toBe(true);

    // Resume with the opponent's selection
    const resumeResult = resumeFromStack(
      stateWithFrame,
      { type: "SELECT_TARGET", selectedInstanceIds: [selectedId] },
      cardDb,
    );

    // The card should be trashed from the OPPONENT's hand
    const oppHandAfter = resumeResult.state.players[opponent].hand;
    const oppTrashAfter = resumeResult.state.players[opponent].trash;

    expect(oppHandAfter.find((c) => c.instanceId === selectedId)).toBeUndefined();
    expect(oppTrashAfter.find((c) => c.instanceId === selectedId)).toBeTruthy();
    expect(oppHandAfter.length).toBe(oppHandBefore.length - 1);

    // Controller's hand should be untouched
    expect(resumeResult.state.players[peronaController].hand.length).toBe(
      state.players[peronaController].hand.length,
    );
  });
});
