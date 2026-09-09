import { describe, expect, it } from "vitest";
import type { ActionOf } from "../engine/effect-types.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { OP03_083_CORGY } from "../engine/schemas/op03.js";
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

function productionCorgySearch(): ActionOf<"SEARCH_TRASH_THE_REST"> {
  const action = OP03_083_CORGY.effects
    .flatMap((effect) => effect.actions ?? [])
    .find((candidate) => candidate.type === "SEARCH_TRASH_THE_REST");
  if (!action || action.type !== "SEARCH_TRASH_THE_REST") {
    throw new Error("OP03-083 SEARCH_TRASH_THE_REST is missing");
  }
  return action;
}

function createSearchSetup(): {
  cardDb: Map<string, CardData>;
  state: GameState;
} {
  const cardDb = createTestCardDb();
  const cardIds = [
    "CORGY-PICK-ONE",
    "CORGY-REST-ONE",
    "CORGY-PICK-TWO",
    "CORGY-REST-TWO",
    "CORGY-REST-THREE",
    "CORGY-DECK-SIX",
  ];
  for (const cardId of cardIds) {
    cardDb.set(cardId, { ...CARDS.VANILLA, id: cardId, name: cardId });
  }

  const state = createBattleReadyState(cardDb);
  const topCards = cardIds.map((cardId, index) => ({
    ...state.players[0].deck[index],
    instanceId: `corgy-card-${index}`,
    cardId,
  }));
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    deck: [...topCards, ...players[0].deck.slice(cardIds.length)],
  };
  return { cardDb, state: { ...state, players } };
}

function startSearch(
  state: GameState,
  cardDb: Map<string, CardData>,
  action: ActionOf<"SEARCH_TRASH_THE_REST">,
): { result: ReturnType<typeof executeActionChain>; prompt: ArrangePrompt } {
  const result = executeActionChain(
    state,
    [action],
    state.players[0].leader.instanceId,
    0,
    cardDb,
  );
  expect(result.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
  if (result.pendingPrompt?.options.promptType !== "ARRANGE_TOP_CARDS") {
    throw new Error("Expected an ARRANGE_TOP_CARDS prompt");
  }
  return { result, prompt: result.pendingPrompt as ArrangePrompt };
}

function arrangeResponse(
  revealedIds: string[],
  keptIds: string[],
): Extract<GameAction, { type: "ARRANGE_TOP_CARDS" }> {
  return {
    type: "ARRANGE_TOP_CARDS",
    keptCardInstanceId: keptIds[0] ?? "",
    keptCardInstanceIds: keptIds,
    orderedInstanceIds: revealedIds.filter((id) => !keptIds.includes(id)),
    destination: "bottom",
  };
}

describe("OPT-773: SEARCH_TRASH_THE_REST pick destination", () => {
  it("runs OP03-083, trashes one pick, and bottoms the remaining looked-at cards", () => {
    const { cardDb, state } = createSearchSetup();
    const deckBefore = state.players[0].deck.map((card) => card.instanceId);
    const handBefore = state.players[0].hand.length;
    const trashBefore = state.players[0].trash.length;
    const { result, prompt } = startSearch(
      state,
      cardDb,
      productionCorgySearch(),
    );
    const revealedIds = prompt.options.cards.map((card) => card.instanceId);
    const response = arrangeResponse(revealedIds, [revealedIds[0]]);

    const resumed = resumeFromStack(result.state, response, cardDb);

    expect(resumed.state.players[0].hand).toHaveLength(handBefore);
    expect(resumed.state.players[0].trash).toHaveLength(trashBefore + 1);
    expect(resumed.state.players[0].trash[0]?.cardId).toBe("CORGY-PICK-ONE");
    expect(
      resumed.state.players[0].deck.slice(-4).map((card) => card.cardId),
    ).toEqual([
      "CORGY-REST-ONE",
      "CORGY-PICK-TWO",
      "CORGY-REST-TWO",
      "CORGY-REST-THREE",
    ]);
    expect(
      resumed.state.players[0].deck.map((card) => card.instanceId),
    ).toHaveLength(deckBefore.length - 1);
    expect(resumed.events.some((event) => event.type === "CARD_DRAWN")).toBe(
      false,
    );
    expect(
      resumed.events.filter((event) => event.type === "CARD_TRASHED"),
    ).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          cardInstanceId: "corgy-card-0",
          cardId: "CORGY-PICK-ONE",
          reason: "search_trash",
        }),
      }),
    ]);
  });

  it("puts two OP03-083 picks on top of trash in pick order", () => {
    const { cardDb, state } = createSearchSetup();
    const { result, prompt } = startSearch(
      state,
      cardDb,
      productionCorgySearch(),
    );
    const revealedIds = prompt.options.cards.map((card) => card.instanceId);
    const response = arrangeResponse(revealedIds, [
      revealedIds[0],
      revealedIds[2],
    ]);

    const resumed = resumeFromStack(result.state, response, cardDb);

    expect(
      resumed.state.players[0].trash.slice(0, 2).map((card) => card.cardId),
    ).toEqual(["CORGY-PICK-ONE", "CORGY-PICK-TWO"]);
    expect(resumed.events.some((event) => event.type === "CARD_DRAWN")).toBe(
      false,
    );
    expect(
      resumed.events.filter((event) => event.type === "CARD_TRASHED"),
    ).toHaveLength(2);
  });

  it("still trashes every unpicked card when rest_destination is TRASH", () => {
    const { cardDb, state } = createSearchSetup();
    const action: ActionOf<"SEARCH_TRASH_THE_REST"> = {
      ...productionCorgySearch(),
      params: {
        ...productionCorgySearch().params,
        pick: { up_to: 1 },
        pick_destination: "HAND",
        rest_destination: "TRASH",
      },
    };
    const { result, prompt } = startSearch(state, cardDb, action);
    const revealedIds = prompt.options.cards.map((card) => card.instanceId);
    const response = arrangeResponse(revealedIds, [revealedIds[0]]);

    const resumed = resumeFromStack(result.state, response, cardDb);

    expect(resumed.state.players[0].hand.at(-1)?.cardId).toBe(
      "CORGY-PICK-ONE",
    );
    expect(
      resumed.state.players[0].trash.slice(0, 4).map((card) => card.cardId),
    ).toEqual([
      "CORGY-REST-ONE",
      "CORGY-PICK-TWO",
      "CORGY-REST-TWO",
      "CORGY-REST-THREE",
    ]);
  });
});
