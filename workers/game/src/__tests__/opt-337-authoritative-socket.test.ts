import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession.js";
import type { CardData, Env, GameState } from "../types.js";
import { setupGame } from "./factories.js";

class MockWebSocket {
  sent: string[] = [];
  closeCalls: { code?: number; reason?: string }[] = [];
  private attachment: unknown = null;

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
  }

  serializeAttachment(attachment: unknown): void {
    this.attachment = attachment;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class MockDurableObjectState {
  private sockets: MockWebSocket[] = [];
  private tags = new Map<MockWebSocket, string[]>();

  storage = {
    put: async () => undefined,
    get: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };

  acceptWebSocket(ws: WebSocket, tags?: string[]): void {
    const mock = ws as unknown as MockWebSocket;
    this.sockets.push(mock);
    this.tags.set(mock, tags ?? []);
  }

  getWebSockets(tag?: string): WebSocket[] {
    const sockets = tag
      ? this.sockets.filter((ws) => this.tags.get(ws)?.includes(tag))
      : this.sockets;
    return sockets as unknown as WebSocket[];
  }

  getTags(ws: WebSocket): string[] {
    return this.tags.get(ws as unknown as MockWebSocket) ?? [];
  }
}

type GameSessionTestAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  acceptAuthoritativePlayerSocket(playerIndex: 0 | 1, ws: WebSocket): void;
  getWebSocketForPlayer(playerIndex: 0 | 1): WebSocket | null;
  sendEffectPrompt(prompt: NonNullable<GameState["pendingPrompt"]>): void;
  broadcastFilteredState(build: (filteredState: GameState) => { type: "game:state"; state: GameState }): void;
  webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void>;
};

function createSession(): {
  session: GameSessionTestAccess;
  state: MockDurableObjectState;
} {
  const durableState = new MockDurableObjectState();
  const env = {
    GAME_WORKER_SECRET: "test-secret",
    NEXTJS_URL: "https://app.example.test",
  } as Env;
  const session = new GameSession(
    durableState as unknown as DurableObjectState,
    env,
  ) as unknown as GameSessionTestAccess;
  const { state, cardDb } = setupGame();
  session.gameState = state;
  session.cardDb = cardDb;
  return { session, state: durableState };
}

function parseMessages(ws: MockWebSocket): unknown[] {
  return ws.sent.map((message) => JSON.parse(message) as unknown);
}

describe("OPT-337 authoritative player WebSocket policy", () => {
  it("makes the newest socket authoritative and closes the older duplicate", () => {
    const { session } = createSession();
    const first = new MockWebSocket();
    const second = new MockWebSocket();

    session.acceptAuthoritativePlayerSocket(0, first as unknown as WebSocket);
    session.acceptAuthoritativePlayerSocket(0, second as unknown as WebSocket);

    expect(first.closeCalls).toEqual([{ code: 1000, reason: "superseded" }]);
    expect(session.getWebSocketForPlayer(0)).toBe(second);
  });

  it("ignores stale close events while a newer player socket is active", async () => {
    const { session } = createSession();
    const first = new MockWebSocket();
    const second = new MockWebSocket();
    session.gameState = {
      ...session.gameState,
      players: [
        { ...session.gameState.players[0], connected: true, awayReason: null, rejoinDeadlineAt: null },
        session.gameState.players[1],
      ],
    };

    session.acceptAuthoritativePlayerSocket(0, first as unknown as WebSocket);
    session.acceptAuthoritativePlayerSocket(0, second as unknown as WebSocket);
    await session.webSocketClose(first as unknown as WebSocket, 1000, "old tab closed");

    expect(session.gameState.players[0].connected).toBe(true);
    expect(session.gameState.players[0].awayReason).toBeNull();
    expect(session.gameState.players[0].rejoinDeadlineAt).toBeNull();
  });

  it("delivers prompts and filtered state only to the authoritative player socket", () => {
    const { session } = createSession();
    const stalePlayer0 = new MockWebSocket();
    const activePlayer0 = new MockWebSocket();
    const activePlayer1 = new MockWebSocket();

    session.acceptAuthoritativePlayerSocket(0, stalePlayer0 as unknown as WebSocket);
    session.acceptAuthoritativePlayerSocket(0, activePlayer0 as unknown as WebSocket);
    session.acceptAuthoritativePlayerSocket(1, activePlayer1 as unknown as WebSocket);
    stalePlayer0.sent = [];
    activePlayer0.sent = [];
    activePlayer1.sent = [];

    const prompt = {
      respondingPlayer: 0 as const,
      options: {
        promptType: "PLAYER_CHOICE" as const,
        effectDescription: "Choose one",
        choices: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      },
      resumeContext: null,
    };

    session.sendEffectPrompt(prompt);
    session.broadcastFilteredState((state) => ({ type: "game:state", state }));

    expect(parseMessages(stalePlayer0)).toEqual([]);
    expect(parseMessages(activePlayer0).map((message) => (message as { type: string }).type)).toEqual([
      "game:prompt",
      "game:state",
    ]);
    expect(parseMessages(activePlayer1).map((message) => (message as { type: string }).type)).toEqual([
      "game:state",
    ]);
  });
});
