import { describe, expect, it } from "vitest";
import type { EffectBlock } from "../engine/effect-types.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import type { CardData, DonInstance, GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function withActiveDon(state: GameState, count: number): GameState {
  const donCostArea: DonInstance[] = state.players[0].donCostArea
    .slice(0, count)
    .map((don) => ({ ...don, state: "ACTIVE", attachedTo: null }));
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], donCostArea };
  return { ...state, players };
}

function offer(
  state: GameState,
  block: EffectBlock,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId = state.players[0].leader.instanceId,
) {
  return resolveEffect(state, block, sourceCardInstanceId, 0, cardDb);
}

describe("OPT-614 — transactional multi-cost payment", () => {
  it("restores earlier DON!! and discards staged events when variable payment is declined", () => {
    const cardDb = createTestCardDb();
    const state = withActiveDon(createBattleReadyState(cardDb), 3);
    const block: EffectBlock = {
      id: "opt614-decline",
      category: "activate",
      flags: { once_per_turn: true },
      costs: [
        { type: "REST_DON", amount: 1 },
        { type: "REST_SELF" },
        { type: "REST_DON", amount: "ANY_NUMBER" },
      ],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };

    const prompted = offer(state, block, cardDb);
    expect(prompted.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(prompted.state.players[0].donCostArea.every((don) => don.state === "ACTIVE"))
      .toBe(true);

    const declined = resumeFromStack(
      prompted.state,
      { type: "PLAYER_CHOICE", choiceId: "skip" },
      cardDb,
    );
    expect(declined.state.players[0].donCostArea.every((don) => don.state === "ACTIVE"))
      .toBe(true);
    expect(declined.state.players[0].leader.state).toBe("ACTIVE");
    expect(declined.state.players[0].hand).toEqual(state.players[0].hand);
    expect(declined.state.turn.oncePerTurnUsed).toEqual(state.turn.oncePerTurnUsed);
    expect(declined.events).toEqual([]);
  });

  it("restores a selected payment when a later cost becomes unpayable", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const source = state.players[0].characters[0]!;
    const block: EffectBlock = {
      id: "opt614-later-unpayable",
      category: "activate",
      flags: { once_per_turn: true },
      costs: [
        { type: "TRASH_OWN_CHARACTER", amount: 1 },
        { type: "REST_SELF" },
      ],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };

    const prompted = offer(state, block, cardDb, source.instanceId);
    expect(prompted.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const abandoned = resumeFromStack(
      prompted.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [source.instanceId] },
      cardDb,
    );
    expect(abandoned.state.players[0].characters).toEqual(state.players[0].characters);
    expect(abandoned.state.players[0].trash).toEqual(state.players[0].trash);
    expect(abandoned.state.players[0].hand).toEqual(state.players[0].hand);
    expect(abandoned.state.turn.oncePerTurnUsed).toEqual(state.turn.oncePerTurnUsed);
    expect(abandoned.events).toEqual([]);
  });

  it("publishes staged cost events only after the complete chain commits", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const handCard = state.players[0].hand[0];
    const handBefore = state.players[0].hand.length;
    const trashBefore = state.players[0].trash.length;
    const block: EffectBlock = {
      id: "opt614-success",
      category: "activate",
      costs: [
        { type: "REST_SELF" },
        { type: "TRASH_FROM_HAND", amount: 1 },
      ],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };

    const prompted = offer(state, block, cardDb);
    expect(prompted.state.players[0].leader.state).toBe("ACTIVE");
    expect(prompted.events).toEqual([]);

    const restored = JSON.parse(JSON.stringify(prompted.state)) as GameState;
    const committed = resumeFromStack(
      restored,
      { type: "SELECT_TARGET", selectedInstanceIds: [handCard.instanceId] },
      cardDb,
    );
    expect(committed.state.players[0].leader.state).toBe("RESTED");
    expect(committed.state.players[0].hand).toHaveLength(handBefore);
    expect(committed.state.players[0].trash).toHaveLength(trashBefore + 1);
    expect(committed.events.some((event) =>
      event.type === "CARD_STATE_CHANGED" &&
      event.payload?.targetInstanceId === state.players[0].leader.instanceId
    )).toBe(true);
  });

  it("offers only amounts whose complete suffix can pay, then resolves the action", () => {
    const cardDb = createTestCardDb();
    const state = withActiveDon(createBattleReadyState(cardDb), 3);
    const handBefore = state.players[0].hand.length;
    const block: EffectBlock = {
      id: "opt614-sequential-feasibility",
      category: "activate",
      costs: [
        { type: "REST_DON", amount: "ANY_NUMBER" },
        { type: "REST_DON", amount: 1 },
        { type: "REST_DON", amount: 1 },
      ],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };

    const prompted = offer(state, block, cardDb);
    expect(prompted.pendingPrompt?.options).toMatchObject({
      promptType: "PLAYER_CHOICE",
      choices: [{ id: "don-rest:1", label: "Rest 1" }],
    });

    const committed = resumeFromStack(
      prompted.state,
      { type: "PLAYER_CHOICE", choiceId: "don-rest:1" },
      cardDb,
    );
    expect(committed.pendingPrompt).toBeUndefined();
    expect(committed.state.players[0].donCostArea.every((don) => don.state === "RESTED"))
      .toBe(true);
    expect(committed.state.players[0].hand).toHaveLength(handBefore + 1);
  });
});
