import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession.js";
import type { CardData, CardInstance, Env, GameAction, GameState, PlayerState } from "../types.js";
import type { Cost, EffectBlock, RuntimeActiveEffect } from "../engine/effect-types.js";
import { payCostsWithSelection } from "../engine/effect-resolver/cost-handler.js";
import { createBattleReadyState, createTestCardDb, CARDS, padChars } from "./helpers.js";

class MockWebSocket {
  sent: string[] = [];
  send(payload: string): void { this.sent.push(payload); }
  close(): void {}
  serializeAttachment(_attachment: unknown): void {}
  deserializeAttachment(): unknown { return null; }
}

class MockDurableObjectState {
  storage = {
    put: async () => undefined,
    get: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };
  acceptWebSocket(): void {}
  getWebSockets(): WebSocket[] { return []; }
  getTags(): string[] { return []; }
}

type TestAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  handleAction(ws: WebSocket, playerIndex: 0 | 1, action: GameAction): Promise<void>;
};

function character(cardId: string, instanceId: string): CardInstance {
  return {
    instanceId, cardId, zone: "CHARACTER", state: "ACTIVE", attachedDon: [],
    turnPlayed: 1, controller: 0, owner: 0,
  };
}

describe("OPT-463 — replacements intercept cost-driven field exits", () => {
  it("accepting Enel's replacement keeps him in play and suppresses the post-colon chain", async () => {
    const cardDb = createTestCardDb();
    const enelData: CardData = { ...CARDS.VANILLA, id: "OP05-100", name: "Enel", cost: 7, power: 10000 };
    cardDb.set(enelData.id, enelData);
    const enel = character(enelData.id, "enel");
    let state = createBattleReadyState(cardDb);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([enel]) };
    const replacement: RuntimeActiveEffect = {
      id: "enel-leave-replacement",
      sourceCardInstanceId: enel.instanceId,
      sourceEffectBlockId: "leave-field",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_LEAVE_FIELD",
          target_filter: null,
          replacement_actions: [{ type: "TRASH_FROM_LIFE", params: { amount: 1, position: "TOP" } }],
          optional: true,
          once_per_turn: true,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [enel.instanceId],
      timestamp: Date.now(),
    };
    state = { ...state, players, activeEffects: [replacement as never] };

    const block: EffectBlock = {
      id: "sabo-cost",
      category: "activate",
      flags: { once_per_turn: true },
      costs: [{ type: "ADD_OWN_CHARACTER_TO_LIFE", amount: 1, position: "TOP", face: "UP" } as Cost],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };
    const initial = payCostsWithSelection(
      state, block.costs!, 0, 0, cardDb, state.players[0].leader.instanceId, block,
    );
    expect(initial.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const session = new GameSession(
      new MockDurableObjectState() as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
    ) as unknown as TestAccess;
    session.gameState = { ...initial.state, pendingPrompt: { ...initial.pendingPrompt!, promptId: "cost" } };
    session.cardDb = cardDb;
    const ws = new MockWebSocket();
    const lifeBefore = session.gameState.players[0].life.length;
    const handBefore = session.gameState.players[0].hand.length;

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "SELECT_TARGET", selectedInstanceIds: [enel.instanceId], promptId: "cost",
    } as GameAction);
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "PLAYER_CHOICE", choiceId: "accept", promptId: session.gameState.pendingPrompt?.promptId,
    } as GameAction);

    expect(session.gameState.players[0].characters.some((c) => c?.instanceId === enel.instanceId)).toBe(true);
    expect(session.gameState.players[0].life).toHaveLength(lifeBefore - 1);
    expect(session.gameState.players[0].hand).toHaveLength(handBefore);
    expect(session.gameState.effectStack).toHaveLength(0);
    expect(session.gameState.pendingPrompt).toBeFalsy();
  });
});
