import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCONNECT_BROADCAST_DEBOUNCE_MS,
  GameSession,
} from "../GameSession.js";
import {
  SPECTATOR_GAME_ENDED_CLOSE_CODE,
  SPECTATOR_GAME_ENDED_CLOSE_REASON,
  SPECTATOR_LEASE_EXPIRED_CLOSE_REASON,
  MAX_SPECTATOR_SOCKETS,
  SPECTATOR_REVOKED_CLOSE_CODE,
  SPECTATOR_REVOKED_CLOSE_REASON,
  SessionTransport,
  spectatorMessageVisibility,
  type FilteredStateMessage,
  type FilteredStateRecipient,
} from "../session/transport.js";
import { SpectatorLifecycle } from "../session/spectator-lifecycle.js";
import type { CardData, Env, GameState, ServerMessage } from "../types.js";
import { setupGame } from "./factories.js";

class MockWebSocket {
  readonly sent: string[] = [];
  readonly closed: Array<{ code?: number; reason?: string }> = [];
  private attachment: unknown;

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class MockDurableObjectState {
  private readonly data = new Map<string, unknown>();
  private readonly sockets: MockWebSocket[] = [];
  private readonly tags = new Map<MockWebSocket, string[]>();

  readonly storage = {
    get: async <T>(key: string): Promise<T | undefined> =>
      this.data.get(key) as T | undefined,
    put: async (
      keyOrEntries: string | Record<string, unknown>,
      value?: unknown
    ): Promise<void> => {
      if (typeof keyOrEntries === "string") {
        this.data.set(keyOrEntries, value);
        return;
      }
      for (const [key, entry] of Object.entries(keyOrEntries)) {
        this.data.set(key, entry);
      }
    },
    setAlarm: async (): Promise<void> => undefined,
    deleteAlarm: async (): Promise<void> => undefined,
  };

  acceptWebSocket(ws: WebSocket, tags?: string[]): void {
    const socket = ws as unknown as MockWebSocket;
    this.sockets.push(socket);
    this.tags.set(socket, tags ?? []);
  }

  getWebSockets(tag?: string): WebSocket[] {
    const sockets = tag
      ? this.sockets.filter((socket) => this.tags.get(socket)?.includes(tag))
      : this.sockets;
    return sockets as unknown as WebSocket[];
  }

  getTags(ws: WebSocket): string[] {
    return this.tags.get(ws as unknown as MockWebSocket) ?? [];
  }
}

class PermissiveResponse {
  readonly status: number;
  readonly webSocket: unknown;
  private readonly body: BodyInit | null;

  constructor(
    body: BodyInit | null = null,
    init: ResponseInit & { webSocket?: unknown } = {}
  ) {
    this.body = body;
    this.status = init.status ?? 200;
    this.webSocket = init.webSocket;
  }

  async text(): Promise<string> {
    return this.body === null ? "" : String(this.body);
  }
}

type GameSessionTestAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  transport: SessionTransport;
  spectatorLifecycle: SpectatorLifecycle;
  acceptAuthoritativePlayerSocket(playerIndex: 0 | 1, ws: WebSocket): void;
  broadcastFilteredState(
    build: (
      state: GameState,
      recipientPlayerIndex: FilteredStateRecipient
    ) => FilteredStateMessage
  ): void;
  webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void>;
  alarm(): Promise<void>;
};

const originalResponse = globalThis.Response;
const originalWebSocketPair = (globalThis as Record<string, unknown>)
  .WebSocketPair;
let latestPair: [MockWebSocket, MockWebSocket];

function createSession(): GameSessionTestAccess {
  const durableState = new MockDurableObjectState();
  const session = new GameSession(
    durableState as unknown as DurableObjectState,
    {
      GAME_WORKER_SECRET: "test-secret",
      NEXTJS_URL: "https://app.example.test",
    } as Env
  ) as unknown as GameSessionTestAccess;
  const { state, cardDb } = setupGame();
  session.gameState = {
    ...state,
    players: [
      {
        ...state.players[0],
        connected: true,
        awayReason: null,
        rejoinDeadlineAt: null,
      },
      {
        ...state.players[1],
        connected: true,
        awayReason: null,
        rejoinDeadlineAt: null,
      },
    ],
  };
  session.cardDb = cardDb;
  return session;
}

function messages(ws: MockWebSocket): ServerMessage[] {
  return ws.sent.map((payload) => JSON.parse(payload) as ServerMessage);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new originalResponse(null, { status: 200 }))
  );
  globalThis.Response = PermissiveResponse as unknown as typeof Response;
  (globalThis as Record<string, unknown>).WebSocketPair = function MockPair(
    this: Record<number, MockWebSocket>
  ) {
    latestPair = [new MockWebSocket(), new MockWebSocket()];
    this[0] = latestPair[0];
    this[1] = latestPair[1];
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  globalThis.Response = originalResponse;
  if (originalWebSocketPair === undefined) {
    delete (globalThis as Record<string, unknown>).WebSocketPair;
  } else {
    (globalThis as Record<string, unknown>).WebSocketPair =
      originalWebSocketPair;
  }
});

describe("OPT-558 spectator connection lifecycle", () => {
  it.each(["game:spectator_joined", "game:spectator_left"] as const)(
    "keeps %s player-only on both default-deny delivery axes",
    (type) => {
      expect(spectatorMessageVisibility(type)).toEqual({
        broadcast: false,
        filteredState: false,
      });
    }
  );

  it("sends a mid-game snapshot through the steady-state builder without touching player presence", async () => {
    const session = createSession();
    const player0 = new MockWebSocket();
    const player1 = new MockWebSocket();
    session.acceptAuthoritativePlayerSocket(0, player0 as unknown as WebSocket);
    session.acceptAuthoritativePlayerSocket(1, player1 as unknown as WebSocket);
    const existingSpectator = new MockWebSocket();
    session.transport.acceptSpectator(
      "existing-spectator",
      existingSpectator as unknown as WebSocket
    );
    const presenceBefore = session.gameState.players.map((player) => ({
      connected: player.connected,
      awayReason: player.awayReason,
      rejoinDeadlineAt: player.rejoinDeadlineAt,
    }));
    const builder = vi.spyOn(
      session.transport,
      "buildFilteredStateForRecipient"
    );

    const response = await session.spectatorLifecycle.handleUpgrade({
      role: "spectator",
      userId: "spectator-user",
      expiresAt: Date.now() + 300_000,
    });

    expect(response.status).toBe(101);
    const spectator = latestPair[1];
    const connectSnapshot = messages(spectator)[0];
    expect(connectSnapshot?.type).toBe("game:state");
    expect(
      session.gameState.players.map((player) => ({
        connected: player.connected,
        awayReason: player.awayReason,
        rejoinDeadlineAt: player.rejoinDeadlineAt,
      }))
    ).toEqual(presenceBefore);
    expect(messages(player0)).toContainEqual({
      type: "game:spectator_joined",
      spectator: { id: "spectator-user", displayName: "spectator-user" },
    });
    expect(messages(player1)).toContainEqual({
      type: "game:spectator_joined",
      spectator: { id: "spectator-user", displayName: "spectator-user" },
    });
    expect(messages(spectator)).not.toContainEqual(
      expect.objectContaining({ type: "game:spectator_joined" })
    );
    expect(messages(existingSpectator)).not.toContainEqual(
      expect.objectContaining({ type: "game:spectator_joined" })
    );

    spectator.sent.length = 0;
    session.broadcastFilteredState((state) => ({ type: "game:state", state }));
    expect(messages(spectator)[0]).toEqual(connectSnapshot);
    expect(builder.mock.calls.filter((call) => call[2] === null)).toHaveLength(
      2
    );
  });

  it("does not bootstrap or announce a capacity-rejected spectator", async () => {
    const session = createSession();
    const player = new MockWebSocket();
    session.acceptAuthoritativePlayerSocket(0, player as unknown as WebSocket);
    for (let index = 0; index < MAX_SPECTATOR_SOCKETS; index++) {
      session.transport.acceptSpectator(
        `spectator-${index}`,
        new MockWebSocket() as unknown as WebSocket
      );
    }

    const response = await session.spectatorLifecycle.handleUpgrade({
      role: "spectator",
      userId: "over-capacity",
      expiresAt: Date.now() + 300_000,
    });

    expect(response.status).toBe(101);
    expect(latestPair[1].sent).toEqual([]);
    expect(messages(player)).not.toContainEqual(
      expect.objectContaining({ type: "game:spectator_joined" })
    );
  });

  it("keeps player disconnect debounce and forfeit timing intact while a spectator flaps", async () => {
    const session = createSession();
    const player0 = new MockWebSocket();
    const player1 = new MockWebSocket();
    session.acceptAuthoritativePlayerSocket(0, player0 as unknown as WebSocket);
    session.acceptAuthoritativePlayerSocket(1, player1 as unknown as WebSocket);
    await session.webSocketClose(
      player0 as unknown as WebSocket,
      1006,
      "player network lost"
    );

    for (let index = 0; index < 4; index++) {
      const spectator = new MockWebSocket();
      session.transport.acceptSpectator(
        `spectator-${index}`,
        spectator as unknown as WebSocket,
        Date.now() + 600_000
      );
      await session.webSocketClose(
        spectator as unknown as WebSocket,
        1006,
        "spectator network lost"
      );
      await vi.advanceTimersByTimeAsync(100);
    }

    await vi.advanceTimersByTimeAsync(DISCONNECT_BROADCAST_DEBOUNCE_MS - 401);
    expect(session.gameState.players[0].connected).toBe(true);
    await vi.advanceTimersByTimeAsync(2);
    expect(session.gameState.players[0].connected).toBe(false);
    expect(session.gameState.players[0].awayReason).toBe("DISCONNECTED");
    const deadline = session.gameState.players[0].rejoinDeadlineAt;
    expect(deadline).not.toBeNull();

    for (let index = 4; index < 8; index++) {
      const spectator = new MockWebSocket();
      session.transport.acceptSpectator(
        `spectator-${index}`,
        spectator as unknown as WebSocket,
        Date.now() + 600_000
      );
      await session.webSocketClose(
        spectator as unknown as WebSocket,
        1000,
        "spectator left"
      );
    }
    expect(session.gameState.players[0].rejoinDeadlineAt).toBe(deadline);

    vi.setSystemTime(deadline!);
    await session.alarm();
    expect(session.gameState.status).toBe("FINISHED");
    expect(session.gameState.winner).toBe(1);
    expect(session.gameState.winReason).toBe(
      "Player 1 failed to rejoin in time"
    );
  });

  it("emits ordinary authoritative leaves to players but suppresses revocation and stale closes", async () => {
    const session = createSession();
    const player = new MockWebSocket();
    session.acceptAuthoritativePlayerSocket(0, player as unknown as WebSocket);
    const observer = new MockWebSocket();
    session.transport.acceptSpectator(
      "observer-user",
      observer as unknown as WebSocket
    );
    const scheduleDisconnect = vi.spyOn(
      session.transport,
      "scheduleDisconnect"
    );
    const departed = new MockWebSocket();
    session.transport.acceptSpectator(
      "departed-user",
      departed as unknown as WebSocket
    );

    await session.webSocketClose(
      departed as unknown as WebSocket,
      1006,
      "network lost"
    );
    expect(messages(player)).toContainEqual({
      type: "game:spectator_left",
      spectator: { id: "departed-user", displayName: "departed-user" },
    });
    expect(scheduleDisconnect).not.toHaveBeenCalled();
    expect(messages(observer)).not.toContainEqual(
      expect.objectContaining({ type: "game:spectator_left" })
    );

    player.sent.length = 0;
    const revoked = new MockWebSocket();
    session.transport.acceptSpectator(
      "revoked-user",
      revoked as unknown as WebSocket
    );
    session.transport.revokeSpectators(["revoked-user"]);
    await session.webSocketClose(
      revoked as unknown as WebSocket,
      SPECTATOR_REVOKED_CLOSE_CODE,
      SPECTATOR_REVOKED_CLOSE_REASON
    );
    expect(messages(player)).not.toContainEqual(
      expect.objectContaining({ type: "game:spectator_left" })
    );

    const expired = new MockWebSocket();
    session.transport.acceptSpectator(
      "expired-user",
      expired as unknown as WebSocket,
      Date.now()
    );
    session.transport.closeExpiredSpectators(Date.now());
    await session.webSocketClose(
      expired as unknown as WebSocket,
      SPECTATOR_REVOKED_CLOSE_CODE,
      SPECTATOR_LEASE_EXPIRED_CLOSE_REASON
    );
    expect(messages(player)).not.toContainEqual(
      expect.objectContaining({ type: "game:spectator_left" })
    );

    const newest = new MockWebSocket();
    const stale = new MockWebSocket();
    session.transport.acceptSpectator(
      "same-user",
      stale as unknown as WebSocket
    );
    session.transport.acceptSpectator(
      "same-user",
      newest as unknown as WebSocket
    );
    await session.webSocketClose(
      stale as unknown as WebSocket,
      1006,
      "late close"
    );
    expect(messages(player)).not.toContainEqual(
      expect.objectContaining({ type: "game:spectator_left" })
    );
  });

  it("delivers game over before cleanly closing every spectator and leaves player sockets open", async () => {
    const session = createSession();
    const player = new MockWebSocket();
    const spectator0 = new MockWebSocket();
    const spectator1 = new MockWebSocket();
    session.acceptAuthoritativePlayerSocket(0, player as unknown as WebSocket);
    session.transport.acceptSpectator(
      "spectator-0",
      spectator0 as unknown as WebSocket
    );
    session.transport.acceptSpectator(
      "spectator-1",
      spectator1 as unknown as WebSocket
    );

    session.spectatorLifecycle.broadcastGameOver({
      type: "game:over",
      winner: 0,
      reason: "won",
    });

    for (const spectator of [spectator0, spectator1]) {
      expect(messages(spectator)).toContainEqual({
        type: "game:over",
        winner: 0,
        reason: "won",
      });
      expect(spectator.closed).toEqual([
        {
          code: SPECTATOR_GAME_ENDED_CLOSE_CODE,
          reason: SPECTATOR_GAME_ENDED_CLOSE_REASON,
        },
      ]);
    }
    expect(player.closed).toEqual([]);
    player.sent.length = 0;
    await Promise.all(
      [spectator0, spectator1].map((spectator) =>
        session.webSocketClose(
          spectator as unknown as WebSocket,
          SPECTATOR_GAME_ENDED_CLOSE_CODE,
          SPECTATOR_GAME_ENDED_CLOSE_REASON
        )
      )
    );
    expect(messages(player)).not.toContainEqual(
      expect.objectContaining({ type: "game:spectator_left" })
    );
  });
});
