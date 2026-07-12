/**
 * TRASH_FROM_LIFE cost payment
 *
 * "Trash 1 card from the top of your Life cards" is deterministic — the rules
 * never let the player pick WHICH life card, only whether to pay. The cost
 * used to be classified as a selection cost, which raised a SELECT_TARGET
 * prompt whose card list was empty (life cards were never surfaced to the
 * modal) — the client had nothing to click and the game soft-locked
 * (EB03-054/055, OP03-121, OP08-101/117, OP15-099).
 *
 * The one genuine choice a life cost can offer is top-vs-bottom
 * (OP03-109 Charlotte Chiffon), which resolves through a PLAYER_CHOICE
 * prompt, mirroring LIFE_TO_HAND's TOP_OR_BOTTOM handling.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, PlayerState } from "../types.js";
import type { Cost, EffectBlock, EffectSchema } from "../engine/effect-types.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { isCostPayable, costNeedsPlayerSelection } from "../engine/effect-resolver/cost-handler.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { EB03_055_NICO_ROBIN } from "../engine/schemas/eb03.js";
import { OP03_109_CHARLOTTE_CHIFFON } from "../engine/schemas/op03.js";
import { createTestCardDb, createBattleReadyState, padChars } from "./helpers.js";

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

const SHC_LEADER: CardData = {
  id: "LEADER-SHC",
  name: "Straw Hat Leader",
  type: "Leader",
  color: ["Red"],
  cost: null,
  power: 5000,
  counter: null,
  life: 5,
  attribute: [],
  types: ["Straw Hat Crew"],
  effectText: "",
  triggerText: null,
  keywords: noKeywords(),
  effectSchema: null,
  imageUrl: null,
};

function boardWithLeader(leaderTrait: boolean): { state: GameState; cardDb: Map<string, CardData> } {
  const cardDb = createTestCardDb();
  cardDb.set(SHC_LEADER.id, SHC_LEADER);
  let state = createBattleReadyState(cardDb);
  if (leaderTrait) {
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], leader: { ...players[0].leader, cardId: SHC_LEADER.id } };
    state = { ...state, players };
  }
  return { state, cardDb };
}

describe("TRASH_FROM_LIFE cost — deterministic top-of-life payment (EB03-055)", () => {
  const onPlayBlock = EB03_055_NICO_ROBIN.effects[0] as unknown as EffectBlock;

  it("accepting the optional effect pays from the top of life with no target prompt", () => {
    const { state, cardDb } = boardWithLeader(true);
    const lifeBefore = state.players[0].life;
    const topLifeId = lifeBefore[0].instanceId;

    const start = resolveEffect(state, onPlayBlock, "char-0-v1", 0, cardDb);
    expect(start.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const step = resumeFromStack(start.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb);

    // The soft-lock regression: no SELECT_TARGET (or any other) prompt may
    // follow acceptance — the payment is fully deterministic.
    expect(step.pendingPrompt).toBeFalsy();
    expect(step.state.effectStack).toHaveLength(0);

    const p0 = step.state.players[0];
    // Top life card paid into the trash…
    expect(p0.trash.some((c) => c.instanceId === topLifeId)).toBe(true);
    expect(p0.life.some((l) => l.instanceId === topLifeId)).toBe(false);
    // …and the Straw Hat Crew gate passed: −1 (cost) +2 (added from deck).
    expect(p0.life.length).toBe(lifeBefore.length + 1);
    expect(step.events.some((e) => e.type === "CARD_TRASHED")).toBe(true);
  });

  it("still pays the cost when the post-cost leader gate fails", () => {
    const { state, cardDb } = boardWithLeader(false);
    const lifeBefore = state.players[0].life.length;

    const start = resolveEffect(state, onPlayBlock, "char-0-v1", 0, cardDb);
    const step = resumeFromStack(start.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb);

    expect(step.pendingPrompt).toBeFalsy();
    // Cost paid (Rules 8-3-1: the payment stands), gate blocked the add.
    expect(step.state.players[0].life.length).toBe(lifeBefore - 1);
  });

  it("is unpayable with no life cards and never asks for a card selection", () => {
    const { state, cardDb } = boardWithLeader(true);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], life: [] };
    const emptyLife = { ...state, players };

    const topCost: Cost = { type: "TRASH_FROM_LIFE", amount: 1, position: "TOP" } as Cost;
    expect(isCostPayable(emptyLife, topCost, 0, cardDb)).toBe(false);
    expect(isCostPayable(state, topCost, 0, cardDb)).toBe(true);
    expect(costNeedsPlayerSelection(topCost)).toBe(false);
    expect(costNeedsPlayerSelection({ type: "TRASH_FROM_LIFE", amount: 1 } as Cost)).toBe(false);
    expect(costNeedsPlayerSelection({ type: "TRASH_FROM_LIFE", amount: 1, position: "TOP_OR_BOTTOM" } as Cost)).toBe(true);
  });
});

describe("TRASH_FROM_LIFE cost — TOP_OR_BOTTOM offers a position choice (OP03-109)", () => {
  const onPlayBlock = OP03_109_CHARLOTTE_CHIFFON.effects[0] as unknown as EffectBlock;

  it("prompts PLAYER_CHOICE and pays from the chosen end", () => {
    const { state, cardDb } = boardWithLeader(true);
    const lifeBefore = state.players[0].life;
    const bottomLifeId = lifeBefore[lifeBefore.length - 1].instanceId;

    const start = resolveEffect(state, onPlayBlock, "char-0-v1", 0, cardDb);
    expect(start.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const accepted = resumeFromStack(start.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb);
    // A position choice, not a card selection — life stays hidden.
    expect(accepted.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");

    const step = resumeFromStack(accepted.state, { type: "PLAYER_CHOICE", choiceId: "1" } as GameAction, cardDb);
    expect(step.pendingPrompt).toBeFalsy();
    expect(step.state.effectStack).toHaveLength(0);

    const p0 = step.state.players[0];
    // Bottom life card paid into the trash…
    expect(p0.trash.some((c) => c.instanceId === bottomLifeId)).toBe(true);
    expect(p0.life.some((l) => l.instanceId === bottomLifeId)).toBe(false);
    // …then "add up to 1 from the top of your deck": −1 +1.
    expect(p0.life.length).toBe(lifeBefore.length);
    expect(step.events.some((e) => e.type === "CARD_TRASHED")).toBe(true);
  });
});

describe("TRASH_FROM_LIFE cost — life exits wake CARD_REMOVED_FROM_LIFE watchers (OPT-240)", () => {
  // Kalgara-style watcher: "when a card is removed from your Life, draw 1".
  const WATCHER_SCHEMA: EffectSchema = {
    card_id: "TEST-KALGARA",
    card_name: "Test Kalgara",
    card_type: "Character",
    effects: [
      {
        id: "life_removal_draw",
        category: "auto",
        trigger: { event: "CARD_REMOVED_FROM_LIFE", filter: { controller: "SELF" } },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ],
  } as unknown as EffectSchema;

  const WATCHER_DATA: CardData = {
    id: "TEST-KALGARA",
    name: "Test Kalgara",
    type: "Character",
    color: ["Yellow"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "When a card is removed from your Life cards, draw 1 card.",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: WATCHER_SCHEMA,
    imageUrl: null,
  };

  function boardWithWatcher(): { state: GameState; cardDb: Map<string, CardData> } {
    const { state, cardDb } = boardWithLeader(true);
    cardDb.set(WATCHER_DATA.id, WATCHER_DATA);
    const watcher: CardInstance = {
      instanceId: "watcher-0",
      cardId: WATCHER_DATA.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([watcher, ...players[0].characters.filter(Boolean) as CardInstance[]]),
    };
    let next = { ...state, players };
    next = registerTriggersForCard(next, watcher, WATCHER_DATA);
    return { state: next, cardDb };
  }

  it("fires when a deterministic TRASH_FROM_LIFE cost auto-pays (EB03-055)", () => {
    const { state, cardDb } = boardWithWatcher();
    const handBefore = state.players[0].hand.length;

    const start = resolveEffect(state, EB03_055_NICO_ROBIN.effects[0] as unknown as EffectBlock, "char-0-v1", 0, cardDb);
    const step = resumeFromStack(start.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb);

    expect(step.pendingPrompt).toBeFalsy();
    expect(step.events.some((e) => e.type === "CARD_REMOVED_FROM_LIFE")).toBe(true);
    // Watcher drew 1.
    expect(step.state.players[0].hand.length).toBe(handBefore + 1);
  });

  it("fires when a TOP_OR_BOTTOM position choice pays the cost (OP03-109)", () => {
    const { state, cardDb } = boardWithWatcher();
    const handBefore = state.players[0].hand.length;

    const start = resolveEffect(state, OP03_109_CHARLOTTE_CHIFFON.effects[0] as unknown as EffectBlock, "char-0-v1", 0, cardDb);
    const accepted = resumeFromStack(start.state, { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction, cardDb);
    expect(accepted.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    const step = resumeFromStack(accepted.state, { type: "PLAYER_CHOICE", choiceId: "1" } as GameAction, cardDb);

    expect(step.pendingPrompt).toBeFalsy();
    expect(step.events.some((e) => e.type === "CARD_REMOVED_FROM_LIFE")).toBe(true);
    expect(step.state.players[0].hand.length).toBe(handBefore + 1);
  });
});
