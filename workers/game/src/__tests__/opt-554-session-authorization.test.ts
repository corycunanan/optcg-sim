import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameSession } from "../GameSession.js";
import {
  SessionAuthorizer,
  type SessionParticipantIdentity,
} from "../session/authorization.js";
import type { Env, GameState } from "../types.js";
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

class MockDurableObjectState {
  private readonly data = new Map<string, unknown>();
  readonly acceptedSockets: WebSocket[] = [];

  storage = {
    get: async <T>(key: string): Promise<T | undefined> =>
      this.data.get(key) as T | undefined,
    put: async (key: string, value: unknown): Promise<void> => {
      this.data.set(key, value);
    },
    setAlarm: async (): Promise<void> => undefined,
    deleteAlarm: async (): Promise<void> => undefined,
  };

  acceptWebSocket(ws: WebSocket): void {
    this.acceptedSockets.push(ws);
  }

  getWebSockets(): WebSocket[] {
    return [];
  }

  getTags(): string[] {
    return [];
  }
}

type GameSessionTestAccess = {
  gameState: GameState;
  fetch(request: Request): Promise<Response>;
};

type TokenClaims = {
  sub?: string;
  gameId?: string;
  jti?: string;
  exp?: number;
  playerIndex?: 0 | 1;
  role?: string;
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
    const token = await mintToken(state);

    await expect(
      authorizer.validate(token, { state, mode: "PVP" })
    ).resolves.toEqual({ role: "spectator", userId: "spectator-user" });
    await expect(
      authorizer.validate(token, { state, mode: "PVP" })
    ).resolves.toBeNull();
    expect(logMock).toHaveBeenLastCalledWith("auth.failure", {
      reason: "spectator_token_replay",
      gameId: state.id,
      userId: "spectator-user",
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
    };

    expect(player.playerIndex).toBe(1);
    // @ts-expect-error Spectator identities must never expose playerIndex.
    expect(spectator.playerIndex).toBeUndefined();
  });
});
