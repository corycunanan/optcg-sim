/**
 * OPT-178 — CHOICE cost handling in cost-handler
 *
 * Covers:
 *   - Prompt with branch choices when ≥2 branches are payable.
 *   - Auto-expand when exactly 1 branch is payable (no prompt).
 *   - cannotPay when all branches are unpayable.
 *   - PLAYER_CHOICE resume splices chosen branch and continues.
 *   - Custom labels flow through to prompt choices.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, PlayerState } from "../types.js";
import type { Cost, ChoiceCost, EffectBlock } from "../engine/effect-types.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";
import { payCostsWithSelection } from "../engine/effect-resolver/cost-handler.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";

function makeBlock(costs: Cost[]): EffectBlock {
  return {
    id: "test-choice-block",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    costs,
    actions: [{ type: "DRAW", params: { amount: 1 } }],
    flags: { once_per_turn: true, optional: true },
  } as EffectBlock;
}

function withPlayer(
  state: ReturnType<typeof createBattleReadyState>,
  playerIdx: 0 | 1,
  patch: Partial<PlayerState>,
): ReturnType<typeof createBattleReadyState> {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIdx] = { ...newPlayers[playerIdx], ...patch };
  return { ...state, players: newPlayers };
}

const SOURCE_CHAR_ID = "char-0-v1";

// Branch A: trash 1 from hand. Branch B: rest 2 DON.
function twoPayableBranches(): ChoiceCost {
  return {
    type: "CHOICE",
    options: [
      [{ type: "TRASH_FROM_HAND", amount: 1 }],
      [{ type: "DON_REST", amount: 2 }],
    ],
  };
}

function twoPayableBranchesWithLabels(): ChoiceCost {
  return {
    type: "CHOICE",
    options: [
      [{ type: "TRASH_FROM_HAND", amount: 1 }],
      [{ type: "DON_REST", amount: 2 }],
    ],
    labels: ["Discard a card", "Rest 2 DON"],
  };
}

// Branch A: trash 1 from hand. Branch B: KO own character (needs a character).
function oneBranchRequiresCharacter(): ChoiceCost {
  return {
    type: "CHOICE",
    options: [
      [{ type: "TRASH_FROM_HAND", amount: 1 }],
      [{ type: "KO_OWN_CHARACTER", amount: 1 }],
    ],
  };
}

// Branch A: DON_MINUS 99 (unpayable). Branch B: DON_REST 99 (unpayable).
function allUnpayableBranches(): ChoiceCost {
  return {
    type: "CHOICE",
    options: [
      [{ type: "DON_MINUS", amount: 99 }],
      [{ type: "DON_REST", amount: 99 }],
    ],
  };
}

// Multi-cost branch: trash from hand + DON rest in a single branch.
function multiCostBranch(): ChoiceCost {
  return {
    type: "CHOICE",
    options: [
      [{ type: "DON_MINUS", amount: 1 }],
      [{ type: "TRASH_FROM_HAND", amount: 1 }, { type: "DON_REST", amount: 1 }],
    ],
  };
}

describe("OPT-178: CHOICE cost", () => {
  // ─── Prompt emission ─────────────────────────────────────────────────────

  describe("prompt emission", () => {
    it("emits PLAYER_CHOICE with both branches when both are payable", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);
      expect(state.players[0].hand.length).toBeGreaterThan(0);

      const block = makeBlock([twoPayableBranches()]);
      const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);

      expect(result.pendingPrompt).toBeTruthy();
      const prompt = result.pendingPrompt!;
      expect(prompt.options.promptType).toBe("PLAYER_CHOICE");
      if (prompt.options.promptType === "PLAYER_CHOICE") {
        expect(prompt.options.choices).toHaveLength(2);
        expect(prompt.options.choices.map((c) => c.id).sort()).toEqual(["0", "1"]);
      }
    });

    it("uses custom labels when provided", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const block = makeBlock([twoPayableBranchesWithLabels()]);
      const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);

      expect(result.pendingPrompt).toBeTruthy();
      const prompt = result.pendingPrompt!;
      if (prompt.options.promptType === "PLAYER_CHOICE") {
        expect(prompt.options.choices[0].label).toBe("Discard a card");
        expect(prompt.options.choices[1].label).toBe("Rest 2 DON");
      }
    });

    it("derives labels from cost types when no labels provided", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const block = makeBlock([twoPayableBranches()]);
      const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);

      const prompt = result.pendingPrompt!;
      if (prompt.options.promptType === "PLAYER_CHOICE") {
        expect(prompt.options.choices[0].label).toBeTruthy();
        expect(prompt.options.choices[1].label).toBeTruthy();
        expect(prompt.options.choices[0].label).not.toBe(prompt.options.choices[1].label);
      }
    });
  });

  // ─── Auto-select ─────────────────────────────────────────────────────────

  describe("auto-select", () => {
    it("auto-expands when exactly 1 branch is payable (no PLAYER_CHOICE prompt)", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);
      // Remove all characters so KO_OWN_CHARACTER branch is unpayable.
      const stateNoChars = withPlayer(state, 0, { characters: padChars([]) });
      expect(stateNoChars.players[0].hand.length).toBeGreaterThan(0);

      const block = makeBlock([oneBranchRequiresCharacter()]);
      const result = payCostsWithSelection(
        stateNoChars, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block,
      );

      // Should skip PLAYER_CHOICE and go directly to the hand branch's SELECT_TARGET.
      expect(result.pendingPrompt).toBeTruthy();
      expect(result.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");
    });

    it("auto-expanded branch with only auto-payable costs completes without prompt", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      // Branch A: DON_MINUS 99 (unpayable). Branch B: DON_MINUS 1 (auto-payable).
      const choice: ChoiceCost = {
        type: "CHOICE",
        options: [
          [{ type: "DON_MINUS", amount: 99 }],
          [{ type: "DON_MINUS", amount: 1 }],
        ],
      };

      const block = makeBlock([choice]);
      const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);

      // Only branch B is payable, it's auto-payable, so costs resolve fully.
      expect(result.pendingPrompt).toBeUndefined();
      expect(result.cannotPay).toBeFalsy();
      expect(result.costResult).toBeTruthy();
    });
  });

  // ─── Cannot pay ──────────────────────────────────────────────────────────

  describe("cannotPay", () => {
    it("returns cannotPay when all branches are unpayable", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const block = makeBlock([allUnpayableBranches()]);
      const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);

      expect(result.cannotPay).toBe(true);
      expect(result.pendingPrompt).toBeUndefined();
    });
  });

  // ─── Resume after PLAYER_CHOICE ──────────────────────────────────────────

  describe("resume", () => {
    it("choosing the hand branch surfaces SELECT_TARGET for hand cards", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const block = makeBlock([twoPayableBranches()]);
      const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);
      expect(first.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

      // Choose branch 0 (trash from hand).
      const resumed = resumeFromStack(
        first.state,
        { type: "PLAYER_CHOICE", choiceId: "0" },
        cardDb,
      );

      expect(resumed.pendingPrompt).toBeTruthy();
      expect(resumed.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");
    });

    it("choosing the auto-payable branch completes without further prompt", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const block = makeBlock([twoPayableBranches()]);
      const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);
      expect(first.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

      // Choose branch 1 (DON_REST 2 — auto-payable).
      const resumed = resumeFromStack(
        first.state,
        { type: "PLAYER_CHOICE", choiceId: "1" },
        cardDb,
      );

      // DON_REST is auto-payable, so no further prompt. Actions should resolve.
      expect(resumed.pendingPrompt).toBeUndefined();
      expect(resumed.resolved).not.toBe(false);
    });

    it("full flow: choose hand branch → select card → DRAW resolves", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const block = makeBlock([twoPayableBranches()]);
      const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);

      // Pick hand branch.
      const afterChoice = resumeFromStack(
        first.state,
        { type: "PLAYER_CHOICE", choiceId: "0" },
        cardDb,
      );
      expect(afterChoice.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

      const handBefore = afterChoice.state.players[0].hand;
      const selectedId = handBefore[0].instanceId;
      const deckSizeBefore = afterChoice.state.players[0].deck.length;

      const final = resumeFromStack(
        afterChoice.state,
        { type: "SELECT_TARGET", selectedInstanceIds: [selectedId] },
        cardDb,
      );

      const p0 = final.state.players[0];
      // Card was trashed from hand.
      expect(p0.hand.find((c) => c.instanceId === selectedId)).toBeUndefined();
      expect(p0.trash.find((c) => c.instanceId === selectedId)).toBeTruthy();
      // DRAW 1 should have fired.
      expect(p0.deck.length).toBe(deckSizeBefore - 1);
    });

    it("multi-cost branch: both costs in the branch are paid", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const block = makeBlock([multiCostBranch()]);
      const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);
      expect(first.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

      // Choose branch 1 (TRASH_FROM_HAND + DON_REST).
      const afterChoice = resumeFromStack(
        first.state,
        { type: "PLAYER_CHOICE", choiceId: "1" },
        cardDb,
      );

      // Should surface SELECT_TARGET for TRASH_FROM_HAND first.
      expect(afterChoice.pendingPrompt).toBeTruthy();
      expect(afterChoice.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");

      const selectedId = afterChoice.state.players[0].hand[0].instanceId;

      const final = resumeFromStack(
        afterChoice.state,
        { type: "SELECT_TARGET", selectedInstanceIds: [selectedId] },
        cardDb,
      );

      const p0 = final.state.players[0];
      // Hand card was trashed.
      expect(p0.trash.find((c) => c.instanceId === selectedId)).toBeTruthy();
      // DON_REST also paid (≥1 DON rested).
      const restedDon = p0.donCostArea.filter((d) => d.state === "RESTED");
      expect(restedDon.length).toBeGreaterThanOrEqual(1);
    });

    it("invalid branch index returns resolved: false", () => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);

      const block = makeBlock([twoPayableBranches()]);
      const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);

      const resumed = resumeFromStack(
        first.state,
        { type: "PLAYER_CHOICE", choiceId: "99" },
        cardDb,
      );

      expect(resumed.resolved).toBe(false);
    });
  });

  // ─── OPT-179: branch-expansion acceptance (hand vs character) ────────────

  describe("OPT-179: branch expansion — TRASH_FROM_HAND vs TRASH_OWN_CHARACTER", () => {
    function handOrCharacterChoice(): ChoiceCost {
      return {
        type: "CHOICE",
        options: [
          [{ type: "TRASH_FROM_HAND", amount: 1 }],
          [{ type: "TRASH_OWN_CHARACTER", amount: 1 }],
        ],
      };
    }

    function placeVanillaChar(
      state: ReturnType<typeof createBattleReadyState>,
    ): { state: ReturnType<typeof createBattleReadyState>; charId: string } {
      const charId = "char-0-vanilla";
      const vanilla: CardInstance = {
        instanceId: charId,
        cardId: CARDS.VANILLA.id,
        zone: "CHARACTER",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: 1,
        controller: 0,
        owner: 0,
      };
      return {
        state: withPlayer(state, 0, { characters: padChars([vanilla]) }),
        charId,
      };
    }

    it("branch 0 (hand): player picks hand branch → hand-pick prompt → effect resolves", () => {
      const cardDb = createTestCardDb();
      const base = createBattleReadyState(cardDb);
      const { state, charId } = placeVanillaChar(base);

      const block = makeBlock([handOrCharacterChoice()]);
      const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);
      expect(first.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

      const afterChoice = resumeFromStack(
        first.state,
        { type: "PLAYER_CHOICE", choiceId: "0" },
        cardDb,
      );
      expect(afterChoice.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

      const handCardId = afterChoice.state.players[0].hand[0].instanceId;
      const deckSizeBefore = afterChoice.state.players[0].deck.length;

      const final = resumeFromStack(
        afterChoice.state,
        { type: "SELECT_TARGET", selectedInstanceIds: [handCardId] },
        cardDb,
      );

      const p0 = final.state.players[0];
      // Hand card trashed.
      expect(p0.trash.find((c) => c.instanceId === handCardId)).toBeTruthy();
      // Character untouched.
      expect(p0.characters.some((c) => c?.instanceId === charId)).toBe(true);
      // DRAW resolved.
      expect(p0.deck.length).toBe(deckSizeBefore - 1);
    });

    it("branch 1 (character): player picks character branch → character-pick prompt → effect resolves", () => {
      const cardDb = createTestCardDb();
      const base = createBattleReadyState(cardDb);
      const { state, charId } = placeVanillaChar(base);

      const block = makeBlock([handOrCharacterChoice()]);
      const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, SOURCE_CHAR_ID, block);
      expect(first.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

      const afterChoice = resumeFromStack(
        first.state,
        { type: "PLAYER_CHOICE", choiceId: "1" },
        cardDb,
      );
      expect(afterChoice.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      if (afterChoice.pendingPrompt?.options.promptType === "SELECT_TARGET") {
        expect(afterChoice.pendingPrompt.options.validTargets).toContain(charId);
      }

      const handSizeBefore = afterChoice.state.players[0].hand.length;
      const deckSizeBefore = afterChoice.state.players[0].deck.length;

      const final = resumeFromStack(
        afterChoice.state,
        { type: "SELECT_TARGET", selectedInstanceIds: [charId] },
        cardDb,
      );

      const p0 = final.state.players[0];
      // Character trashed from field.
      expect(p0.characters.some((c) => c?.instanceId === charId)).toBe(false);
      expect(p0.trash.find((c) => c.instanceId === charId)).toBeTruthy();
      // Hand only gained the DRAW card — character branch did not take from hand.
      expect(p0.hand.length).toBe(handSizeBefore + 1);
      // DRAW resolved.
      expect(p0.deck.length).toBe(deckSizeBefore - 1);
    });
  });
});
