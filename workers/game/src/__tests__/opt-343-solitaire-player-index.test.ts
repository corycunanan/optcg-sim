import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession.js";
import type { CardData, Env, GameState, LobbyMode } from "../types.js";
import { setupGame } from "./factories.js";

class MockDurableObjectState {
  private readonly data = new Map<string, unknown>();

  storage = {
    get: async <T>(key: string): Promise<T | undefined> =>
      this.data.get(key) as T | undefined,
    put: async (key: string, value: unknown): Promise<void> => {
      this.data.set(key, value);
    },
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };

  acceptWebSocket(): void {
    throw new Error("not needed for token validation tests");
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
  gameMode: LobbyMode;
  cardDb: Map<string, CardData>;
  validateToken(token: string): Promise<0 | 1 | null>;
};

function createSession(mode: LobbyMode): GameSessionTestAccess {
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
  session.gameMode = mode;
  session.cardDb = cardDb;
  return session;
}

function b64url(input: string | ArrayBuffer): string {
  const buffer =
    typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function mintToken(
  userId: string,
  gameId: string,
  jti: string,
  playerIndex?: 0 | 1
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      iat: now,
      exp: now + 300,
      gameId,
      jti,
      ...(playerIndex !== undefined ? { playerIndex } : {}),
    })
  );
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-secret"),
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

describe("OPT-343 Solitaire playerIndex trust gate", () => {
  it("accepts explicit playerIndex only for same-user Solitaire games", async () => {
    const session = createSession("SOLITAIRE");
    session.gameState = {
      ...session.gameState,
      players: [
        { ...session.gameState.players[0], playerId: "host-user" },
        { ...session.gameState.players[1], playerId: "host-user" },
      ],
    };

    const sideA = await mintToken(
      "host-user",
      session.gameState.id,
      "side-a",
      0
    );
    const sideB = await mintToken(
      "host-user",
      session.gameState.id,
      "side-b",
      1
    );

    await expect(session.validateToken(sideA)).resolves.toBe(0);
    await expect(session.validateToken(sideB)).resolves.toBe(1);
  });

  it("rejects explicit playerIndex for same-user PVP games", async () => {
    const session = createSession("PVP");
    session.gameState = {
      ...session.gameState,
      players: [
        { ...session.gameState.players[0], playerId: "host-user" },
        { ...session.gameState.players[1], playerId: "host-user" },
      ],
    };

    const token = await mintToken(
      "host-user",
      session.gameState.id,
      "pvp-spoof",
      1
    );

    await expect(session.validateToken(token)).resolves.toBeNull();
  });

  it("ignores explicit playerIndex for normal PVP users", async () => {
    const session = createSession("PVP");
    const token = await mintToken(
      "user-p2",
      session.gameState.id,
      "pvp-player-2-spoof",
      0
    );

    await expect(session.validateToken(token)).resolves.toBe(1);
  });
});
