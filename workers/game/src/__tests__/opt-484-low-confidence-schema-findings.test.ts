import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import {
  resolveEffect,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { validateEffectSchema } from "../engine/schema-registry.js";
import { ST12_017_PLASTIC_SURGERY_SHOT } from "../engine/schemas/st12.js";
import { ST22_011_WHITEY_BAY } from "../engine/schemas/st22.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

function withPlayer(
  state: GameState,
  index: 0 | 1,
  patch: Partial<PlayerState>
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[index] = { ...players[index], ...patch };
  return { ...state, players };
}

describe("OPT-484: corrected schemas validate semantically", () => {
  it.each([
    ["ST12-017", ST12_017_PLASTIC_SURGERY_SHOT],
    ["ST22-011", ST22_011_WHITEY_BAY],
  ] as const)("%s has no schema validation errors", (cardId, schema) => {
    expect(validateEffectSchema(schema, cardId)).toEqual([]);
  });
});

describe("OPT-484: ST12-017 Plastic Surgery Shot", () => {
  it("lets the player return the unplayed revealed card to either deck edge", () => {
    const cardDb = createTestCardDb();
    const revealedData: CardData = {
      ...CARDS.RUSH,
      id: "ST12-017-REVEALED",
      name: "Revealed cost-2 Character",
    };
    cardDb.set(revealedData.id, revealedData);

    let state = createBattleReadyState(cardDb);
    const revealed: CardInstance = {
      ...state.players[0].deck[0],
      instanceId: "st12-017-revealed",
      cardId: revealedData.id,
    };
    state = withPlayer(state, 0, {
      deck: [revealed, ...state.players[0].deck.slice(1)],
    });

    const offered = resolveEffect(
      state,
      ST12_017_PLASTIC_SURGERY_SHOT.effects[0] as EffectBlock,
      state.players[0].leader.instanceId,
      0,
      cardDb
    );
    expect(offered.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const revealPrompt = resumeFromStack(
      offered.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [] },
      cardDb
    );
    expect(revealPrompt.pendingPrompt?.options).toMatchObject({
      promptType: "ARRANGE_TOP_CARDS",
      canSendToBottom: true,
      restDestination: "TOP_OR_BOTTOM",
    });

    const returnedToTop = resumeFromStack(
      revealPrompt.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: [revealed.instanceId],
        destination: "top",
      },
      cardDb
    );
    expect(returnedToTop.resolved).toBe(true);
    expect(returnedToTop.state.players[0].deck[0].instanceId).toBe(
      revealed.instanceId
    );
  });
});

describe("OPT-484: ST22-011 Whitey Bay", () => {
  function scene(leaderTypes: string[]) {
    const cardDb = createTestCardDb();
    const leaderData: CardData = { ...CARDS.LEADER, types: leaderTypes };
    cardDb.set(leaderData.id, leaderData);

    for (const cardId of [CARDS.VANILLA.id, CARDS.RUSH.id]) {
      const card = cardDb.get(cardId)!;
      cardDb.set(cardId, { ...card, types: ["Whitebeard Pirates"] });
    }

    const state = createBattleReadyState(cardDb);
    return { cardDb, leaderData, state };
  }

  function acceptAndPayRevealCost(
    state: GameState,
    cardDb: Map<string, CardData>
  ) {
    const offered = resolveEffect(
      state,
      ST22_011_WHITEY_BAY.effects[0] as EffectBlock,
      state.players[0].characters[0]!.instanceId,
      0,
      cardDb
    );
    expect(offered.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const accepted = resumeFromStack(
      offered.state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb
    );
    expect(accepted.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (accepted.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected the reveal-cost target prompt");
    }

    return resumeFromStack(
      accepted.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: accepted.pendingPrompt.options.validTargets.slice(
          0,
          2
        ),
      },
      cardDb
    );
  }

  it("does not boost a Leader outside the Whitebeard Pirates type", () => {
    const { cardDb, leaderData, state } = scene(["Navy"]);
    const resolved = acceptAndPayRevealCost(state, cardDb);

    expect(resolved.resolved).toBe(true);
    expect(
      getEffectivePower(
        state.players[0].leader,
        leaderData,
        resolved.state,
        cardDb
      )
    ).toBe(5000);
    expect(resolved.state.activeEffects).toHaveLength(0);
  });

  it("boosts a Whitebeard Pirates Leader after the reveal cost is paid", () => {
    const { cardDb, leaderData, state } = scene(["Whitebeard Pirates"]);
    const resolved = acceptAndPayRevealCost(state, cardDb);

    expect(resolved.resolved).toBe(true);
    expect(
      getEffectivePower(
        state.players[0].leader,
        leaderData,
        resolved.state,
        cardDb
      )
    ).toBe(7000);
    expect(resolved.state.activeEffects).toEqual([
      expect.objectContaining({
        appliesTo: [state.players[0].leader.instanceId],
      }),
    ]);
  });
});
