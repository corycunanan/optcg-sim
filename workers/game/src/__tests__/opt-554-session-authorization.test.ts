import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameSession } from "../GameSession.js";
import {
  SessionAuthorizer,
  type SessionParticipantIdentity,
} from "../session/authorization.js";
import { SessionTransport } from "../session/transport.js";
import type { CardData, Env, GameState } from "../types.js";
import { setupGame } from "./factories.js";

const logMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/log.js", () => ({ configureLogger: vi.fn(), log: logMock }));

class MemoryStorage {
  private readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
}

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
  readonly acceptedSockets: WebSocket[] = [];
  private readonly tags = new Map<WebSocket, string[]>();

  storage = {
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
    this.acceptedSockets.push(ws);
    this.tags.set(ws, tags ?? []);
  }

  getWebSockets(tag?: string): WebSocket[] {
    return tag
      ? this.acceptedSockets.filter((ws) => this.tags.get(ws)?.includes(tag))
      : this.acceptedSockets;
  }

  getTags(ws: WebSocket): string[] {
    return this.tags.get(ws) ?? [];
  }
}

type GameSessionTestAccess = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  transport: SessionTransport;
  fetch(request: Request): Promise<Response>;
  persist(): Promise<void>;
  alarm(): Promise<void>;
  webSocketMessage(ws: WebSocket, message: string): Promise<void>;
};

type TokenClaims = {
  sub?: string;
  gameId?: string;
  jti?: string;
  exp?: number;
  playerIndex?: 0 | 1;
  role?: string;
  spectatorName?: string;
};

async function mintToken(
  state: GameState | null,
  claims: TokenClaims = {},
  secret = "test-secret"
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: "spectator-user",
      iat: now,
      exp: now + 300,
      gameId: state?.id ?? "missing-game",
      jti: "spectator-jti",
      role: "spectator",
      ...claims,
    })
  );
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64url(signature)}`;
}

function b64url(input: string | ArrayBuffer): string {
  return Buffer.from(
    typeof input === "string" ? input : new Uint8Array(input)
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

describe("OPT-554 spectator session authorization", () => {
  beforeEach(() => {
    logMock.mockReset();
  });

  it("returns a spectator identity and consumes its jti once", async () => {
    const storage = new MemoryStorage();
    const authorizer = new SessionAuthorizer(storage, "test-secret");
    const { state } = setupGame();
    const exp = Math.floor(Date.now() / 1000) + 300;
    const token = await mintToken(state, { exp, spectatorName: "Nico Robin" });

    await expect(
      authorizer.validate(token, { state, mode: "PVP" })
    ).resolves.toEqual({
      role: "spectator",
      userId: "spectator-user",
      displayName: "Nico Robin",
      expiresAt: exp * 1000,
    });
    await expect(
      authorizer.validate(token, { state, mode: "PVP" })
    ).resolves.toBeNull();
    expect(logMock).toHaveBeenLastCalledWith("auth.failure", {
      reason: "spectator_token_replay",
      gameId: state.id,
      userId: "spectator-user",
    });
  });

  it("renders legacy spectator tokens without a name as Spectator", async () => {
    const storage = new MemoryStorage();
    const authorizer = new SessionAuthorizer(storage, "test-secret");
    const { state } = setupGame();
    const exp = Math.floor(Date.now() / 1000) + 300;
    const token = await mintToken(state, { exp, jti: "legacy-name-jti" });

    await expect(
      authorizer.validate(token, { state, mode: "PVP" })
    ).resolves.toEqual({
      role: "spectator",
      userId: "spectator-user",
      displayName: "Spectator",
      expiresAt: exp * 1000,
    });
  });

  it("rejects spectator WebSocket upgrades before pair construction or socket acceptance", async () => {
    const durableState = new MockDurableObjectState();
    const env = {
      GAME_WORKER_SECRET: "test-secret",
      NEXTJS_URL: "https://app.example.test",
    } as Env;
    const session = new GameSession(
      durableState as unknown as DurableObjectState,
      env
    ) as unknown as GameSessionTestAccess;
    const { state } = setupGame();
    session.gameState = state;
    const token = await mintToken(state, { jti: "spectator-upgrade" });
    const originalWebSocketPair = (globalThis as Record<string, unknown>)
      .WebSocketPair;
    const pairConstructor = vi.fn(function MockWebSocketPair() {});
    (globalThis as Record<string, unknown>).WebSocketPair = pairConstructor;

    try {
      const response = await session.fetch(
        new Request(
          `https://worker.example.test/game/${state.id}/ws?token=${encodeURIComponent(token)}`,
          { headers: { Upgrade: "websocket" } }
        )
      );

      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Unauthorized");
      expect(pairConstructor).not.toHaveBeenCalled();
      expect(durableState.acceptedSockets).toEqual([]);
    } finally {
      if (originalWebSocketPair === undefined) {
        delete (globalThis as Record<string, unknown>).WebSocketPair;
      } else {
        (globalThis as Record<string, unknown>).WebSocketPair =
          originalWebSocketPair;
      }
    }
  });

  it("authenticates server push and closes a spectator without client cooperation", async () => {
    const durableState = new MockDurableObjectState();
    const session = new GameSession(
      durableState as unknown as DurableObjectState,
      {
        GAME_WORKER_SECRET: "test-secret",
        NEXTJS_URL: "https://app.example.test",
      } as Env
    ) as unknown as GameSessionTestAccess;
    const { state, cardDb } = setupGame();
    session.gameState = state;
    session.cardDb = cardDb;
    const player = new MockWebSocket();
    const spectator = new MockWebSocket();
    session.transport.accept(0, player as unknown as WebSocket);
    session.transport.acceptSpectator(
      "spectator-user",
      spectator as unknown as WebSocket,
      Date.now() + 300_000
    );

    const unauthorized = await session.fetch(
      new Request(`https://worker.test/game/${state.id}/revoke-spectators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobbyId: "lobby-1",
          revision: 8,
          userIds: ["spectator-user"],
        }),
      })
    );
    expect(unauthorized.status).toBe(401);
    expect(spectator.closed).toEqual([]);

    const malformed = await session.fetch(
      new Request(`https://worker.test/game/${state.id}/revoke-spectators`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lobbyId: "lobby-1", revision: 8, userIds: [] }),
      })
    );
    expect(malformed.status).toBe(400);
    expect(spectator.closed).toEqual([]);

    const response = await session.fetch(
      new Request(`https://worker.test/game/${state.id}/revoke-spectators`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lobbyId: "lobby-1",
          revision: 8,
          userIds: ["spectator-user"],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, closed: 1 });
    expect(spectator.closed).toEqual([
      { code: 1008, reason: "spectator access revoked" },
    ]);
    expect(player.closed).toEqual([]);

    const reconstructed = new GameSession(
      durableState as unknown as DurableObjectState,
      {
        GAME_WORKER_SECRET: "test-secret",
        NEXTJS_URL: "https://app.example.test",
      } as Env
    ) as unknown as GameSessionTestAccess;
    const rejoined = new MockWebSocket();
    reconstructed.transport.acceptSpectator(
      "spectator-user",
      rejoined as unknown as WebSocket,
      Date.now() + 300_000
    );
    const replay = await reconstructed.fetch(
      new Request(`https://worker.test/game/${state.id}/revoke-spectators`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lobbyId: "lobby-1",
          revision: 8,
          userIds: ["spectator-user"],
        }),
      })
    );
    expect(replay.status).toBe(409);
    expect(rejoined.closed).toEqual([]);

    const overlong = await reconstructed.fetch(
      new Request(`https://worker.test/game/${state.id}/revoke-spectators`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lobbyId: "lobby-1",
          revision: 9,
          userIds: ["x".repeat(100_000)],
        }),
      })
    );
    expect(overlong.status).toBe(400);
    expect(rejoined.closed).toEqual([]);
  });

  it("reconstructs the DO and closes a hibernated spectator from alarm expiry", async () => {
    const durableState = new MockDurableObjectState();
    const env = {
      GAME_WORKER_SECRET: "test-secret",
      NEXTJS_URL: "https://app.example.test",
    } as Env;
    const beforeHibernate = new GameSession(
      durableState as unknown as DurableObjectState,
      env
    ) as unknown as GameSessionTestAccess;
    const { state, cardDb } = setupGame();
    beforeHibernate.gameState = state;
    beforeHibernate.cardDb = cardDb;
    const spectator = new MockWebSocket();
    beforeHibernate.transport.acceptSpectator(
      "spectator-user",
      spectator as unknown as WebSocket,
      2_000
    );
    await beforeHibernate.persist();

    const afterHibernate = new GameSession(
      durableState as unknown as DurableObjectState,
      env
    ) as unknown as GameSessionTestAccess;
    const now = vi.spyOn(Date, "now").mockReturnValue(2_000);
    try {
      await afterHibernate.alarm();
    } finally {
      now.mockRestore();
    }

    expect(spectator.closed).toEqual([
      { code: 1008, reason: "spectator token expired" },
    ]);
  });

  it("drops every spectator frame as a non-player without closing the socket", async () => {
    const durableState = new MockDurableObjectState();
    const env = {
      GAME_WORKER_SECRET: "test-secret",
      NEXTJS_URL: "https://app.example.test",
    } as Env;
    const session = new GameSession(
      durableState as unknown as DurableObjectState,
      env
    ) as unknown as GameSessionTestAccess;
    const { state, cardDb } = setupGame();
    session.gameState = state;
    session.cardDb = cardDb;
    const stateBeforeFrames = structuredClone(state);
    const spectator = new MockWebSocket();
    session.transport.acceptSpectator(
      "spectator-user",
      spectator as unknown as WebSocket
    );
    const playerIndexFor = vi.spyOn(session.transport, "playerIndexFor");

    for (const frame of [
      JSON.stringify({ type: "game:action", action: { type: "END_TURN" } }),
      JSON.stringify({
        type: "game:prompt",
        promptId: "spectator-prompt",
        options: { promptType: "PLAYER_CHOICE" },
      }),
      "{malformed-json",
    ]) {
      await session.webSocketMessage(
        spectator as unknown as WebSocket,
        frame
      );
    }

    expect(playerIndexFor).toHaveBeenCalledTimes(3);
    expect(
      session.transport.playerIndexFor(spectator as unknown as WebSocket)
    ).toBeNull();
    expect(spectator.closed).toEqual([]);
    expect(spectator.sent).toEqual([]);
    expect(session.gameState).toEqual(stateBeforeFrames);
  });

  it("rejects a spectator token carrying playerIndex with its own reason", async () => {
    const authorizer = new SessionAuthorizer(new MemoryStorage(), "test-secret");
    const { state } = setupGame();
    const token = await mintToken(state, { playerIndex: 0 });

    await expect(
      authorizer.validate(token, { state, mode: "PVP" })
    ).resolves.toBeNull();
    expect(logMock).toHaveBeenLastCalledWith("auth.failure", {
      reason: "spectator_player_index_forbidden",
      gameId: state.id,
      userId: "spectator-user",
    });
  });

  it("rejects a spectator token when game state is missing with its own reason", async () => {
    const authorizer = new SessionAuthorizer(new MemoryStorage(), "test-secret");
    const token = await mintToken(null);

    await expect(
      authorizer.validate(token, { state: null, mode: "PVP" })
    ).resolves.toBeNull();
    expect(logMock).toHaveBeenLastCalledWith("auth.failure", {
      reason: "spectator_no_game_state",
    });
  });

  it("rejects unknown roles as invalid signed token claims", async () => {
    const authorizer = new SessionAuthorizer(new MemoryStorage(), "test-secret");
    const { state } = setupGame();
    const token = await mintToken(state, { role: "player" });

    await expect(
      authorizer.validate(token, { state, mode: "PVP" })
    ).resolves.toBeNull();
    expect(logMock).toHaveBeenLastCalledWith("auth.failure", {
      reason: "invalid_token",
      gameId: state.id,
    });
  });

  it("verifies spectator signature and expiration before trusting the role", async () => {
    const authorizer = new SessionAuthorizer(new MemoryStorage(), "test-secret");
    const { state } = setupGame();
    const badSignature = await mintToken(state, {}, "wrong-secret");
    const expired = await mintToken(state, { exp: 1, jti: "expired" });

    await expect(
      authorizer.validate(badSignature, { state, mode: "PVP" })
    ).resolves.toBeNull();
    await expect(
      authorizer.validate(expired, { state, mode: "PVP" })
    ).resolves.toBeNull();
    expect(logMock).toHaveBeenNthCalledWith(1, "auth.failure", {
      reason: "invalid_token",
      gameId: state.id,
    });
    expect(logMock).toHaveBeenNthCalledWith(2, "auth.failure", {
      reason: "invalid_token",
      gameId: state.id,
    });
  });

  it("proves the participant discriminant narrows playerIndex", () => {
    const player: SessionParticipantIdentity = {
      role: "player",
      playerIndex: 1,
    };
    const spectator: SessionParticipantIdentity = {
      role: "spectator",
      userId: "spectator-user",
      displayName: "Spectator",
      expiresAt: 1,
    };

    expect(player.playerIndex).toBe(1);
    // @ts-expect-error Spectator identities must never expose playerIndex.
    expect(spectator.playerIndex).toBeUndefined();
  });
});
