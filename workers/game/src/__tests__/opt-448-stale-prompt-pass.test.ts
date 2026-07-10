import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession.js";
import type { CardData, Env, GameAction, GameState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

class MockWebSocket {
  sent: string[] = [];
  send(payload: string): void {
    this.sent.push(payload);
  }
}

class MockDurableObjectState {
  storage = {
    put: async () => undefined,
    get: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };
  acceptWebSocket(): void {}
  getWebSockets(): WebSocket[] {
    return [];
  }
}

type TestAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  handleAction(ws: WebSocket, playerIndex: 0 | 1, action: GameAction): Promise<void>;
};

function battleSession(): { session: TestAccess; ws: MockWebSocket } {
  const cardDb = createTestCardDb();
  const base = createBattleReadyState(cardDb);
  const attacker = base.players[0].characters[0]!;
  const state: GameState = {
    ...base,
    pendingPrompt: null,
    turn: {
      ...base.turn,
      battleSubPhase: "BLOCK_STEP",
      battle: {
        battleId: "opt-448-battle",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: base.players[1].leader.instanceId,
        attackerPower: 5000,
        defenderPower: 5000,
        counterPowerAdded: 0,
        blockerActivated: false,
      },
    },
  };
  const session = new GameSession(
    new MockDurableObjectState() as unknown as DurableObjectState,
    { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
  ) as unknown as TestAccess;
  session.gameState = state;
  session.cardDb = cardDb;
  return { session, ws: new MockWebSocket() };
}

function errors(ws: MockWebSocket): string[] {
  return ws.sent
    .map((payload) => JSON.parse(payload) as { type: string; message?: string })
    .filter((message) => message.type === "game:error")
    .map((message) => message.message ?? "");
}

describe("OPT-448: prompt identity cannot fall through as a plain action", () => {
  it("rejects a duplicate prompt PASS after the prompt has cleared", async () => {
    const { session, ws } = battleSession();

    await session.handleAction(ws as unknown as WebSocket, 1, {
      type: "PASS",
      promptId: "already-resolved-prompt",
    } as GameAction);

    expect(errors(ws)).toContain("That prompt response is stale");
    expect(session.gameState.turn.battleSubPhase).toBe("BLOCK_STEP");
  });

  it("still accepts a deliberate battle PASS without prompt identity", async () => {
    const { session, ws } = battleSession();

    await session.handleAction(ws as unknown as WebSocket, 1, { type: "PASS" });

    expect(errors(ws)).toHaveLength(0);
    expect(session.gameState.turn.battleSubPhase).toBe("COUNTER_STEP");
  });
});
