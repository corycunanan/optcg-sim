import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTION_RATE_LIMIT_BURST,
  ACTION_RATE_LIMIT_CLOSE_REASON,
  ACTION_RATE_LIMIT_REFILL_PER_SECOND,
  GameSession,
  RATE_LIMIT_CLOSE_CODE,
  consumeTokenBucket,
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
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
};

function createSession(): GameSessionTestAccess {
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
  return session;
}

const actionMessage = JSON.stringify({ type: "game:action", action: { type: "PASS" } });

async function sendActions(session: GameSessionTestAccess, ws: MockWebSocket, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await session.webSocketMessage(ws as unknown as WebSocket, actionMessage);
  }
}

function parseMessages(ws: MockWebSocket): { type: string; message?: string }[] {
  return ws.sent.map((message) => JSON.parse(message) as { type: string; message?: string });
}

describe("OPT-335 WebSocket action rate limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T16:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows a full gameplay action burst before throttling", async () => {
    const session = createSession();
    const player0 = new MockWebSocket();
    session.acceptAuthoritativePlayerSocket(0, player0 as unknown as WebSocket);

    await sendActions(session, player0, ACTION_RATE_LIMIT_BURST);

    expect(player0.closeCalls).toEqual([]);
  });

  it("refills the action bucket over time", () => {
    let bucket: ReturnType<typeof consumeTokenBucket>["bucket"] | undefined;
    for (let i = 0; i < ACTION_RATE_LIMIT_BURST; i += 1) {
      const result = consumeTokenBucket(bucket, 1_000, ACTION_RATE_LIMIT_BURST, ACTION_RATE_LIMIT_REFILL_PER_SECOND);
      expect(result.allowed).toBe(true);
      bucket = result.bucket;
    }

    const empty = consumeTokenBucket(bucket, 1_000, ACTION_RATE_LIMIT_BURST, ACTION_RATE_LIMIT_REFILL_PER_SECOND);
    expect(empty.allowed).toBe(false);

    const refilled = consumeTokenBucket(
      empty.bucket,
      2_000,
      ACTION_RATE_LIMIT_BURST,
      ACTION_RATE_LIMIT_REFILL_PER_SECOND,
    );
    expect(refilled.allowed).toBe(true);
  });

  it("isolates action buckets per player", async () => {
    const session = createSession();
    const player0 = new MockWebSocket();
    const player1 = new MockWebSocket();
    session.acceptAuthoritativePlayerSocket(0, player0 as unknown as WebSocket);
    session.acceptAuthoritativePlayerSocket(1, player1 as unknown as WebSocket);

    await sendActions(session, player0, ACTION_RATE_LIMIT_BURST + 1);
    await session.webSocketMessage(player1 as unknown as WebSocket, actionMessage);

    expect(player0.closeCalls).toEqual([
      { code: RATE_LIMIT_CLOSE_CODE, reason: ACTION_RATE_LIMIT_CLOSE_REASON },
    ]);
    expect(player1.closeCalls).toEqual([]);
  });

  it("sends a clear error and closes when the limit is exceeded", async () => {
    const session = createSession();
    const player0 = new MockWebSocket();
    session.acceptAuthoritativePlayerSocket(0, player0 as unknown as WebSocket);

    await sendActions(session, player0, ACTION_RATE_LIMIT_BURST + 1);

    expect(parseMessages(player0)).toContainEqual({
      type: "game:error",
      message: ACTION_RATE_LIMIT_CLOSE_REASON,
    });
    expect(player0.closeCalls).toEqual([
      { code: RATE_LIMIT_CLOSE_CODE, reason: ACTION_RATE_LIMIT_CLOSE_REASON },
    ]);
  });
});
