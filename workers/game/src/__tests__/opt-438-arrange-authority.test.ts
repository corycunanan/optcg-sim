import { describe, expect, it } from "vitest";
import type { GameAction, ResumeContext } from "../types.js";
import type { Action } from "../engine/effect-types.js";
import { executeSearchDeck } from "../engine/effect-resolver/actions/draw-search.js";
import { resumeEffectChain } from "../engine/effect-resolver/resume.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function searchPrompt(action: Action) {
  const cardDb = createTestCardDb();
  const state = createBattleReadyState(cardDb);
  const result = executeSearchDeck(
    state,
    action,
    state.players[0].leader.instanceId,
    0,
    cardDb,
    new Map()
  );
  expect(result.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
  return { cardDb, state, prompt: result.pendingPrompt! };
}

describe("OPT-438: authoritative ARRANGE resolution", () => {
  it("treats empty validTargets as no selectable card", () => {
    const { cardDb, state, prompt } = searchPrompt({
      type: "SEARCH_DECK",
      params: {
        look_at: 3,
        filter: { name: "no-card-has-this-name" },
        rest_destination: "BOTTOM",
      },
    });
    if (prompt.options.promptType !== "ARRANGE_TOP_CARDS")
      throw new Error("expected arrange prompt");
    expect(prompt.options.validTargets).toEqual([]);

    const revealed = prompt.options.cards.map((card) => card.instanceId);
    const handBefore = state.players[0].hand.length;
    const response: GameAction = {
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: revealed[0],
      orderedInstanceIds: revealed.slice(1),
      destination: "top",
    };
    const resumed = resumeEffectChain(
      state,
      prompt.resumeContext as ResumeContext,
      response,
      cardDb
    );

    expect(resumed.state.players[0].hand).toHaveLength(handBefore);
    expect(
      resumed.state.players[0].deck.map((card) => card.instanceId)
    ).toContain(revealed[0]);
  });

  it("uses the schema rest destination instead of the client destination", () => {
    const { cardDb, state, prompt } = searchPrompt({
      type: "SEARCH_DECK",
      params: { look_at: 2, rest_destination: "BOTTOM" },
    });
    if (prompt.options.promptType !== "ARRANGE_TOP_CARDS")
      throw new Error("expected arrange prompt");
    const ordered = prompt.options.cards
      .map((card) => card.instanceId)
      .reverse();

    const resumed = resumeEffectChain(
      state,
      prompt.resumeContext as ResumeContext,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ordered,
        destination: "top",
      },
      cardDb
    );

    expect(
      resumed.state.players[0].deck.slice(-2).map((card) => card.instanceId)
    ).toEqual(ordered);
  });
});
