import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GameSession,
  RATE_LIMIT_CLOSE_CODE,
  SPECTATOR_INVALID_SOCKET_CLOSE_REASON,
  SPECTATOR_MESSAGE_RATE_LIMIT_BURST,
  SPECTATOR_MESSAGE_RATE_LIMIT_CLOSE_REASON,
  SPECTATOR_UPGRADE_RATE_LIMIT_RESPONSE_BODY,
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

class PermissiveResponse {
  readonly status: number;
  readonly webSocket: unknown;
  readonly headers: Headers;

  constructor(
    private readonly body: BodyInit | null = null,
    init: ResponseInit & { webSocket?: unknown } = {}
  ) {
    this.status = init.status ?? 200;
    this.webSocket = init.webSocket;
    this.headers = new Headers(init.headers ?? {});
  }

  async text(): Promise<string> {
    return this.body ? String(this.body) : "";
  }
}

class MockDurableObjectState {
  private readonly sockets: MockWebSocket[] = [];
  private readonly tags = new Map<MockWebSocket, string[]>();

  storage = {
    get: async () => undefined,
    put: async () => undefined,
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

function createSession(): {
  session: GameSessionTestAccess;
  state: MockDurableObjectState;
} {
  const state = new MockDurableObjectState();
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

  it("charges every same-user upgrade and rejects the first over-budget replacement", async () => {
    const { session } = createSession();
    vi.spyOn(session, "validateToken").mockResolvedValue({
      role: "spectator",
      userId: "spectator-user",
    });
    const consumePlayerUpgrade = vi.spyOn(
      session.rateLimiter,
      "consumeUpgrade"
    );
    const servers: MockWebSocket[] = [];
    const originalWebSocketPair = (globalThis as Record<string, unknown>)
      .WebSocketPair;
    const originalResponse = globalThis.Response;
    const pairConstructor = vi.fn(function MockWebSocketPair(
      this: Record<number, MockWebSocket>
    ) {
      this[0] = new MockWebSocket();
      this[1] = new MockWebSocket();
      servers.push(this[1]);
    });
    (globalThis as Record<string, unknown>).WebSocketPair = pairConstructor;
    globalThis.Response = PermissiveResponse as unknown as typeof Response;

    try {
      for (let index = 0; index < UPGRADE_RATE_LIMIT_BURST; index += 1) {
        const response = await session.handleWebSocket(
          new Request(
            `https://worker.example.test/ws?token=replacement-${index}`
          )
        );
        expect(response.status).toBe(101);
      }

      const rejected = await session.handleWebSocket(
        new Request("https://worker.example.test/ws?token=over-budget")
      );

      expect(rejected.status).toBe(429);
      expect(await rejected.text()).toBe(
        SPECTATOR_UPGRADE_RATE_LIMIT_RESPONSE_BODY
      );
      expect(rejected.headers.get("Retry-After")).toBe("5");
      expect(pairConstructor).toHaveBeenCalledTimes(UPGRADE_RATE_LIMIT_BURST);
      expect(servers.at(-1)?.closed).toEqual([]);
      expect(
        servers.slice(0, -1).every((socket) => socket.closed.length >= 1)
      ).toBe(true);
      expect(consumePlayerUpgrade).not.toHaveBeenCalled();
      expect(logMock).toHaveBeenCalledWith(
        "ws.spectator_upgrade_rate_limited",
        {
          gameId: session.gameState.id,
          userId: "spectator-user",
          retryAfterSeconds: 5,
        }
      );
    } finally {
      if (originalWebSocketPair === undefined) {
        delete (globalThis as Record<string, unknown>).WebSocketPair;
      } else {
        (globalThis as Record<string, unknown>).WebSocketPair =
          originalWebSocketPair;
      }
      globalThis.Response = originalResponse;
    }
  });

  it("keeps spectator upgrade identities isolated from each other and players", () => {
    const { session } = createSession();

    for (let index = 0; index <= UPGRADE_RATE_LIMIT_BURST; index += 1) {
      session.spectatorPolicy.consumeUpgrade("spectator-one");
    }

    expect(
      session.spectatorPolicy.consumeUpgrade("spectator-one").allowed
    ).toBe(false);
    expect(
      session.spectatorPolicy.consumeUpgrade("spectator-two").allowed
    ).toBe(true);
    expect(
      session.rateLimiter.consumeUpgrade(session.gameState.id, 0).allowed
    ).toBe(true);
  });
});
