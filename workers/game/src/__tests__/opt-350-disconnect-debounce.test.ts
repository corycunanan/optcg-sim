import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCONNECT_BROADCAST_DEBOUNCE_MS,
  GameSession,
} from "../GameSession.js";
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
  webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void>;
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
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
  session.gameState = {
    ...state,
    players: [
      { ...state.players[0], connected: true, awayReason: null, rejoinDeadlineAt: null },
      { ...state.players[1], connected: true, awayReason: null, rejoinDeadlineAt: null },
    ],
  };
  session.cardDb = cardDb;
  return { session, state: durableState };
}

function parseMessages(ws: MockWebSocket): { type: string }[] {
  return ws.sent.map((message) => JSON.parse(message) as { type: string });
}

describe("OPT-350 DISCONNECTED broadcast debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not broadcast game:player_disconnected when a replacement socket arrives within the debounce window", async () => {
    const { session } = createSession();
    const oppWs = new MockWebSocket();
    const firstPlayer0Ws = new MockWebSocket();
    const secondPlayer0Ws = new MockWebSocket();

    session.acceptAuthoritativePlayerSocket(1, oppWs as unknown as WebSocket);
    session.acceptAuthoritativePlayerSocket(0, firstPlayer0Ws as unknown as WebSocket);
    oppWs.sent = [];

    await session.webSocketClose(firstPlayer0Ws as unknown as WebSocket, 1000, "transient");
    // Replacement socket lands well inside the debounce window
    vi.advanceTimersByTime(50);
    session.acceptAuthoritativePlayerSocket(0, secondPlayer0Ws as unknown as WebSocket);

    // Drain any pending timers past the original debounce window.
    await vi.advanceTimersByTimeAsync(DISCONNECT_BROADCAST_DEBOUNCE_MS + 100);

    const broadcastTypes = parseMessages(oppWs).map((m) => m.type);
    expect(broadcastTypes).not.toContain("game:player_disconnected");
    expect(session.gameState.players[0].connected).toBe(true);
    expect(session.gameState.players[0].awayReason).toBeNull();
    expect(session.gameState.players[0].rejoinDeadlineAt).toBeNull();
  });

  it("broadcasts game:player_disconnected after the debounce window when no replacement arrives", async () => {
    const { session } = createSession();
    const oppWs = new MockWebSocket();
    const player0Ws = new MockWebSocket();

    session.acceptAuthoritativePlayerSocket(1, oppWs as unknown as WebSocket);
    session.acceptAuthoritativePlayerSocket(0, player0Ws as unknown as WebSocket);
    oppWs.sent = [];

    await session.webSocketClose(player0Ws as unknown as WebSocket, 1006, "lost connection");

    // Just before the window expires: still no disconnect surfaced
    await vi.advanceTimersByTimeAsync(DISCONNECT_BROADCAST_DEBOUNCE_MS - 1);
    expect(parseMessages(oppWs).map((m) => m.type)).not.toContain("game:player_disconnected");
    expect(session.gameState.players[0].connected).toBe(true);

    // Cross the window: timer fires and the broadcast goes out
    await vi.advanceTimersByTimeAsync(2);
    const broadcastTypes = parseMessages(oppWs).map((m) => m.type);
    expect(broadcastTypes).toContain("game:player_disconnected");
    expect(session.gameState.players[0].connected).toBe(false);
    expect(session.gameState.players[0].awayReason).toBe("DISCONNECTED");
    expect(session.gameState.players[0].rejoinDeadlineAt).not.toBeNull();
  });

  it("finishes immediately when a player leaves during pregame", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { session } = createSession();
    const player0Ws = new MockWebSocket();
    const player1Ws = new MockWebSocket();
    session.acceptAuthoritativePlayerSocket(0, player0Ws as unknown as WebSocket);
    session.acceptAuthoritativePlayerSocket(1, player1Ws as unknown as WebSocket);
    player0Ws.sent = [];
    player1Ws.sent = [];
    session.gameState = {
      ...session.gameState,
      pregame: {
        phase: "PRIORITY_CHOICE",
        priorityRolls: [6, 1],
        priorityDeciderIndex: 0,
        firstPlayerIndex: null,
        mulliganDecisions: [null, null],
        startOfGameEffectsResolved: [false, false],
      },
      pendingPrompt: {
        options: {
          promptType: "PLAYER_CHOICE",
          effectDescription: "PREGAME_FIRST_OR_SECOND",
          choices: [
            { id: "FIRST", label: "Go first" },
            { id: "SECOND", label: "Go second" },
          ],
        },
        respondingPlayer: 0,
        resumeContext: { type: "PREGAME_PRIORITY_CHOICE" },
      },
    };

    await session.webSocketMessage(
      player0Ws as unknown as WebSocket,
      JSON.stringify({ type: "game:leave" }),
    );

    expect(session.gameState.status).toBe("FINISHED");
    expect(session.gameState.winner).toBe(1);
    expect(session.gameState.pregame).toBeNull();
    expect(session.gameState.pendingPrompt).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(parseMessages(player1Ws).map((m) => m.type)).toContain("game:over");
  });
});
