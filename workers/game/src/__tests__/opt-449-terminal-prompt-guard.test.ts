import { afterEach, describe, expect, it, vi } from "vitest";
import { GameSession } from "../GameSession.js";
import type { CardData, Env, GameAction, GameState } from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
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
  getWebSockets(): WebSocket[] {
    return [];
  }
  getTags(): string[] {
    return [];
  }
}

type TestAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  alarm(): Promise<void>;
  handleAction(ws: WebSocket, playerIndex: 0 | 1, action: GameAction): Promise<void>;
};

function promptedSession(): { session: TestAccess; promptId: string | undefined } {
  const cardDb = createTestCardDb();
  const base = createBattleReadyState(cardDb);
  const block: EffectBlock = {
    id: "opt-449-pending-effect",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    flags: { optional: true },
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  };
  const prompted = resolveEffect(base, block, base.players[0].leader.instanceId, 0, cardDb);
  const session = new GameSession(
    new MockDurableObjectState() as unknown as DurableObjectState,
    { GAME_WORKER_SECRET: "test-secret", NEXTJS_URL: "https://app.example.test" } as Env,
  ) as unknown as TestAccess;
  session.cardDb = cardDb;
  session.gameState = { ...prompted.state, pendingPrompt: prompted.pendingPrompt! };
  return { session, promptId: prompted.pendingPrompt?.promptId };
}

afterEach(() => vi.unstubAllGlobals());

describe("OPT-449: terminal games cannot resume pending effects", () => {
  it("alarm termination clears prompt and stack state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const { session } = promptedSession();
    session.gameState = {
      ...session.gameState,
      players: [
        {
          ...session.gameState.players[0],
          connected: false,
          awayReason: "DISCONNECTED",
          rejoinDeadlineAt: Date.now() - 1,
        },
        { ...session.gameState.players[1], connected: true },
      ],
    };

    await session.alarm();

    expect(session.gameState.status).toBe("FINISHED");
    expect(session.gameState.pendingPrompt).toBeNull();
    expect(session.gameState.effectStack).toHaveLength(0);
  });

  it("rejects a surviving legacy prompt without mutating terminal state", async () => {
    const { session, promptId } = promptedSession();
    session.gameState = { ...session.gameState, status: "FINISHED", winner: 1 };
    const before = session.gameState;
    const ws = new MockWebSocket();

    await session.handleAction(ws as unknown as WebSocket, 0, {
      type: "PLAYER_CHOICE",
      choiceId: "accept",
      promptId,
    } as GameAction);

    expect(session.gameState).toBe(before);
    expect(ws.sent.some((payload) => payload.includes("Game is already over"))).toBe(true);
  });
});
