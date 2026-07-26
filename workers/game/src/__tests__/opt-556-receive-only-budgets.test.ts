import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GameSession,
  MAX_CLIENT_MESSAGE_BYTES,
  RATE_LIMIT_CLOSE_CODE,
  SPECTATOR_INVALID_SOCKET_CLOSE_REASON,
  SPECTATOR_MESSAGE_RATE_LIMIT_BURST,
  SPECTATOR_MESSAGE_RATE_LIMIT_CLOSE_REASON,
  UPGRADE_RATE_LIMIT_BURST,
} from "../GameSession.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { SessionRateLimiter } from "../session/rate-limiter.js";
import { SpectatorPolicy } from "../session/spectator-policy.js";
import {
  SessionTransport,
  type SpectatorSocketAttachment,
} from "../session/transport.js";
import type { CardData, Env, GameState } from "../types.js";
import { setupGame } from "./factories.js";

const logMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/log.js", () => ({ configureLogger: vi.fn(), log: logMock }));

class MockWebSocket {
  readonly sent: string[] = [];
  readonly closed: Array<{ code?: number; reason?: string }> = [];
  serializationFails = false;
  private attachment: unknown;

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }

  serializeAttachment(value: unknown): void {
    if (this.serializationFails) throw new Error("attachment write failed");
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
  readonly putCalls: string[] = [];

  storage = {
    get: async <T>(key: string): Promise<T | undefined> =>
      this.data.get(key) as T | undefined,
    put: async (
      keyOrEntries: string | Record<string, unknown>,
      value?: unknown
    ): Promise<void> => {
      if (typeof keyOrEntries === "string") {
        this.putCalls.push(keyOrEntries);
        this.data.set(keyOrEntries, value);
        return;
      }
      for (const [key, entry] of Object.entries(keyOrEntries)) {
        this.data.set(key, entry);
      }
    },
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
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

  hibernate(): MockDurableObjectState {
    const restored = new MockDurableObjectState();
    for (const [key, value] of this.data) {
      restored.data.set(key, structuredClone(value));
    }
    for (const socket of this.sockets) {
      const restoredSocket = new MockWebSocket();
      restoredSocket.serializeAttachment(
        structuredClone(socket.deserializeAttachment())
      );
      restored.acceptWebSocket(
        restoredSocket as unknown as WebSocket,
        [...(this.tags.get(socket) ?? [])]
      );
    }
    return restored;
  }
}

type GameSessionTestAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  coordinator: SessionCoordinator;
  rateLimiter: SessionRateLimiter;
  spectatorPolicy: SpectatorPolicy;
  transport: SessionTransport;
  acceptAuthoritativePlayerSocket(playerIndex: 0 | 1, ws: WebSocket): void;
  handleWebSocket(request: Request): Promise<Response>;
  validateToken(
    token: string
  ): Promise<
    | { role: "player"; playerIndex: 0 | 1 }
    | { role: "spectator"; userId: string }
    | null
  >;
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
};

function createSession(
  state = new MockDurableObjectState()
): {
  session: GameSessionTestAccess;
  state: MockDurableObjectState;
} {
  const session = new GameSession(
    state as unknown as DurableObjectState,
    {
      GAME_WORKER_SECRET: "test-secret",
      NEXTJS_URL: "https://app.example.test",
    } as Env
  ) as unknown as GameSessionTestAccess;
  const game = setupGame();
  session.gameState = game.state;
  session.cardDb = game.cardDb;
  return { session, state };
}

function acceptSpectator(
  session: GameSessionTestAccess,
  userId = "spectator-user"
): MockWebSocket {
  const socket = new MockWebSocket();
  expect(
    session.transport.acceptSpectator(userId, socket as unknown as WebSocket)
  ).toBe(true);
  return socket;
}

const spectatorFrames = [
  JSON.stringify({ type: "game:action", action: { type: "END_TURN" } }),
  JSON.stringify({
    type: "game:prompt",
    promptId: "spectator-prompt",
    options: { promptType: "PLAYER_CHOICE" },
  }),
  "{malformed-json",
];

describe("OPT-556 receive-only spectator enforcement", () => {
  beforeEach(() => {
    logMock.mockReset();
  });

  it("keeps a concurrent player action out of a spectator frame flood queue", async () => {
    const { session } = createSession();
    const spectator = acceptSpectator(session);
    const player = new MockWebSocket();
    session.acceptAuthoritativePlayerSocket(0, player as unknown as WebSocket);
    const run = vi.spyOn(session.coordinator, "run");
    const consumeAction = vi.spyOn(session.rateLimiter, "consumeAction");
    const consumeInvalid = vi.spyOn(
      session.rateLimiter,
      "consumeInvalidMessage"
    );
    const consumePlayerUpgrade = vi.spyOn(
      session.rateLimiter,
      "consumeUpgrade"
    );

    const flood = Array.from(
      { length: SPECTATOR_MESSAGE_RATE_LIMIT_BURST },
      (_, index) =>
        session.webSocketMessage(
          spectator as unknown as WebSocket,
          spectatorFrames[index % spectatorFrames.length]!
        )
    );

    expect(run).not.toHaveBeenCalled();
    expect(consumeAction).not.toHaveBeenCalled();
    expect(consumeInvalid).not.toHaveBeenCalled();
    expect(consumePlayerUpgrade).not.toHaveBeenCalled();

    let playerActionFinished = false;
    const playerAction = session
      .webSocketMessage(
        player as unknown as WebSocket,
        JSON.stringify({ type: "game:action", action: { type: "PASS" } })
      )
      .then(() => {
        playerActionFinished = true;
      });
    await Promise.all([...flood, playerAction]);

    expect(playerActionFinished).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(consumeAction).toHaveBeenCalledOnce();
    expect(consumeInvalid).not.toHaveBeenCalled();
    expect(consumePlayerUpgrade).not.toHaveBeenCalled();
    expect(spectator.closed).toEqual([]);
    expect(spectator.sent).toEqual([]);
  });

  it.each(spectatorFrames)(
    "drops spectator frame before the coordinator and leaves the socket open: %s",
    async (frame) => {
      const { session } = createSession();
      const spectator = acceptSpectator(session);
      const playerIndexFor = vi.spyOn(session.transport, "playerIndexFor");
      const run = vi.spyOn(session.coordinator, "run");

      await session.webSocketMessage(spectator as unknown as WebSocket, frame);

      expect(playerIndexFor).toHaveBeenCalledWith(
        spectator as unknown as WebSocket
      );
      expect(run).not.toHaveBeenCalled();
      expect(spectator.closed).toEqual([]);
      expect(spectator.sent).toEqual([]);
    }
  );

  it("rejects an oversized spectator frame before identity or budget processing", async () => {
    const { session } = createSession();
    const spectator = acceptSpectator(session);
    const attachmentBefore = structuredClone(spectator.deserializeAttachment());
    const classify = vi.spyOn(session.spectatorPolicy, "playerIndexForInbound");
    const run = vi.spyOn(session.coordinator, "run");

    await session.webSocketMessage(
      spectator as unknown as WebSocket,
      "x".repeat(MAX_CLIENT_MESSAGE_BYTES + 1)
    );

    expect(classify).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(spectator.closed).toEqual([
      { code: 1009, reason: "message too big" },
    ]);
    expect(spectator.deserializeAttachment()).toEqual({
      ...(attachmentBefore as SpectatorSocketAttachment),
      closeIntent: "MESSAGE_TOO_LARGE",
    });
  });

  it("closes and logs a spectator socket that exceeds its own frame budget", async () => {
    const { session } = createSession();
    const spectator = acceptSpectator(session);
    const attachment =
      spectator.deserializeAttachment() as SpectatorSocketAttachment;
    const run = vi.spyOn(session.coordinator, "run");

    for (
      let index = 0;
      index <= SPECTATOR_MESSAGE_RATE_LIMIT_BURST;
      index += 1
    ) {
      await session.webSocketMessage(
        spectator as unknown as WebSocket,
        spectatorFrames[index % spectatorFrames.length]!
      );
    }

    expect(run).not.toHaveBeenCalled();
    expect(spectator.closed).toEqual([
      {
        code: RATE_LIMIT_CLOSE_CODE,
        reason: SPECTATOR_MESSAGE_RATE_LIMIT_CLOSE_REASON,
      },
    ]);
    expect(logMock).toHaveBeenCalledWith("ws.spectator_message_rate_limited", {
      gameId: session.gameState.id,
      userId: "spectator-user",
      connectionId: attachment.connectionId,
    });
  });

  it("keeps spectator frame budgets isolated per connection", async () => {
    const { session } = createSession();
    const first = acceptSpectator(session);

    for (
      let index = 0;
      index <= SPECTATOR_MESSAGE_RATE_LIMIT_BURST;
      index += 1
    ) {
      await session.webSocketMessage(
        first as unknown as WebSocket,
        spectatorFrames[index % spectatorFrames.length]!
      );
    }
    const second = acceptSpectator(session);
    await session.webSocketMessage(
      second as unknown as WebSocket,
      spectatorFrames[0]!
    );

    expect(first.closed).toContainEqual({
      code: RATE_LIMIT_CLOSE_CODE,
      reason: SPECTATOR_MESSAGE_RATE_LIMIT_CLOSE_REASON,
    });
    expect(second.closed).toEqual([]);
  });

  it("keeps an exhausted socket frame budget across session reconstruction", async () => {
    const { session: beforeWake, state } = createSession();
    const spectator = acceptSpectator(beforeWake);

    for (let index = 0; index < SPECTATOR_MESSAGE_RATE_LIMIT_BURST; index += 1) {
      await beforeWake.webSocketMessage(
        spectator as unknown as WebSocket,
        spectatorFrames[index % spectatorFrames.length]!
      );
    }
    expect(spectator.closed).toEqual([]);

    const restoredState = state.hibernate();
    const restoredSpectator = restoredState.getWebSockets(
      "spectator:spectator-user"
    )[0] as unknown as MockWebSocket;
    const { session: afterWake } = createSession(restoredState);
    await afterWake.webSocketMessage(
      restoredSpectator as unknown as WebSocket,
      spectatorFrames[0]!
    );

    expect(restoredSpectator.closed).toEqual([
      {
        code: RATE_LIMIT_CLOSE_CODE,
        reason: SPECTATOR_MESSAGE_RATE_LIMIT_CLOSE_REASON,
      },
    ]);
  });

  it("closes before the coordinator when attachment budget persistence fails", async () => {
    const { session } = createSession();
    const spectator = acceptSpectator(session);
    spectator.serializationFails = true;
    const run = vi.spyOn(session.coordinator, "run");

    await session.webSocketMessage(
      spectator as unknown as WebSocket,
      spectatorFrames[0]!
    );

    expect(run).not.toHaveBeenCalled();
    expect(spectator.closed).toEqual([
      {
        code: RATE_LIMIT_CLOSE_CODE,
        reason: SPECTATOR_INVALID_SOCKET_CLOSE_REASON,
      },
    ]);
  });

  it("drops unidentified sockets before the coordinator", async () => {
    const { session, state } = createSession();
    const unidentified = new MockWebSocket();
    state.acceptWebSocket(unidentified as unknown as WebSocket, []);
    const run = vi.spyOn(session.coordinator, "run");

    await session.webSocketMessage(
      unidentified as unknown as WebSocket,
      spectatorFrames[0]!
    );

    expect(run).not.toHaveBeenCalled();
    expect(unidentified.closed).toEqual([]);
  });

  it.each([
    { attachment: true, tags: [] },
    { attachment: false, tags: ["spectator:spectator-user"] },
  ])(
    "closes an incomplete spectator identity before the coordinator: %j",
    async ({ attachment, tags }) => {
      const { session, state } = createSession();
      const spectator = new MockWebSocket();
      if (attachment) {
        spectator.serializeAttachment({
          type: "game-session-spectator-socket",
          userId: "spectator-user",
          connectionId: "connection-1",
          acceptedAt: 1,
        } satisfies SpectatorSocketAttachment);
      }
      state.acceptWebSocket(spectator as unknown as WebSocket, tags);
      const run = vi.spyOn(session.coordinator, "run");

      await session.webSocketMessage(
        spectator as unknown as WebSocket,
        spectatorFrames[0]!
      );

      expect(run).not.toHaveBeenCalled();
      expect(spectator.closed).toEqual([
        {
          code: RATE_LIMIT_CLOSE_CODE,
          reason: SPECTATOR_INVALID_SOCKET_CLOSE_REASON,
        },
      ]);
    }
  );

  it("rejects spectator signals on a player-tagged socket before the coordinator", async () => {
    const { session, state } = createSession();
    const socket = new MockWebSocket();
    socket.serializeAttachment({
      type: "game-session-spectator-socket",
      userId: "spectator-user",
      connectionId: "connection-1",
      acceptedAt: 1,
    } satisfies SpectatorSocketAttachment);
    state.acceptWebSocket(socket as unknown as WebSocket, [
      "player-0",
      "spectator:spectator-user",
    ]);
    const run = vi.spyOn(session.coordinator, "run");

    await session.webSocketMessage(
      socket as unknown as WebSocket,
      spectatorFrames[0]!
    );

    expect(run).not.toHaveBeenCalled();
    expect(socket.closed).toEqual([
      {
        code: RATE_LIMIT_CLOSE_CODE,
        reason: SPECTATOR_INVALID_SOCKET_CLOSE_REASON,
      },
    ]);
  });
});

describe("OPT-556 spectator connection budgets", () => {
  beforeEach(() => {
    logMock.mockReset();
  });

  it("keeps same-user upgrade exhaustion across session reconstruction", async () => {
    const { session: beforeEviction, state } = createSession();
    const consumePlayerUpgrade = vi.spyOn(
      beforeEviction.rateLimiter,
      "consumeUpgrade"
    );

    for (let index = 0; index < UPGRADE_RATE_LIMIT_BURST; index += 1) {
      await expect(
        beforeEviction.spectatorPolicy.consumeUpgrade("spectator-user")
      ).resolves.toMatchObject({ allowed: true });
    }
    await expect(
      beforeEviction.spectatorPolicy.consumeUpgrade("spectator-user")
    ).resolves.toMatchObject({ allowed: false, retryAfterSeconds: 5 });

    const restoredState = state.hibernate();
    const { session: afterEviction } = createSession(restoredState);
    await expect(
      afterEviction.spectatorPolicy.consumeUpgrade("spectator-user")
    ).resolves.toMatchObject({ allowed: false, retryAfterSeconds: 5 });
    await expect(
      afterEviction.spectatorPolicy.consumeUpgrade("spectator-two")
    ).resolves.toMatchObject({ allowed: true });
    expect(
      afterEviction.rateLimiter.consumeUpgrade(
        afterEviction.gameState.id,
        0
      ).allowed
    ).toBe(true);
    expect(consumePlayerUpgrade).not.toHaveBeenCalled();
    expect(state.putCalls).toHaveLength(UPGRADE_RATE_LIMIT_BURST + 1);
    expect(restoredState.putCalls).toHaveLength(2);
  });
});
