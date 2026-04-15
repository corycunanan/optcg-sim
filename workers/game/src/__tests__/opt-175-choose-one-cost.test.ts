/**
 * OPT-175 — CHOOSE_ONE_COST primitive tests
 *
 * Covers:
 *   - Prompt lists all payable options when multiple are payable.
 *   - Auto-select when exactly one option is payable (no prompt).
 *   - cannotPay when no option is payable.
 *   - PLAYER_CHOICE resume picks the option and drives its selection flow.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, PlayerState } from "../types.js";
import type { Cost, EffectBlock } from "../engine/effect-types.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";
import { payCostsWithSelection } from "../engine/effect-resolver/cost-handler.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";

const CELESTIAL_CARD_ID = "TEST-CELESTIAL";

function celestialCardData(): CardData {
  return {
    id: CELESTIAL_CARD_ID,
    name: "Test Celestial Dragon",
    type: "Character",
    color: ["Black"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: ["Celestial Dragons"],
    effectText: "",
    triggerText: null,
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    },
    effectSchema: null,
    imageUrl: null,
  };
}

function imuChoiceCost(): Cost {
  return {
    type: "CHOOSE_ONE_COST",
    options: [
      { type: "TRASH_OWN_CHARACTER", amount: 1, filter: { traits: ["Celestial Dragons"] } },
      { type: "TRASH_FROM_HAND", amount: 1 },
    ],
  };
}

function makeBlock(costs: Cost[]): EffectBlock {
  return {
    id: "test-choose-one-block",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    costs,
    actions: [{ type: "DRAW", params: { amount: 1 } }],
    flags: { once_per_turn: true, optional: true },
  } as EffectBlock;
}

function placeCelestialChar(state: ReturnType<typeof createBattleReadyState>): {
  state: ReturnType<typeof createBattleReadyState>;
  charId: string;
} {
  const charId = "char-0-celestial";
  const celestial: CardInstance = {
    instanceId: charId,
    cardId: CELESTIAL_CARD_ID,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
  const p0 = state.players[0];
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[0] = { ...p0, characters: padChars([celestial]) };
  return { state: { ...state, players: newPlayers }, charId };
}

describe("OPT-175: CHOOSE_ONE_COST", () => {
  it("prompts with a choice per payable option when multiple are payable", () => {
    const cardDb = createTestCardDb();
    cardDb.set(CELESTIAL_CARD_ID, celestialCardData());
    const base = createBattleReadyState(cardDb);
    const { state, charId } = placeCelestialChar(base);

    // Hand must be non-empty for TRASH_FROM_HAND branch to be payable.
    expect(state.players[0].hand.length).toBeGreaterThan(0);

    const block = makeBlock([imuChoiceCost()]);
    const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, charId, block);

    expect(result.pendingPrompt).toBeTruthy();
    const prompt = result.pendingPrompt!;
    expect(prompt.options.promptType).toBe("PLAYER_CHOICE");
    if (prompt.options.promptType === "PLAYER_CHOICE") {
      expect(prompt.options.choices).toHaveLength(2);
      expect(prompt.options.choices.map((c) => c.id).sort()).toEqual(["0", "1"]);
    }
  });

  it("auto-selects when only one option is payable (no prompt)", () => {
    // No Celestial character on board → only TRASH_FROM_HAND is payable.
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    expect(state.players[0].hand.length).toBeGreaterThan(0);
    // No celestial dragons on p0 field.
    expect(state.players[0].characters.filter(Boolean).every((c) => c!.cardId !== CELESTIAL_CARD_ID)).toBe(true);

    const block = makeBlock([imuChoiceCost()]);
    const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, "char-0-v1", block);

    // Should fall through to the TRASH_FROM_HAND selection prompt directly.
    expect(result.pendingPrompt).toBeTruthy();
    expect(result.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");
  });

  it("returns cannotPay when neither option is payable", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    // Empty hand + no Celestial characters.
    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], hand: [], characters: padChars([]) };
    const state = { ...base, players: newPlayers };

    const block = makeBlock([imuChoiceCost()]);
    const result = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, "char-0-v1", block);

    expect(result.cannotPay).toBe(true);
    expect(result.pendingPrompt).toBeUndefined();
  });

  it("PLAYER_CHOICE response routes to the chosen option's selection prompt", () => {
    const cardDb = createTestCardDb();
    cardDb.set(CELESTIAL_CARD_ID, celestialCardData());
    const base = createBattleReadyState(cardDb);
    const { state, charId } = placeCelestialChar(base);

    const block = makeBlock([imuChoiceCost()]);
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, charId, block);
    expect(first.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    // Choose option "0" (trash Celestial Dragons character).
    const resumed = resumeFromStack(
      first.state,
      { type: "PLAYER_CHOICE", choiceId: "0" },
      cardDb,
    );

    // Should now surface a SELECT_TARGET prompt for the chosen option.
    expect(resumed.pendingPrompt).toBeTruthy();
    expect(resumed.pendingPrompt!.options.promptType).toBe("SELECT_TARGET");
    if (resumed.pendingPrompt!.options.promptType === "SELECT_TARGET") {
      expect(resumed.pendingPrompt!.options.validTargets).toContain(charId);
    }
  });

  it("full flow: choose hand branch → trash hand card → DRAW resolves", () => {
    const cardDb = createTestCardDb();
    cardDb.set(CELESTIAL_CARD_ID, celestialCardData());
    const base = createBattleReadyState(cardDb);
    const { state, charId } = placeCelestialChar(base);

    const block = makeBlock([imuChoiceCost()]);
    const first = payCostsWithSelection(state, block.costs!, 0, 0, cardDb, charId, block);
    expect(first.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    // Pick the hand branch.
    const afterChoice = resumeFromStack(first.state, { type: "PLAYER_CHOICE", choiceId: "1" }, cardDb);
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
    expect(p0.hand.find((c) => c.instanceId === selectedId)).toBeUndefined();
    expect(p0.trash.find((c) => c.instanceId === selectedId)).toBeTruthy();
    // DRAW 1 should have fired.
    expect(p0.deck.length).toBe(deckSizeBefore - 1);
    // Celestial character untouched.
    expect(p0.characters.some((c) => c?.instanceId === charId)).toBe(true);
  });
});
