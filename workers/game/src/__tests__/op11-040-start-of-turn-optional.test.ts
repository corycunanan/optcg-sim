import { describe, expect, it } from "vitest";
import { isStartOfTurnAutoPhase } from "../engine/phases.js";
import { runPipeline, type PipelineResult } from "../engine/pipeline.js";
import { OP11_040_MONKEY_D_LUFFY } from "../engine/schemas/op11.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import type { CardData, GameState, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

const PRINTED_EFFECT =
  "This effect can be activated at the start of your turn. If you have 8 or more DON!! cards on your field, look at 5 cards from the top of your deck; reveal up to 1 {Straw Hat Crew} type card and add it to your hand. Then, place the rest at the top or bottom of the deck in any order.";
const MULTI_CLAUSE_EFFECT = `${PRINTED_EFFECT}\n[Trigger] Draw 1 card.`;

function setup(
  donCount = 8,
  effectText = PRINTED_EFFECT
): {
  state: GameState;
  cardDb: Map<string, CardData>;
  deckOrder: string[];
  handSize: number;
  strawHatDeckIds: string[];
} {
  const cardDb = createTestCardDb();
  let state = createBattleReadyState(cardDb);
  const leader = state.players[1].leader;
  const leaderData = cardDb.get(leader.cardId);
  const searchableCard = state.players[1].deck[1];
  const searchableCardData = cardDb.get(searchableCard.cardId);
  if (!leaderData || !searchableCardData) {
    throw new Error("Expected leader and deck card data in the test database");
  }

  cardDb.set(leader.cardId, {
    ...leaderData,
    effectText,
    effectSchema: OP11_040_MONKEY_D_LUFFY,
  });
  cardDb.set(searchableCard.cardId, {
    ...searchableCardData,
    types: ["Straw Hat Crew"],
  });

  const players = [...state.players] as [PlayerState, PlayerState];
  players[1] = {
    ...players[1],
    donCostArea: Array.from({ length: donCount }, (_, index) => ({
      instanceId: `op11-040-don-${index}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    })),
  };
  state = { ...state, players };
  state = registerTriggersForCard(state, leader, cardDb.get(leader.cardId)!);

  return {
    state,
    cardDb,
    deckOrder: state.players[1].deck.map((card) => card.instanceId),
    handSize: state.players[1].hand.length,
    strawHatDeckIds: state.players[1].deck
      .filter((card) =>
        cardDb.get(card.cardId)?.types.includes("Straw Hat Crew")
      )
      .map((card) => card.instanceId),
  };
}

function offerStartOfTurnSearch(donCount = 8, effectText = PRINTED_EFFECT) {
  const fixture = setup(donCount, effectText);
  const offered = runPipeline(
    fixture.state,
    { type: "ADVANCE_PHASE" },
    fixture.cardDb,
    0
  );
  return { ...fixture, offered };
}

function advanceStartOfTurn(
  initialState: GameState,
  cardDb: Map<string, CardData>
): GameState {
  let state = initialState;
  while (state.status === "IN_PROGRESS" && isStartOfTurnAutoPhase(state)) {
    const result = runPipeline(
      state,
      { type: "ADVANCE_PHASE" },
      cardDb,
      state.turn.activePlayerIndex
    );
    if (!result.valid) throw new Error(result.error ?? "Phase advance failed");
    state = result.state;
  }
  return state;
}

function declineOptional(
  offered: PipelineResult,
  cardDb: Map<string, CardData>
) {
  if (offered.pendingPrompt?.options.promptType !== "OPTIONAL_EFFECT") {
    throw new Error("Expected OPTIONAL_EFFECT before declining OP11-040");
  }
  return resumePromptLifecycle(
    offered.state,
    { type: "PLAYER_CHOICE", choiceId: "skip" },
    cardDb,
    {
      drainPregame: (state) => state,
      advanceStartOfTurn: (state) => advanceStartOfTurn(state, cardDb),
    }
  );
}

function acceptOptional(
  offered: PipelineResult,
  cardDb: Map<string, CardData>
) {
  if (offered.pendingPrompt?.options.promptType !== "OPTIONAL_EFFECT") {
    throw new Error("Expected OPTIONAL_EFFECT before accepting OP11-040");
  }
  return resumePromptLifecycle(
    offered.state,
    { type: "PLAYER_CHOICE", choiceId: "accept" },
    cardDb,
    {
      drainPregame: (state) => state,
      advanceStartOfTurn: (state) => advanceStartOfTurn(state, cardDb),
    }
  );
}

describe("OP11-040 start-of-turn search", () => {
  it("offers the incoming player an optional activation with the printed effect", () => {
    const { offered } = offerStartOfTurnSearch();
    const prompt = offered.pendingPrompt;

    expect(prompt?.respondingPlayer).toBe(1);
    expect(prompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    if (prompt?.options.promptType !== "OPTIONAL_EFFECT") {
      throw new Error("Expected OP11-040's optional activation prompt");
    }
    expect(prompt.options.effectDescription).toBe(PRINTED_EFFECT);
  });

  it("declines without searching and continues through DON!! to MAIN", () => {
    const { cardDb, deckOrder, handSize, strawHatDeckIds, offered } =
      offerStartOfTurnSearch();
    const declined = declineOptional(offered, cardDb);

    expect(declined.responseRejected).toBe(false);
    expect(declined.state.pendingPrompt).toBeNull();
    expect(declined.state.players[1].hand).toHaveLength(handSize + 1);
    expect(
      declined.state.players[1].deck.map((card) => card.instanceId)
    ).toEqual(deckOrder.slice(1));
    expect(
      declined.state.players[1].deck
        .filter((card) =>
          cardDb.get(card.cardId)?.types.includes("Straw Hat Crew")
        )
        .map((card) => card.instanceId)
    ).toEqual(strawHatDeckIds);
    expect(declined.state.players[1].donCostArea).toHaveLength(10);
    expect(declined.state.turn).toMatchObject({
      activePlayerIndex: 1,
      phase: "MAIN",
    });
  });

  it("opens the arrange prompt with the same description after acceptance", () => {
    const { cardDb, offered } = offerStartOfTurnSearch();
    const accepted = acceptOptional(offered, cardDb);

    expect(accepted.responseRejected).toBe(false);
    const prompt = accepted.state.pendingPrompt;
    expect(prompt?.respondingPlayer).toBe(1);
    expect(prompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    if (prompt?.options.promptType !== "ARRANGE_TOP_CARDS") {
      throw new Error("Expected OP11-040's arrange prompt");
    }
    expect(prompt.options.effectDescription).toBe(PRINTED_EFFECT);
  });

  // OPT-765 restores the accepted arrange prompt's clause-scoped description.
  it("uses source_text for the optional prompt when the card has another clause", () => {
    const { offered } = offerStartOfTurnSearch(8, MULTI_CLAUSE_EFFECT);
    const optionalPrompt = offered.pendingPrompt;

    expect(optionalPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    if (optionalPrompt?.options.promptType !== "OPTIONAL_EFFECT") {
      throw new Error("Expected OP11-040's optional activation prompt");
    }
    expect(optionalPrompt.options.effectDescription).toBe(PRINTED_EFFECT);
  });

  it("does not prompt below the 8-DON!! condition", () => {
    const { cardDb, offered } = offerStartOfTurnSearch(7);

    expect(offered.pendingPrompt).toBeUndefined();
    const advanced = advanceStartOfTurn(offered.state, cardDb);
    expect(advanced.pendingPrompt).toBeNull();
    expect(advanced.turn).toMatchObject({
      activePlayerIndex: 1,
      phase: "MAIN",
    });
  });
});
