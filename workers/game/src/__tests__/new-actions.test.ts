/**
 * Tests for new action types added to effect-resolver.ts
 *
 * Covers: RETURN_TO_DECK, PLAY_CARD, SET_DON_ACTIVE, TRASH_CARD,
 * NEGATE_EFFECTS, MODIFY_COST, HAND_WHEEL, SHUFFLE_DECK,
 * REST_OPPONENT_DON, RETURN_DON_TO_DECK, REVEAL,
 * Life card actions: TURN_LIFE_FACE_UP, TURN_LIFE_FACE_DOWN,
 * LIFE_TO_HAND, ADD_TO_LIFE_FROM_HAND, LIFE_CARD_TO_DECK,
 * PLAY_FROM_LIFE, TRASH_FACE_UP_LIFE, DRAIN_LIFE_TO_THRESHOLD
 */

import { describe, it, expect } from "vitest";
import { resolveEffect } from "../engine/effect-resolver.js";
import type { GameState, CardData, CardInstance, DonInstance } from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { setupGame, CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";
import { evaluateWhileConditions } from "../engine/duration-tracker.js";

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function makeEffectBlock(overrides: Partial<EffectBlock>): EffectBlock {
  return {
    id: "test-effect",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    ...overrides,
  };
}

function makeCharInstance(
  cardId: string,
  owner: 0 | 1,
  suffix: string,
  cardState: "ACTIVE" | "RESTED" = "ACTIVE",
): CardInstance {
  return {
    instanceId: `char-${owner}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: cardState,
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

// ─── RETURN_TO_DECK Tests ──────────────────────────────────────────────────────

describe("RETURN_TO_DECK action", () => {
  it("returns a character to the bottom of owner's deck", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Leave only 1 opponent character so no selection prompt
    const modState = {
      ...state,
      players: [
        state.players[0],
        { ...state.players[1], characters: [state.players[1].characters[0]] },
      ] as [typeof state.players[0], typeof state.players[1]],
    };
    const targetId = modState.players[1].characters[0].instanceId;
    const origDeckLen = modState.players[1].deck.length;

    const block = makeEffectBlock({
      actions: [{
        type: "RETURN_TO_DECK",
        target: {
          type: "CHARACTER",
          controller: "OPPONENT",
          count: { up_to: 1 },
          filter: { cost_max: 7 },
        },
        params: { position: "BOTTOM" },
      }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);

    // Character removed from opponent's field
    expect(result.state.players[1].characters.length).toBe(0);

    // Deck grew by 1
    expect(result.state.players[1].deck.length).toBe(origDeckLen + 1);
  });

  it("returns to top of deck when position is TOP", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Leave only 1 opponent character
    const modState = {
      ...state,
      players: [
        state.players[0],
        { ...state.players[1], characters: [state.players[1].characters[0]] },
      ] as [typeof state.players[0], typeof state.players[1]],
    };
    const targetCardId = modState.players[1].characters[0].cardId;

    const block = makeEffectBlock({
      actions: [{
        type: "RETURN_TO_DECK",
        target: {
          type: "CHARACTER",
          controller: "OPPONENT",
          count: { up_to: 1 },
        },
        params: { position: "TOP" },
      }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);

    // Card should be at the top of deck
    expect(result.state.players[1].deck[0].cardId).toBe(targetCardId);
  });

  it("prompts for selection when multiple valid targets exist", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    // 2 opponent characters means prompt needed

    const block = makeEffectBlock({
      actions: [{
        type: "RETURN_TO_DECK",
        target: {
          type: "CHARACTER",
          controller: "OPPONENT",
          count: { up_to: 1 },
        },
        params: { position: "BOTTOM" },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    // Should pause for player selection
    expect(result.resolved).toBe(false);
    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt!.promptType).toBe("SELECT_TARGET");
  });
});

// ─── PLAY_CARD Tests ───────────────────────────────────────────────────────────

describe("PLAY_CARD action", () => {
  it("plays a character from hand to field", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Reduce hand to 1 character card to avoid selection prompt
    const charCard = state.players[0].hand.find((c) => {
      const data = cardDb.get(c.cardId);
      return data?.type === "Character";
    });
    expect(charCard).toBeDefined();

    const modState = {
      ...state,
      players: [
        { ...state.players[0], hand: [charCard!] },
        state.players[1],
      ] as [typeof state.players[0], typeof state.players[1]],
    };
    const origCharCount = modState.players[0].characters.length;

    const block = makeEffectBlock({
      actions: [{
        type: "PLAY_CARD",
        target: {
          type: "CARD_IN_HAND",
          controller: "SELF",
          count: { up_to: 1 },
          filter: { card_type: "CHARACTER" },
        },
        params: { source_zone: "HAND", cost_override: "FREE" },
      }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);

    // Hand emptied
    expect(result.state.players[0].hand.length).toBe(0);
    // Characters grew
    expect(result.state.players[0].characters.length).toBe(origCharCount + 1);
  });
});

// ─── SET_DON_ACTIVE Tests ──────────────────────────────────────────────────────

describe("SET_DON_ACTIVE action", () => {
  it("sets rested DON!! to active", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Rest 3 DON!!
    const p0 = state.players[0];
    const newDonCostArea = p0.donCostArea.map((d, i) =>
      i < 3 ? { ...d, state: "RESTED" as const } : d,
    );
    const modState = {
      ...state,
      players: [
        { ...p0, donCostArea: newDonCostArea },
        state.players[1],
      ] as [typeof state.players[0], typeof state.players[1]],
    };

    const restedBefore = modState.players[0].donCostArea.filter((d) => d.state === "RESTED").length;
    expect(restedBefore).toBe(3);

    const block = makeEffectBlock({
      actions: [{
        type: "SET_DON_ACTIVE",
        params: { amount: 2 },
      }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);

    const restedAfter = result.state.players[0].donCostArea.filter((d) => d.state === "RESTED").length;
    expect(restedAfter).toBe(1);
  });

  it("returns false when no rested DON!! available", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    // All DON!! are already active

    const block = makeEffectBlock({
      actions: [{
        type: "SET_DON_ACTIVE",
        params: { amount: 1 },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    // The effect resolves but the action fails (no rested DON!!)
    expect(result.resolved).toBe(true);
  });
});

// ─── MODIFY_COST Tests ─────────────────────────────────────────────────────────

describe("MODIFY_COST action", () => {
  it("creates a cost-modifying active effect", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const origEffects = state.activeEffects.length;

    const block = makeEffectBlock({
      actions: [{
        type: "MODIFY_COST",
        target: {
          type: "CARD_IN_HAND",
          controller: "SELF",
          count: { all: true },
        },
        params: { amount: -1 },
        duration: { type: "THIS_TURN" },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.activeEffects.length).toBe(origEffects + 1);
  });
});

// ─── HAND_WHEEL Tests ──────────────────────────────────────────────────────────

describe("HAND_WHEEL action", () => {
  it("trashes cards then draws cards", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const origHandSize = state.players[0].hand.length;
    const origDeckSize = state.players[0].deck.length;
    const origTrashSize = state.players[0].trash.length;

    const block = makeEffectBlock({
      actions: [{
        type: "HAND_WHEEL",
        params: { trash_count: 2, draw_count: 2 },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);

    // Hand size should stay the same (trash 2, draw 2)
    expect(result.state.players[0].hand.length).toBe(origHandSize);
    // Deck shrunk by 2
    expect(result.state.players[0].deck.length).toBe(origDeckSize - 2);
    // Trash grew by 2
    expect(result.state.players[0].trash.length).toBe(origTrashSize + 2);
  });
});

// ─── SHUFFLE_DECK Tests ────────────────────────────────────────────────────────

describe("SHUFFLE_DECK action", () => {
  it("shuffles the controller's deck (deck length unchanged)", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const origDeckLen = state.players[0].deck.length;

    const block = makeEffectBlock({
      actions: [{ type: "SHUFFLE_DECK" }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].deck.length).toBe(origDeckLen);
  });
});

// ─── REST_OPPONENT_DON Tests ─────────────────────────────────────────────────

describe("REST_OPPONENT_DON action", () => {
  it("rests opponent's active DON!!", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const oppActiveBefore = state.players[1].donCostArea.filter((d) => d.state === "ACTIVE").length;
    expect(oppActiveBefore).toBeGreaterThan(0);

    const block = makeEffectBlock({
      actions: [{
        type: "REST_OPPONENT_DON",
        params: { amount: 2 },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);

    const oppActiveAfter = result.state.players[1].donCostArea.filter((d) => d.state === "ACTIVE").length;
    expect(oppActiveAfter).toBe(oppActiveBefore - 2);
  });
});

// ─── RETURN_DON_TO_DECK Tests ────────────────────────────────────────────────

describe("RETURN_DON_TO_DECK action", () => {
  it("returns DON!! from cost area to DON!! deck", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const origCostAreaLen = state.players[0].donCostArea.length;
    const origDonDeckLen = state.players[0].donDeck.length;

    const block = makeEffectBlock({
      actions: [{
        type: "RETURN_DON_TO_DECK",
        params: { amount: 2 },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);

    expect(result.state.players[0].donCostArea.length).toBe(origCostAreaLen - 2);
    expect(result.state.players[0].donDeck.length).toBe(origDonDeckLen + 2);
  });
});

// ─── REVEAL Tests ────────────────────────────────────────────────────────────

describe("REVEAL action", () => {
  it("reveals top card(s) of deck", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    const block = makeEffectBlock({
      actions: [{
        type: "REVEAL",
        params: { amount: 1, source: "DECK" },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.some((e) => e.type === "CARDS_REVEALED")).toBe(true);
  });
});

// ─── NEGATE_EFFECTS Tests ────────────────────────────────────────────────────

describe("NEGATE_EFFECTS action", () => {
  it("removes active effects from negated card", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // First, apply a MODIFY_POWER effect from char-1-v1 (uses SELF target, no prompt)
    const buffBlock = makeEffectBlock({
      actions: [{
        type: "MODIFY_POWER",
        target: { type: "SELF" },
        params: { amount: 2000 },
        duration: { type: "THIS_TURN" },
      }],
    });
    const buffResult = resolveEffect(state, buffBlock, "char-1-v1", 1, cardDb);
    expect(buffResult.state.activeEffects.length).toBe(1);

    // Reduce to 1 opponent character to avoid prompt
    const modState = {
      ...buffResult.state,
      players: [
        buffResult.state.players[0],
        { ...buffResult.state.players[1], characters: [buffResult.state.players[1].characters[0]] },
      ] as [typeof buffResult.state.players[0], typeof buffResult.state.players[1]],
    };

    // Now negate that card's effects
    const negateBlock = makeEffectBlock({
      actions: [{
        type: "NEGATE_EFFECTS",
        target: {
          type: "CHARACTER",
          controller: "OPPONENT",
          count: { up_to: 1 },
        },
      }],
    });

    const negateResult = resolveEffect(modState, negateBlock, "char-0-v1", 0, cardDb);
    expect(negateResult.resolved).toBe(true);
    expect(negateResult.state.activeEffects.length).toBe(0);
  });
});

// ─── LIFE CARD ACTION Tests ──────────────────────────────────────────────────

describe("Life card actions", () => {
  it("TURN_LIFE_FACE_UP turns life cards face up", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // All life cards start face down
    expect(state.players[0].life.every((l) => l.face === "DOWN")).toBe(true);

    const block = makeEffectBlock({
      actions: [{
        type: "TURN_LIFE_FACE_UP",
        params: { amount: 2 },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);

    const faceUp = result.state.players[0].life.filter((l) => l.face === "UP");
    expect(faceUp.length).toBe(2);
  });

  it("TURN_LIFE_FACE_DOWN turns life cards face down", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Turn some face up first
    const modState = {
      ...state,
      players: [
        {
          ...state.players[0],
          life: state.players[0].life.map((l, i) =>
            i < 2 ? { ...l, face: "UP" as const } : l,
          ),
        },
        state.players[1],
      ] as [typeof state.players[0], typeof state.players[1]],
    };

    const block = makeEffectBlock({
      actions: [{
        type: "TURN_LIFE_FACE_DOWN",
        params: { amount: 2 },
      }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].life.filter((l) => l.face === "UP").length).toBe(0);
  });

  it("TURN_ALL_LIFE_FACE_DOWN turns all life face down", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Turn all face up
    const modState = {
      ...state,
      players: [
        {
          ...state.players[0],
          life: state.players[0].life.map((l) => ({ ...l, face: "UP" as const })),
        },
        state.players[1],
      ] as [typeof state.players[0], typeof state.players[1]],
    };

    const block = makeEffectBlock({
      actions: [{ type: "TURN_ALL_LIFE_FACE_DOWN" }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].life.every((l) => l.face === "DOWN")).toBe(true);
  });

  it("LIFE_TO_HAND moves top life card to hand", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const origLifeLen = state.players[0].life.length;
    const origHandLen = state.players[0].hand.length;

    const block = makeEffectBlock({
      actions: [{
        type: "LIFE_TO_HAND",
        params: { amount: 1 },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].life.length).toBe(origLifeLen - 1);
    expect(result.state.players[0].hand.length).toBe(origHandLen + 1);
  });

  it("ADD_TO_LIFE_FROM_HAND moves hand card to life", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const origLifeLen = state.players[0].life.length;
    const origHandLen = state.players[0].hand.length;

    const block = makeEffectBlock({
      actions: [{
        type: "ADD_TO_LIFE_FROM_HAND",
        params: { amount: 1, face: "DOWN", position: "TOP" },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].life.length).toBe(origLifeLen + 1);
    expect(result.state.players[0].hand.length).toBe(origHandLen - 1);
    // Top life card should be face down
    expect(result.state.players[0].life[0].face).toBe("DOWN");
  });

  it("LIFE_CARD_TO_DECK moves life card to bottom of deck", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const origLifeLen = state.players[0].life.length;
    const origDeckLen = state.players[0].deck.length;

    const block = makeEffectBlock({
      actions: [{
        type: "LIFE_CARD_TO_DECK",
        params: { amount: 1, position: "BOTTOM" },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].life.length).toBe(origLifeLen - 1);
    expect(result.state.players[0].deck.length).toBe(origDeckLen + 1);
  });

  it("TRASH_FACE_UP_LIFE trashes only face-up life cards", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Turn 2 life cards face up
    const modState = {
      ...state,
      players: [
        {
          ...state.players[0],
          life: state.players[0].life.map((l, i) =>
            i < 2 ? { ...l, face: "UP" as const } : l,
          ),
        },
        state.players[1],
      ] as [typeof state.players[0], typeof state.players[1]],
    };

    const origLifeLen = modState.players[0].life.length;
    const origTrashLen = modState.players[0].trash.length;

    const block = makeEffectBlock({
      actions: [{ type: "TRASH_FACE_UP_LIFE" }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].life.length).toBe(origLifeLen - 2);
    expect(result.state.players[0].trash.length).toBe(origTrashLen + 2);
    // All remaining life should be face down
    expect(result.state.players[0].life.every((l) => l.face === "DOWN")).toBe(true);
  });

  it("DRAIN_LIFE_TO_THRESHOLD drains excess life cards", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const origLifeLen = state.players[0].life.length;
    expect(origLifeLen).toBe(5);

    const block = makeEffectBlock({
      actions: [{
        type: "DRAIN_LIFE_TO_THRESHOLD",
        params: { threshold: 3 },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].life.length).toBe(3);
  });

  it("LIFE_SCRY emits event without modifying state", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    const block = makeEffectBlock({
      actions: [{
        type: "LIFE_SCRY",
        params: { look_at: 1 },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.events.some((e) => e.type === "LIFE_SCRIED")).toBe(true);
    // Life unchanged
    expect(result.state.players[0].life.length).toBe(state.players[0].life.length);
  });
});

// ─── TRASH_CARD Tests ────────────────────────────────────────────────────────

describe("TRASH_CARD action", () => {
  it("trashes a character from opponent's field", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Reduce to 1 opponent character to avoid prompt
    const modState = {
      ...state,
      players: [
        state.players[0],
        { ...state.players[1], characters: [state.players[1].characters[0]] },
      ] as [typeof state.players[0], typeof state.players[1]],
    };
    const origTrashLen = modState.players[1].trash.length;

    const block = makeEffectBlock({
      actions: [{
        type: "TRASH_CARD",
        target: {
          type: "CHARACTER",
          controller: "OPPONENT",
          count: { up_to: 1 },
        },
      }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[1].characters.length).toBe(0);
    expect(result.state.players[1].trash.length).toBe(origTrashLen + 1);
  });
});

// ─── RETURN_HAND_TO_DECK Tests ───────────────────────────────────────────────

describe("RETURN_HAND_TO_DECK action", () => {
  it("returns entire hand to deck", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const origHandLen = state.players[0].hand.length;
    const origDeckLen = state.players[0].deck.length;
    expect(origHandLen).toBeGreaterThan(0);

    const block = makeEffectBlock({
      actions: [{
        type: "RETURN_HAND_TO_DECK",
        params: { position: "BOTTOM" },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].hand.length).toBe(0);
    expect(result.state.players[0].deck.length).toBe(origDeckLen + origHandLen);
  });
});

// ─── Integration: Action Chains ──────────────────────────────────────────────

describe("Action chain integration", () => {
  it("THEN chain: draw then shuffle", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const origHandLen = state.players[0].hand.length;

    const block = makeEffectBlock({
      actions: [
        { type: "DRAW", params: { amount: 1 } },
        { type: "SHUFFLE_DECK", chain: "THEN" },
      ],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].hand.length).toBe(origHandLen + 1);
  });

  it("IF_DO chain: conditional second action", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Reduce to 1 opponent character to avoid prompt
    const modState = {
      ...state,
      players: [
        state.players[0],
        { ...state.players[1], characters: [state.players[1].characters[0]] },
      ] as [typeof state.players[0], typeof state.players[1]],
    };

    // KO an opponent character, then IF_DO draw
    const block = makeEffectBlock({
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { up_to: 1 },
            filter: { cost_max: 3 },
          },
        },
        { type: "DRAW", params: { amount: 1 }, chain: "IF_DO" },
      ],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    // Should have drawn since KO succeeded
    expect(result.events.some((e) => e.type === "CARD_DRAWN")).toBe(true);
  });
});

// ─── CARD_IN_TRASH targeting Tests ───────────────────────────────────────────

describe("CARD_IN_TRASH targeting", () => {
  it("RETURN_TO_HAND retrieves a card from trash to hand", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Put a card in the trash
    const trashCard: CardInstance = {
      instanceId: "trash-card-1",
      cardId: CARDS.VANILLA.id,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const modState = {
      ...state,
      players: [
        { ...state.players[0], trash: [trashCard, ...state.players[0].trash] },
        state.players[1],
      ] as [typeof state.players[0], typeof state.players[1]],
    };
    const origHandLen = modState.players[0].hand.length;

    const block = makeEffectBlock({
      actions: [{
        type: "RETURN_TO_HAND",
        target: {
          type: "CARD_IN_TRASH",
          controller: "SELF",
          count: { up_to: 1 },
          filter: { card_type: "CHARACTER" },
        },
      }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].hand.length).toBe(origHandLen + 1);
    // Trash should have shrunk
    expect(result.state.players[0].trash.length).toBe(modState.players[0].trash.length - 1);
  });

  it("filters trash targets correctly", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Put an event card in trash — should NOT match CHARACTER filter
    const eventTrash: CardInstance = {
      instanceId: "trash-event-1",
      cardId: CARDS.EVENT_COUNTER.id,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const modState = {
      ...state,
      players: [
        { ...state.players[0], trash: [eventTrash] },
        state.players[1],
      ] as [typeof state.players[0], typeof state.players[1]],
    };

    const block = makeEffectBlock({
      actions: [{
        type: "RETURN_TO_HAND",
        target: {
          type: "CARD_IN_TRASH",
          controller: "SELF",
          count: { up_to: 1 },
          filter: { card_type: "CHARACTER" },
        },
      }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    // No valid targets so action fails but effect resolves
    expect(result.resolved).toBe(true);
    // Hand unchanged
    expect(result.state.players[0].hand.length).toBe(modState.players[0].hand.length);
  });
});

// ─── PER_COUNT dynamic value Tests ───────────────────────────────────────────

describe("PER_COUNT dynamic value resolution", () => {
  it("resolves +1000 per hand card (Smiley pattern)", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const handSize = state.players[0].hand.length;
    expect(handSize).toBeGreaterThan(0);

    const block = makeEffectBlock({
      actions: [{
        type: "MODIFY_POWER",
        target: { type: "SELF" },
        params: {
          amount: { type: "PER_COUNT", source: "HAND_COUNT", multiplier: 1000 },
        },
        duration: { type: "THIS_TURN" },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);

    // Should have created an active effect with amount = handSize * 1000
    const powerEvent = result.events.find((e) => e.type === "POWER_MODIFIED");
    expect(powerEvent).toBeDefined();
    expect(powerEvent!.payload!.amount).toBe(handSize * 1000);
  });

  it("resolves PER_COUNT with divisor (Mr.1 pattern: +1000 per 2 events in trash)", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Add 5 event cards to trash
    const eventCards: CardInstance[] = Array.from({ length: 5 }, (_, i) => ({
      instanceId: `trash-event-${i}`,
      cardId: CARDS.EVENT_COUNTER.id,
      zone: "TRASH" as const,
      state: "ACTIVE" as const,
      attachedDon: [],
      turnPlayed: null,
      controller: 0 as const,
      owner: 0 as const,
    }));

    const modState = {
      ...state,
      players: [
        { ...state.players[0], trash: [...eventCards, ...state.players[0].trash] },
        state.players[1],
      ] as [typeof state.players[0], typeof state.players[1]],
    };

    const block = makeEffectBlock({
      actions: [{
        type: "MODIFY_POWER",
        target: { type: "SELF" },
        params: {
          amount: { type: "PER_COUNT", source: "EVENTS_IN_TRASH", multiplier: 1000, divisor: 2 },
        },
        duration: { type: "THIS_TURN" },
      }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);

    // 5 events / 2 = 2 (floor), * 1000 = 2000
    const powerEvent = result.events.find((e) => e.type === "POWER_MODIFIED");
    expect(powerEvent).toBeDefined();
    expect(powerEvent!.payload!.amount).toBe(2000);
  });
});

// ─── WHILE_CONDITION Tests ───────────────────────────────────────────────────

describe("WHILE_CONDITION effect evaluation", () => {
  it("removes effect when condition becomes false", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Create a WHILE_CONDITION effect: "if hand >= 5"
    const effect = {
      id: "test-while",
      sourceCardInstanceId: "char-0-v1",
      sourceEffectBlockId: "",
      category: "permanent",
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 1000 } }],
      duration: {
        type: "WHILE_CONDITION",
        condition: { type: "HAND_COUNT", controller: "SELF", operator: ">=", value: 5 },
      },
      expiresAt: { wave: "CONDITION_FALSE" },
      controller: 0,
      appliesTo: ["char-0-v1"],
      timestamp: Date.now(),
    };

    // State where hand has 5 cards — condition true
    const stateWithEffect = {
      ...state,
      activeEffects: [effect as any],
    };

    // Evaluate — should keep effect (condition true: hand >= 5)
    const handSize = stateWithEffect.players[0].hand.length;
    expect(handSize).toBeGreaterThanOrEqual(5);
    const result1 = evaluateWhileConditions(stateWithEffect, cardDb);
    expect(result1.activeEffects.length).toBe(1);

    // Now reduce hand to 2 cards — condition should become false
    const smallHandState = {
      ...stateWithEffect,
      players: [
        { ...stateWithEffect.players[0], hand: stateWithEffect.players[0].hand.slice(0, 2) },
        stateWithEffect.players[1],
      ] as [typeof stateWithEffect.players[0], typeof stateWithEffect.players[1]],
    };

    const result2 = evaluateWhileConditions(smallHandState, cardDb);
    expect(result2.activeEffects.length).toBe(0);
  });
});

// ─── REVEAL_HAND Tests ──────────────────────────────────────────────────────

describe("REVEAL_HAND action", () => {
  it("reveals all cards when hand size equals amount", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Set opponent hand to exactly 2 cards
    const modState = {
      ...state,
      players: [
        state.players[0],
        { ...state.players[1], hand: state.players[1].hand.slice(0, 2) },
      ] as [typeof state.players[0], typeof state.players[1]],
    };

    const block = makeEffectBlock({
      actions: [{
        type: "REVEAL_HAND",
        target: { controller: "OPPONENT" },
        params: { amount: 2 },
      }],
    });

    const result = resolveEffect(modState, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.events.some((e) => e.type === "CARDS_REVEALED")).toBe(true);
  });

  it("prompts for selection when hand has more cards than amount", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    // Opponent has 5 cards in hand, we want to reveal 2

    const block = makeEffectBlock({
      actions: [{
        type: "REVEAL_HAND",
        target: { controller: "OPPONENT" },
        params: { amount: 2 },
      }],
    });

    const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
    expect(result.resolved).toBe(false);
    expect(result.pendingPrompt).toBeDefined();
    expect(result.pendingPrompt!.promptType).toBe("SELECT_TARGET");
    expect(result.pendingPrompt!.options.blindSelection).toBe(true);
  });
});

// ─── PLAY_SELF Tests ─────────────────────────────────────────────────────────

describe("PLAY_SELF action", () => {
  it("plays the source card from hand to field", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Use a hand card as the source
    const handCard = state.players[0].hand[0];
    const origCharCount = state.players[0].characters.length;
    const origHandLen = state.players[0].hand.length;

    const block = makeEffectBlock({
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    });

    const result = resolveEffect(state, block, handCard.instanceId, 0, cardDb);
    expect(result.resolved).toBe(true);

    // Card moved from hand to characters
    expect(result.state.players[0].hand.length).toBe(origHandLen - 1);
    expect(result.state.players[0].characters.length).toBe(origCharCount + 1);

    // CARD_PLAYED event emitted
    expect(result.events.some((e) => e.type === "CARD_PLAYED")).toBe(true);
  });

  it("plays the source card from trash to field", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);

    // Put a character card in trash
    const trashCard: CardInstance = {
      instanceId: "play-self-trash",
      cardId: CARDS.VANILLA.id,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const modState = {
      ...state,
      players: [
        { ...state.players[0], trash: [trashCard, ...state.players[0].trash] },
        state.players[1],
      ] as [typeof state.players[0], typeof state.players[1]],
    };
    const origCharCount = modState.players[0].characters.length;

    const block = makeEffectBlock({
      trigger: { keyword: "TRIGGER" },
      actions: [{ type: "PLAY_SELF" }],
    });

    const result = resolveEffect(modState, block, "play-self-trash", 0, cardDb);
    expect(result.resolved).toBe(true);
    expect(result.state.players[0].characters.length).toBe(origCharCount + 1);
    // Trash shrunk
    expect(result.state.players[0].trash.length).toBe(modState.players[0].trash.length - 1);
  });
});
