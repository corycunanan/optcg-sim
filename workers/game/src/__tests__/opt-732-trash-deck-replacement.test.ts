import { describe, expect, it } from "vitest";
import type { Action, EffectResult } from "../engine/effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import {
  executeKO,
  executeReturnToHand,
} from "../engine/effect-resolver/actions/removal.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { findCardInstance } from "../engine/state.js";
import { OP17_095_RORONOA_ZORO } from "../engine/schemas/op17.js";
import { registerReplacementsForCard } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function trashCard(card: CardData, index: number): CardInstance {
  return {
    instanceId: `opt732-trash-${index}`,
    cardId: card.id,
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
}

function buildState(trashCount: number) {
  const cardDb = createTestCardDb();
  const zoroData: CardData = {
    ...CARDS.VANILLA,
    id: "OP17-095",
    name: "Roronoa Zoro",
    cost: 4,
    power: 6000,
    effectSchema: OP17_095_RORONOA_ZORO,
  };
  cardDb.set(zoroData.id, zoroData);

  const base = createBattleReadyState(cardDb);
  const zoro: CardInstance = {
    instanceId: "opt732-zoro",
    cardId: zoroData.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
  const protectedCharacter = base.players[0].characters.find(
    (card) => card !== null
  )!;
  const trashPool = [CARDS.VANILLA, CARDS.RUSH, CARDS.BLOCKER, CARDS.DOUBLE_ATK]
    .slice(0, trashCount)
    .map(trashCard);
  const players = [...base.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    characters: padChars([zoro, protectedCharacter]),
    trash: trashPool,
  };
  const state = registerReplacementsForCard(
    { ...base, players },
    zoro,
    zoroData
  );
  return { state, cardDb, zoro, protectedCharacter, trashPool };
}

function attemptOpponentRemoval(
  state: GameState,
  cardDb: Map<string, CardData>,
  targetId: string
) {
  const action: Action = {
    type: "RETURN_TO_HAND",
    target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
  };
  return executeReturnToHand(
    state,
    action,
    "opt732-opponent-source",
    1,
    cardDb,
    new Map<string, EffectResult>(),
    [targetId],
    resolverExecutionServices
  );
}

function attemptOpponentKO(
  state: GameState,
  cardDb: Map<string, CardData>,
  targetId: string
) {
  const action: Action = {
    type: "KO",
    target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
  };
  return executeKO(
    state,
    action,
    "opt732-opponent-source",
    1,
    cardDb,
    new Map<string, EffectResult>(),
    [targetId],
    resolverExecutionServices
  );
}

describe("OPT-732 OP17-095 trash-to-deck replacement pipeline", () => {
  it("encodes the printed cost-12 power clause and exact Trash replacement contract", () => {
    expect(OP17_095_RORONOA_ZORO.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "permanent",
          conditions: {
            type: "BOARD_WIDE_EXISTENCE",
            filter: { card_type: "CHARACTER", cost_min: 12 },
          },
          modifiers: [
            {
              type: "MODIFY_POWER",
              target: { type: "SELF" },
              params: { amount: 3000 },
            },
          ],
        }),
        expect.objectContaining({
          category: "replacement",
          replaces: {
            event: "WOULD_BE_REMOVED_FROM_FIELD",
            target_filter: { controller: "SELF", card_type: "CHARACTER" },
            cause_filter: { by: "OPPONENT_EFFECT" },
          },
          replacement_actions: [
            {
              type: "RETURN_TO_DECK",
              target: {
                type: "CARD_IN_TRASH",
                controller: "SELF",
                count: { exact: 3 },
              },
              params: { position: "BOTTOM" },
              requires: { type: "FULL_TARGET_COUNT" },
            },
          ],
          flags: { optional: true },
        }),
      ])
    );
  });

  it("offers the replacement and moves exactly three Trash cards to the deck bottom in the owner's order", () => {
    const { state, cardDb, protectedCharacter, trashPool } = buildState(4);
    const deckBefore = state.players[0].deck.length;
    const removal = attemptOpponentRemoval(
      state,
      cardDb,
      protectedCharacter.instanceId
    );

    expect(removal.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const accepted = resumePromptLifecycle(
      { ...removal.state, pendingPrompt: removal.pendingPrompt! },
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
      {
        drainPregame: (nextState) => nextState,
        advanceStartOfTurn: (nextState) => nextState,
      }
    );

    expect(accepted.responseRejected).toBe(false);
    expect(accepted.state.pendingPrompt?.options.promptType).toBe(
      "SELECT_TARGET"
    );
    const selected = [trashPool[3], trashPool[1], trashPool[0]];
    const selectedResult = resumePromptLifecycle(
      accepted.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: selected.map((card) => card.instanceId),
      },
      cardDb,
      {
        drainPregame: (nextState) => nextState,
        advanceStartOfTurn: (nextState) => nextState,
      }
    );

    expect(selectedResult.state.pendingPrompt?.options.promptType).toBe(
      "ARRANGE_TOP_CARDS"
    );
    const ordered = [selected[1], selected[2], selected[0]];
    const arranged = resumePromptLifecycle(
      selectedResult.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ordered.map((card) => card.instanceId),
        destination: "bottom",
      },
      cardDb,
      {
        drainPregame: (nextState) => nextState,
        advanceStartOfTurn: (nextState) => nextState,
      }
    );

    expect(arranged.responseRejected).toBe(false);
    expect(arranged.state.pendingPrompt).toBeNull();
    expect(
      findCardInstance(arranged.state, protectedCharacter.instanceId)?.zone
    ).toBe("CHARACTER");
    expect(
      arranged.state.players[0].trash.map((card) => card.instanceId)
    ).toEqual([trashPool[2].instanceId]);
    expect(arranged.state.players[0].deck).toHaveLength(deckBefore + 3);
    expect(
      arranged.state.players[0].deck.slice(-3).map((card) => card.cardId)
    ).toEqual(ordered.map((card) => card.cardId));
  });

  it("offers the replacement with exactly three Trash cards and moves all three to the deck bottom", () => {
    const { state, cardDb, protectedCharacter, trashPool } = buildState(3);
    const deckBefore = state.players[0].deck.length;
    const removal = attemptOpponentRemoval(
      state,
      cardDb,
      protectedCharacter.instanceId
    );

    expect(removal.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const accepted = resumePromptLifecycle(
      { ...removal.state, pendingPrompt: removal.pendingPrompt! },
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
      {
        drainPregame: (nextState) => nextState,
        advanceStartOfTurn: (nextState) => nextState,
      }
    );

    expect(accepted.state.pendingPrompt?.options.promptType).toBe(
      "ARRANGE_TOP_CARDS"
    );
    const arranged = resumePromptLifecycle(
      accepted.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: trashPool.map((card) => card.instanceId),
        destination: "bottom",
      },
      cardDb,
      {
        drainPregame: (nextState) => nextState,
        advanceStartOfTurn: (nextState) => nextState,
      }
    );

    expect(arranged.responseRejected).toBe(false);
    expect(arranged.state.pendingPrompt).toBeNull();
    expect(
      findCardInstance(arranged.state, protectedCharacter.instanceId)?.zone
    ).toBe("CHARACTER");
    expect(arranged.state.players[0].trash).toEqual([]);
    expect(arranged.state.players[0].deck).toHaveLength(deckBefore + 3);
    expect(
      arranged.state.players[0].deck.slice(-3).map((card) => card.cardId)
    ).toEqual(trashPool.map((card) => card.cardId));
  });

  it("rejects selecting fewer than exactly three Trash cards before accepting three", () => {
    const { state, cardDb, protectedCharacter, trashPool } = buildState(4);
    const deckBefore = state.players[0].deck.length;
    const removal = attemptOpponentRemoval(
      state,
      cardDb,
      protectedCharacter.instanceId
    );
    const accepted = resumePromptLifecycle(
      { ...removal.state, pendingPrompt: removal.pendingPrompt! },
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
      {
        drainPregame: (nextState) => nextState,
        advanceStartOfTurn: (nextState) => nextState,
      }
    );

    expect(accepted.state.pendingPrompt?.options.promptType).toBe(
      "SELECT_TARGET"
    );
    let promptState = accepted.state;
    for (const selectionSize of [0, 1, 2]) {
      const rejected = resumePromptLifecycle(
        promptState,
        {
          type: "SELECT_TARGET",
          selectedInstanceIds: trashPool
            .slice(0, selectionSize)
            .map((card) => card.instanceId),
        },
        cardDb,
        {
          drainPregame: (nextState) => nextState,
          advanceStartOfTurn: (nextState) => nextState,
        }
      );

      expect(rejected.responseRejected).toBe(true);
      expect(rejected.state.pendingPrompt?.options.promptType).toBe(
        "SELECT_TARGET"
      );
      expect(
        rejected.state.players[0].trash.map((card) => card.instanceId)
      ).toEqual(trashPool.map((card) => card.instanceId));
      expect(rejected.state.players[0].deck).toHaveLength(deckBefore);
      promptState = rejected.state;
    }

    const selectedCards = trashPool.slice(0, 3);
    const selected = resumePromptLifecycle(
      promptState,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: selectedCards.map((card) => card.instanceId),
      },
      cardDb,
      {
        drainPregame: (nextState) => nextState,
        advanceStartOfTurn: (nextState) => nextState,
      }
    );

    expect(selected.responseRejected).toBe(false);
    expect(selected.state.pendingPrompt?.options.promptType).toBe(
      "ARRANGE_TOP_CARDS"
    );
    const arranged = resumePromptLifecycle(
      selected.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: selectedCards.map((card) => card.instanceId),
        destination: "bottom",
      },
      cardDb,
      {
        drainPregame: (nextState) => nextState,
        advanceStartOfTurn: (nextState) => nextState,
      }
    );

    expect(arranged.responseRejected).toBe(false);
    expect(
      findCardInstance(arranged.state, protectedCharacter.instanceId)?.zone
    ).toBe("CHARACTER");
    expect(
      arranged.state.players[0].trash.map((card) => card.instanceId)
    ).toEqual([trashPool[3].instanceId]);
    expect(arranged.state.players[0].deck).toHaveLength(deckBefore + 3);
  });

  it("intercepts an opponent-effect KO and protects the Character after paying the replacement", () => {
    const { state, cardDb, protectedCharacter, trashPool } = buildState(3);
    const deckBefore = state.players[0].deck.length;
    const removal = attemptOpponentKO(
      state,
      cardDb,
      protectedCharacter.instanceId
    );

    expect(removal.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const accepted = resumePromptLifecycle(
      { ...removal.state, pendingPrompt: removal.pendingPrompt! },
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
      {
        drainPregame: (nextState) => nextState,
        advanceStartOfTurn: (nextState) => nextState,
      }
    );

    expect(accepted.state.pendingPrompt?.options.promptType).toBe(
      "ARRANGE_TOP_CARDS"
    );
    const arranged = resumePromptLifecycle(
      accepted.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: trashPool.map((card) => card.instanceId),
        destination: "bottom",
      },
      cardDb,
      {
        drainPregame: (nextState) => nextState,
        advanceStartOfTurn: (nextState) => nextState,
      }
    );

    expect(arranged.responseRejected).toBe(false);
    expect(arranged.state.pendingPrompt).toBeNull();
    expect(
      findCardInstance(arranged.state, protectedCharacter.instanceId)?.zone
    ).toBe("CHARACTER");
    expect(arranged.state.players[0].trash).toEqual([]);
    expect(arranged.state.players[0].deck).toHaveLength(deckBefore + 3);
  });

  it("does not offer the replacement with only two cards in Trash", () => {
    const { state, cardDb, protectedCharacter, trashPool } = buildState(2);
    const removal = attemptOpponentRemoval(
      state,
      cardDb,
      protectedCharacter.instanceId
    );

    expect(removal.pendingPrompt).toBeUndefined();
    expect(
      findCardInstance(removal.state, protectedCharacter.instanceId)
    ).toBeNull();
    expect(
      removal.state.players[0].hand.some(
        (card) => card.cardId === protectedCharacter.cardId
      )
    ).toBe(true);
    expect(removal.state.players[0].trash).toEqual(trashPool);
  });
});
