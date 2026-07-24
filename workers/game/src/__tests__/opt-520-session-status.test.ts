import { describe, expect, it, vi } from "vitest";
import worker from "../index.js";
import { GameSession } from "../GameSession.js";
import type { CardData, Env, GameState } from "../types.js";
import { setupGame } from "./factories.js";

class MockDurableObjectState {
  storage = {
    get: async () => undefined,
    put: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };

  getWebSockets(): WebSocket[] {
    return [];
  }

  getTags(): string[] {
    return [];
  }
}

type GameSessionTestAccess = {
  gameState: GameState | null;
  cardDb: Map<string, CardData> | null;
};

function createSession(): {
  session: GameSession;
  access: GameSessionTestAccess;
} {
  const session = new GameSession(
    new MockDurableObjectState() as unknown as DurableObjectState,
    {
      GAME_WORKER_SECRET: "test-secret",
      NEXTJS_URL: "https://app.example.test",
    } as Env
  );
  const access = session as unknown as GameSessionTestAccess;
  const { state, cardDb } = setupGame();
  access.gameState = state;
  access.cardDb = cardDb;
  return { session, access };
}

function statusRequest(secret = "test-secret") {
  return new Request("https://worker.example/game/game-1/status", {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

describe("GET /game/:gameId/status", () => {
  it("reports an initialized live session without mutating it", async () => {
    const { session, access } = createSession();
    const before = access.gameState;

    const response = await session.fetch(statusRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "IN_PROGRESS",
      winnerId: null,
      winReason: null,
    });
    expect(access.gameState).toBe(before);
  });

  it("reports the authoritative terminal result", async () => {
    const { session, access } = createSession();
    access.gameState = {
      ...access.gameState!,
      status: "FINISHED",
      winner: 1,
      winReason: "Leader KO",
    };

    const response = await session.fetch(statusRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "FINISHED",
      winnerId: access.gameState.players[1].playerId,
      winReason: "Leader KO",
    });
  });

  it("reports an absent Durable Object session", async () => {
    const { session, access } = createSession();
    access.gameState = null;
    access.cardDb = null;

    const response = await session.fetch(statusRequest());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "ABSENT" });
  });

  it("rejects an invalid shared secret", async () => {
    const { session } = createSession();

    const response = await session.fetch(statusRequest("wrong"));

    expect(response.status).toBe(401);
  });

  it("routes and authenticates the status probe at the worker boundary", async () => {
    const stubFetch = vi
      .fn()
      .mockResolvedValue(Response.json({ status: "ABSENT" }, { status: 404 }));
    const idFromName = vi.fn().mockReturnValue("durable-id");
    const get = vi.fn().mockReturnValue({ fetch: stubFetch });
    const env = {
      GAME_WORKER_SECRET: "test-secret",
      GAME_SESSION: { idFromName, get },
    } as unknown as Env;

    const response = await worker.fetch(statusRequest(), env);

    expect(response.status).toBe(404);
    expect(idFromName).toHaveBeenCalledWith("game-1");
    expect(get).toHaveBeenCalledWith("durable-id");
    expect(stubFetch).toHaveBeenCalledOnce();

    const unauthorized = await worker.fetch(statusRequest("wrong"), env);
    expect(unauthorized.status).toBe(401);
    expect(stubFetch).toHaveBeenCalledOnce();
  });
});
