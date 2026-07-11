import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession.js";
import type { CardData, CardInstance, Env, GameAction, GameState, PlayerState } from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { EB01_030_LOGUETOWN } from "../engine/schemas/eb01.js";
import { createBattleReadyState, createTestCardDb, CARDS } from "./helpers.js";

class MockWebSocket {
  sent: string[] = [];
  send(payload: string): void { this.sent.push(payload); }
  close(): void {}
  serializeAttachment(_attachment: unknown): void {}
  deserializeAttachment(): unknown { return null; }
}

class MockDurableObjectState {
  storage = { put: async () => undefined, get: async () => undefined, setAlarm: async () => undefined, deleteAlarm: async () => undefined };
  acceptWebSocket(): void {}
  getWebSockets(): WebSocket[] { return []; }
  getTags(): string[] { return []; }
}

type TestAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  handleAction(ws: WebSocket, playerIndex: 0 | 1, action: GameAction): Promise<void>;
};

describe("OPT-460 — EB01-030 Loguetown compound cost", () => {
  it("offers the activation and pays the Stage plus a chosen hand card in the chosen order", async () => {
    const cardDb = createTestCardDb();
    const stageData: CardData = {
      ...CARDS.VANILLA,
      id: "EB01-030",
      name: "Loguetown",
      type: "Stage",
      power: null,
      effectSchema: EB01_030_LOGUETOWN,
    };
    cardDb.set(stageData.id, stageData);
    let state = createBattleReadyState(cardDb);
    const stage: CardInstance = {
      instanceId: "loguetown", cardId: stageData.id, zone: "STAGE", state: "ACTIVE",
      attachedDon: [], turnPlayed: 1, controller: 0, owner: 0,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      stage,
      hand: [
        ...players[0].hand,
        {
          ...players[0].deck[0],
          instanceId: "extra-hand-card",
          zone: "HAND" as const,
          controller: 0,
          owner: 0,
        },
      ],
    };
    state = { ...state, players };

    const block = EB01_030_LOGUETOWN.effects.find((effect) => effect.id === "activate_draw")!;
    expect(isCostPayable(state, block.costs![0], 0, cardDb, stage.instanceId)).toBe(true);
    const activation = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: stage.instanceId, effectId: block.id },
      cardDb,
      0,
    );
    expect(activation.valid).toBe(true);
    expect(activation.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    const session = new GameSession(
      new MockDurableObjectState() as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
    ) as unknown as TestAccess;
    session.gameState = { ...activation.state, pendingPrompt: { ...activation.pendingPrompt!, promptId: "optional" } };
    session.cardDb = cardDb;
    const ws = new MockWebSocket();
    const chosen = session.gameState.players[0].hand[0];
    const handBefore = session.gameState.players[0].hand.length;

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "PLAYER_CHOICE", choiceId: "activate", promptId: "optional",
    } as GameAction);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET", selectedInstanceIds: [chosen.instanceId], promptId: session.gameState.pendingPrompt?.promptId,
    } as GameAction);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: [chosen.instanceId, stage.instanceId],
      destination: "bottom",
      promptId: session.gameState.pendingPrompt?.promptId,
    } as GameAction);

    const p0 = session.gameState.players[0];
    expect(p0.stage).toBeNull();
    expect(p0.hand).toHaveLength(handBefore + 1); // pay 1, then Draw 2
    expect(p0.deck.slice(-2).map((card) => card.cardId)).toEqual([chosen.cardId, stage.cardId]);
    expect(p0.deck.at(-2)?.instanceId).toBe(chosen.instanceId);
    expect(p0.deck.at(-1)?.instanceId).not.toBe(stage.instanceId);
    expect(session.gameState.effectStack).toHaveLength(0);
    expect(session.gameState.pendingPrompt).toBeFalsy();
  });
});
