import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GameSession,
  UPGRADE_RATE_LIMIT_BURST,
  UPGRADE_RATE_LIMIT_REFILL_PER_SECOND,
  UPGRADE_RATE_LIMIT_RESPONSE_BODY,
  getTokenBucketRetryAfterSeconds,
} from "../GameSession.js";
import type { CardData, Env, GameState } from "../types.js";
import { setupGame } from "./factories.js";

class MockDurableObjectState {
  private readonly data = new Map<string, unknown>();
  readonly putCalls: { key: string; value: unknown }[] = [];
  readonly setAlarmCalls: number[] = [];

  storage = {
    get: async <T>(key: string): Promise<T | undefined> => this.data.get(key) as T | undefined,
    put: async (key: string, value: unknown): Promise<void> => {
      this.putCalls.push({ key, value });
      this.data.set(key, value);
    },
    setAlarm: async (timestamp: number): Promise<void> => {
      this.setAlarmCalls.push(timestamp);
    },
    deleteAlarm: async (): Promise<void> => undefined,
  };

  acceptWebSocket(): void {
    throw new Error("upgrade should be rejected before accepting a socket");
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
  cardDb: Map<string, CardData>;
  consumeUpgradeBudget(playerIndex: 0 | 1): { allowed: boolean; retryAfterSeconds: number };
  handleWebSocket(request: Request): Promise<Response>;
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

function b64url(input: string | ArrayBuffer): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function mintGameToken(userId: string, gameId: string, jti: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    sub: userId,
    iat: now,
    exp: now + 300,
    gameId,
    jti,
  }));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(signature)}`;
}

describe("OPT-336 WebSocket upgrade rate limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T17:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows a normal reconnect burst before throttling", () => {
    const { session } = createSession();

    for (let i = 0; i < UPGRADE_RATE_LIMIT_BURST; i += 1) {
      expect(session.consumeUpgradeBudget(0).allowed).toBe(true);
    }

    expect(session.consumeUpgradeBudget(0)).toEqual({
      allowed: false,
      retryAfterSeconds: 5,
    });
  });

  it("refills the upgrade budget for retry-friendly reconnects", () => {
    const { session } = createSession();

    for (let i = 0; i < UPGRADE_RATE_LIMIT_BURST; i += 1) {
      session.consumeUpgradeBudget(0);
    }
    expect(session.consumeUpgradeBudget(0).allowed).toBe(false);

    vi.advanceTimersByTime(5_000);

    expect(session.consumeUpgradeBudget(0).allowed).toBe(true);
  });

  it("isolates upgrade buckets per player", () => {
    const { session } = createSession();

    for (let i = 0; i < UPGRADE_RATE_LIMIT_BURST + 1; i += 1) {
      session.consumeUpgradeBudget(0);
    }

    expect(session.consumeUpgradeBudget(0).allowed).toBe(false);
    expect(session.consumeUpgradeBudget(1).allowed).toBe(true);
  });

  it("rejects excessive valid upgrades before connected-state writes", async () => {
    const { session, state } = createSession();
    for (let i = 0; i < UPGRADE_RATE_LIMIT_BURST + 1; i += 1) {
      session.consumeUpgradeBudget(0);
    }

    const token = await mintGameToken("user-p1", session.gameState.id, "upgrade-rate-limited-token");
    const response = await session.handleWebSocket(
      new Request(`https://worker.example.test/game/${session.gameState.id}/ws?token=${token}`, {
        headers: { Upgrade: "websocket" },
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toBe(UPGRADE_RATE_LIMIT_RESPONSE_BODY);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(state.putCalls.map((call) => call.key)).toEqual(["consumedTokenJtis"]);
    expect(state.setAlarmCalls).toEqual([]);
    expect(session.gameState.players[0].connected).toBe(false);
  });

  it("computes a minimum retry delay for empty buckets", () => {
    expect(getTokenBucketRetryAfterSeconds(
      { tokens: 0, updatedAt: Date.now() },
      UPGRADE_RATE_LIMIT_BURST,
      UPGRADE_RATE_LIMIT_REFILL_PER_SECOND,
    )).toBe(5);
  });
});
