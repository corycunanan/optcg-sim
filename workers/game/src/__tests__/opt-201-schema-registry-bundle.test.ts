import { describe, expect, it } from "vitest";
import { buildInitialState } from "../engine/setup.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { CARDS, createTestPayload, padChars } from "./factories.js";

describe("OPT-201 generated schema registry", () => {
  it("injects schemas from multiple sets and executes one through the production pipeline", () => {
    const payload = createTestPayload();
    const leader: CardData = {
      ...payload.player1.leader.cardData,
      id: "ST30-001",
      name: "Luffy & Ace",
      effectSchema: null,
    };
    const activator: CardData = {
      ...CARDS.RUSH,
      id: "OP16-049",
      name: "Portgas.D.Ace",
      effectSchema: null,
    };
    payload.player1 = {
      ...payload.player1,
      leader: { cardId: leader.id, quantity: 1, cardData: leader },
      deck: payload.player1.deck.map((entry) =>
        entry.cardId === CARDS.RUSH.id
          ? {
              cardId: activator.id,
              quantity: entry.quantity,
              cardData: activator,
            }
          : entry
      ),
      testOrder: payload.player1.testOrder && {
        ...payload.player1.testOrder,
        hand: payload.player1.testOrder.hand.map((cardId) =>
          cardId === CARDS.RUSH.id ? activator.id : cardId
        ),
      },
    };

    const initialized = buildInitialState(payload);
    expect(initialized.cardDb.get("ST30-001")?.effectSchema?.card_id).toBe(
      "ST30-001"
    );
    expect(initialized.cardDb.get("OP16-049")?.effectSchema?.card_id).toBe(
      "OP16-049"
    );

    const card: CardInstance = {
      instanceId: "op16-049-field",
      cardId: "OP16-049",
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const players = [
      ...initialized.state.players,
    ] as typeof initialized.state.players;
    players[0] = {
      ...players[0],
      characters: padChars([card]),
    };
    const state = {
      ...initialized.state,
      players,
      turn: {
        ...initialized.state.turn,
        number: 2,
        activePlayerIndex: 0 as const,
        phase: "MAIN" as const,
      },
    };

    const handBefore = state.players[0].hand.length;
    const activation = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: card.instanceId,
        effectId: "activate_draw",
      },
      initialized.cardDb,
      0
    );

    expect(activation.valid).toBe(true);
    expect(activation.pendingPrompt?.options.promptType).toBe(
      "OPTIONAL_EFFECT"
    );

    const result = resumeFromStack(
      activation.state,
      { type: "PLAYER_CHOICE", choiceId: "activate" } as GameAction,
      initialized.cardDb
    );
    expect(result.state.players[0].characters[0]?.state).toBe("RESTED");
    expect(result.state.players[0].hand).toHaveLength(handBefore + 1);
  });
});
