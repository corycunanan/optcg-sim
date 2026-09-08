import { describe, expect, it } from "vitest";
import type { Action, ActionOf } from "../engine/effect-types.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { OP04_046_QUEEN } from "../engine/schemas/op04.js";
import { SessionCoordinator } from "../session/coordinator.js";
import type {
  CardData,
  GameAction,
  GameState,
  PendingPromptState,
  PlayerState,
} from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

type ArrangePrompt = PendingPromptState & {
  options: Extract<
    PendingPromptState["options"],
    { promptType: "ARRANGE_TOP_CARDS" }
  >;
};

function productionQueenSearch(): ActionOf<"SEARCH_DECK"> {
  const action = OP04_046_QUEEN.effects
    .flatMap((effect) => effect.actions ?? [])
    .find((candidate) => candidate.type === "SEARCH_DECK");
  if (!action || action.type !== "SEARCH_DECK") {
    throw new Error("OP04-046 SEARCH_DECK is missing");
  }
  return action;
}

function withDeckCards(state: GameState, cardIds: string[]): GameState {
  const topCards = cardIds.map((cardId, index) => ({
    ...state.players[0].deck[index],
    instanceId: `search-card-${index}`,
    cardId,
  }));
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    deck: [...topCards, ...players[0].deck.slice(cardIds.length)],
  };
  return { ...state, players };
}

function createQueenSearchSetup(): {
  cardDb: Map<string, CardData>;
  state: GameState;
} {
  const cardDb = createTestCardDb();
  cardDb.set("PLAGUE-ROUNDS", {
    ...CARDS.EVENT_COUNTER,
    id: "PLAGUE-ROUNDS",
    name: "Plague Rounds",
  });
  cardDb.set("ICE-ONI", {
    ...CARDS.VANILLA,
    id: "ICE-ONI",
    name: "Ice Oni",
  });
  const state = withDeckCards(createBattleReadyState(cardDb), [
    "PLAGUE-ROUNDS",
    CARDS.VANILLA.id,
    "ICE-ONI",
    CARDS.VANILLA.id,
    CARDS.VANILLA.id,
    CARDS.VANILLA.id,
    CARDS.VANILLA.id,
  ]);
  return { cardDb, state };
}

function startSearch(
  state: GameState,
  cardDb: Map<string, CardData>,
  action: Action
) {
  const result = executeActionChain(
    state,
    [action],
    state.players[0].leader.instanceId,
    0,
    cardDb
  );
  expect(result.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
  if (result.pendingPrompt?.options.promptType !== "ARRANGE_TOP_CARDS") {
    throw new Error("Expected an ARRANGE_TOP_CARDS prompt");
  }
  return { result, prompt: result.pendingPrompt as ArrangePrompt };
}

function arrangeResponse(
  revealedIds: string[],
  keptIds: string[]
): Extract<GameAction, { type: "ARRANGE_TOP_CARDS" }> {
  return {
    type: "ARRANGE_TOP_CARDS",
    keptCardInstanceId: keptIds[0] ?? "",
    keptCardInstanceIds: keptIds,
    orderedInstanceIds: revealedIds.filter((id) => !keptIds.includes(id)),
    destination: "bottom",
  };
}

describe("OPT-772 search multi-pick", () => {
  it("runs OP04-046 and keeps two matching top-five cards in hand with one reveal event", () => {
    const { cardDb, state } = createQueenSearchSetup();
    const handBefore = state.players[0].hand.length;
    const { result, prompt } = startSearch(
      state,
      cardDb,
      productionQueenSearch()
    );
    const keptIds = ["search-card-0", "search-card-2"];
    const response = arrangeResponse(
      prompt.options.cards.map((card) => card.instanceId),
      keptIds
    );

    const resumed = resumeFromStack(result.state, response, cardDb);

    expect(resumed.state.players[0].hand).toHaveLength(handBefore + 2);
    expect(
      resumed.state.players[0].hand.slice(-2).map((card) => card.cardId)
    ).toEqual(["PLAGUE-ROUNDS", "ICE-ONI"]);
    expect(
      resumed.events.filter((event) => event.type === "CARDS_REVEALED")
    ).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          cards: [
            { instanceId: "search-card-0", cardId: "PLAGUE-ROUNDS" },
            { instanceId: "search-card-2", cardId: "ICE-ONI" },
          ],
        }),
      }),
    ]);
  });

  it("advertises OP04-046 pick.up_to as maxKeep", () => {
    const { cardDb, state } = createQueenSearchSetup();
    const { prompt } = startSearch(state, cardDb, productionQueenSearch());

    expect(prompt.options.maxKeep).toBe(2);
  });

  it("keeps two SEARCH_TRASH_THE_REST cards and sends the remainder to rest_destination", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const handBefore = state.players[0].hand.length;
    const trashBefore = state.players[0].trash.length;
    const action: ActionOf<"SEARCH_TRASH_THE_REST"> = {
      type: "SEARCH_TRASH_THE_REST",
      params: {
        look_at: 5,
        pick: { up_to: 2 },
        filter: {},
        rest_destination: "TRASH",
      },
    };
    const { result, prompt } = startSearch(state, cardDb, action);
    const revealedIds = prompt.options.cards.map((card) => card.instanceId);
    const response = arrangeResponse(revealedIds, revealedIds.slice(0, 2));

    const resumed = resumeFromStack(result.state, response, cardDb);

    expect(resumed.state.players[0].hand).toHaveLength(handBefore + 2);
    expect(resumed.state.players[0].trash).toHaveLength(trashBefore + 3);
    expect(
      resumed.state.players[0].deck.map((card) => card.instanceId)
    ).not.toEqual(expect.arrayContaining(revealedIds));
  });

  it("rejects three kept ids when pick.up_to is two", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const action: ActionOf<"SEARCH_DECK"> = {
      type: "SEARCH_DECK",
      params: { look_at: 5, pick: { up_to: 2 }, filter: {} },
    };
    const { result, prompt } = startSearch(state, cardDb, action);
    const revealedIds = prompt.options.cards.map((card) => card.instanceId);
    const response = arrangeResponse(revealedIds, revealedIds.slice(0, 3));
    const promptedState = { ...result.state, pendingPrompt: prompt };

    expect(
      new SessionCoordinator().routePromptResponse(promptedState, 0, response)
    ).toMatchObject({ kind: "reject", reason: "Too many cards were selected" });
  });

  it("rejects a kept id outside validTargets", () => {
    const { cardDb, state } = createQueenSearchSetup();
    const { result, prompt } = startSearch(
      state,
      cardDb,
      productionQueenSearch()
    );
    const revealedIds = prompt.options.cards.map((card) => card.instanceId);
    const invalidId = revealedIds.find(
      (id) => !prompt.options.validTargets?.includes(id)
    );
    if (!invalidId) throw new Error("Expected a revealed non-matching card");
    const response = arrangeResponse(revealedIds, [invalidId]);
    const promptedState = { ...result.state, pendingPrompt: prompt };

    expect(
      new SessionCoordinator().routePromptResponse(promptedState, 0, response)
    ).toMatchObject({
      kind: "reject",
      reason: "That card is not a valid pick",
    });
  });
});
