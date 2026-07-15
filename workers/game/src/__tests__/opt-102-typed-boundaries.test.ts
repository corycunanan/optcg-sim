import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession.js";
import type { Env } from "../types.js";
import { createTestPayload } from "./helpers.js";

class MockDurableObjectState {
  private readonly values = new Map<string, unknown>();

  storage = {
    get: async <T>(key: string): Promise<T | undefined> =>
      this.values.get(key) as T | undefined,
    put: async (
      keyOrEntries: string | Record<string, unknown>,
      value?: unknown
    ): Promise<void> => {
      if (typeof keyOrEntries === "string") {
        this.values.set(keyOrEntries, value);
        return;
      }
      for (const [key, entry] of Object.entries(keyOrEntries)) {
        this.values.set(key, entry);
      }
    },
    setAlarm: async (): Promise<void> => undefined,
    deleteAlarm: async (): Promise<void> => undefined,
  };

  acceptWebSocket(): void {}
  getWebSockets(): WebSocket[] {
    return [];
  }
  getTags(): string[] {
    return [];
  }
}

function createSession(): GameSession {
  return new GameSession(
    new MockDurableObjectState() as unknown as DurableObjectState,
    {
      GAME_WORKER_SECRET: "test-secret",
      NEXTJS_URL: "https://app.example.test",
    } as Env
  );
}

async function initializeWithSchema(effectSchema: unknown): Promise<Response> {
  const payload = createTestPayload();
  const [firstDeckEntry, ...remainingDeck] = payload.player1.deck;
  const boundaryPayload = {
    ...payload,
    player1: {
      ...payload.player1,
      deck: [
        {
          ...firstDeckEntry,
          cardData: { ...firstDeckEntry.cardData, effectSchema },
        },
        ...remainingDeck,
      ],
    },
  };
  return createSession().fetch(
    new Request("https://worker.example.test/game/test/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(boundaryPayload),
    })
  );
}

describe("OPT-102 typed production boundaries", () => {
  it("rejects unknown nested filter fields at GameSession init", async () => {
    const response = await initializeWithSchema({
      effects: [
        {
          id: "unknown-filter-field",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [
            {
              type: "KO",
              target: {
                type: "CHARACTER",
                controller: "OPPONENT",
                count: { up_to: 1 },
                filter: { power_max: 6_000, invented_field: true },
              },
            },
          ],
        },
      ],
    });

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain(
      "Unknown target filter field 'invented_field'"
    );
  });

  it("rejects unknown action fields at GameSession init", async () => {
    const response = await initializeWithSchema({
      effects: [
        {
          id: "unknown-action-field",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [
            {
              type: "DRAW",
              params: { amount: 1 },
              invented_field: true,
            },
          ],
        },
      ],
    });

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain(
      "Unknown action field 'invented_field'"
    );
  });
});
