import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { GameAction, GameState, ServerMessage } from "../types.js";
import { SessionAuthorizer } from "../session/authorization.js";
import { SessionCoordinator } from "../session/coordinator.js";
import {
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import {
  DISCONNECT_BROADCAST_DEBOUNCE_MS,
  SessionTransport,
} from "../session/transport.js";
import { setupGame } from "./factories.js";

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  readonly alarms: number[] = [];
  deleteAlarmCalls = 0;

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(
    keyOrEntries: string | Record<string, unknown>,
    value?: unknown,
  ): Promise<void> {
    if (typeof keyOrEntries === "string") {
      this.data.set(keyOrEntries, value);
      return;
    }
    for (const [key, entry] of Object.entries(keyOrEntries)) {
      this.data.set(key, entry);
    }
  }

  async setAlarm(timestamp: number): Promise<void> {
    this.alarms.push(timestamp);
  }

  async deleteAlarm(): Promise<void> {
    this.deleteAlarmCalls += 1;
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

class MockSocketState {
  private readonly sockets: MockWebSocket[] = [];
  private readonly tags = new Map<MockWebSocket, string[]>();

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

describe("OPT-479 GameSession collaborator contracts", () => {
  it("serializes overlapping engine commands in arrival order", async () => {
    const coordinator = new SessionCoordinator();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = coordinator.run(async () => {
      order.push("first:start");
      await firstGate;
      order.push("first:end");
      return 1;
    });
    const second = coordinator.run(async () => {
      order.push("second");
      return 2;
    });

    await vi.waitFor(() => expect(order).toEqual(["first:start"]));
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("rejects stale prompt identities before they can become normal actions", () => {
    const coordinator = new SessionCoordinator();
    const { state } = setupGame();
    const stale = {
      type: "PASS",
      promptId: "prompt-already-resolved",
    } satisfies GameAction;

    expect(coordinator.routePromptResponse(state, 0, stale)).toMatchObject({
      kind: "reject",
      reason: "That prompt response is stale",
      state,
    });
  });

  it("cancels a pending disconnect when a reconnect becomes authoritative", async () => {
    vi.useFakeTimers();
    try {
      const socketState = new MockSocketState();
      const disconnected = vi.fn();
      const transport = new SessionTransport(socketState, disconnected, () =>
        Date.now()
      );
      const first = new MockWebSocket();
      const replacement = new MockWebSocket();

      transport.accept(0, first as unknown as WebSocket);
      transport.scheduleDisconnect(0);
      vi.advanceTimersByTime(50);
      transport.accept(0, replacement as unknown as WebSocket);
      await vi.advanceTimersByTimeAsync(DISCONNECT_BROADCAST_DEBOUNCE_MS + 1);

      expect(transport.playerSocket(0)).toBe(replacement);
      expect(first.closed).toEqual([{ code: 1000, reason: "superseded" }]);
      expect(disconnected).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters one state independently for each authoritative recipient", () => {
    const socketState = new MockSocketState();
    const transport = new SessionTransport(
      socketState,
      () => undefined,
      () => 1_000
    );
    const player0 = new MockWebSocket();
    const player1 = new MockWebSocket();
    transport.accept(0, player0 as unknown as WebSocket);
    transport.accept(1, player1 as unknown as WebSocket);
    const { state, cardDb } = setupGame();

    transport.broadcastFilteredState(state, cardDb, (visible) => ({
      type: "game:state",
      state: visible,
    }));

    const view0 = JSON.parse(player0.sent[0]) as Extract<
      ServerMessage,
      { type: "game:state" }
    >;
    const view1 = JSON.parse(player1.sent[0]) as Extract<
      ServerMessage,
      { type: "game:state" }
    >;
    expect(view0.state.players[0].hand[0]?.cardId).not.toBe("hidden");
    expect(view0.state.players[1].hand[0]?.cardId).toBe("hidden");
    expect(view1.state.players[1].hand[0]?.cardId).not.toBe("hidden");
    expect(view1.state.players[0].hand[0]?.cardId).toBe("hidden");
  });

  it("restores a complete snapshot and synchronizes the earliest alarm", async () => {
    const storage = new MemoryStorage();
    const repository = new SessionRepository(storage, {
      nextJsUrl: "https://app.example.test",
      workerSecret: "secret",
    });
    const { state, cardDb } = setupGame();
    const prompted: GameState = {
      ...state,
      pendingPrompt: {
        options: {
          promptType: "PLAYER_CHOICE",
          effectDescription: "Choose",
          choices: [{ id: "yes", label: "Yes" }],
        },
        respondingPlayer: 0,
        resumeContext: null,
      },
    };
    const saved = await repository.save({
      state: prompted,
      cardDb,
      mode: "SOLITAIRE",
      testPriorityRolls: [6, 1],
      undoHistory: [state],
    });
    const restored = await repository.load();

    expect(saved.state.pendingPrompt?.promptId).toBeTruthy();
    expect(restored).toEqual(saved);

    const alarmState: GameState = {
      ...saved.state,
      players: [
        {
          ...saved.state.players[0],
          connected: false,
          rejoinDeadlineAt: 2_000,
        },
        {
          ...saved.state.players[1],
          connected: false,
          rejoinDeadlineAt: 1_500,
        },
      ],
    };
    await repository.syncAlarm(alarmState);
    expect(storage.alarms).toEqual([1_500]);

    await repository.syncAlarm({
      ...alarmState,
      players: alarmState.players.map((player) => ({
        ...player,
        connected: true,
        rejoinDeadlineAt: null,
      })) as GameState["players"],
    });
    expect(storage.deleteAlarmCalls).toBe(1);
  });

  it("contains result callback failures at the persistence boundary", async () => {
    const storage = new MemoryStorage();
    const fetchResult = vi.fn(async () => {
      throw new Error("upstream unavailable");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const repository = new SessionRepository(
        storage,
        { nextJsUrl: "https://app.example.test", workerSecret: "secret" },
        fetchResult
      );
      const { state } = setupGame();

      await expect(repository.writeResult(state)).resolves.toBeUndefined();
      expect(fetchResult).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps solitaire side authorization and token replay in the auth adapter", async () => {
    const storage = new MemoryStorage();
    const authorizer = new SessionAuthorizer(storage, "test-secret");
    const { state } = setupGame();
    const userId = "same-user";
    const solitaire: GameState = {
      ...state,
      players: [
        { ...state.players[0], playerId: userId },
        { ...state.players[1], playerId: userId },
      ],
    };
    const token = await mintGameToken(userId, state.id, "single-use", 1);

    await expect(
      authorizer.validate(token, { state: solitaire, mode: "SOLITAIRE" })
    ).resolves.toBe(1);
    await expect(
      authorizer.validate(token, { state: solitaire, mode: "SOLITAIRE" })
    ).resolves.toBeNull();
  });

  it("locks the composition-root dependency direction", () => {
    const root = readFileSync(
      new URL("../GameSession.ts", import.meta.url),
      "utf8"
    );
    expect(root.split("\n").length).toBeLessThan(1_000);
    for (const boundary of [
      "authorization",
      "coordinator",
      "persistence",
      "prompt-lifecycle",
      "rate-limiter",
      "transport",
    ]) {
      expect(root).toContain(`./session/${boundary}.js`);
    }

    const transport = readFileSync(
      new URL("../session/transport.ts", import.meta.url),
      "utf8"
    );
    expect(transport).toContain('./visibility.js"');

    for (const boundary of ["coordinator", "prompt-lifecycle"]) {
      const source = readFileSync(
        new URL(`../session/${boundary}.ts`, import.meta.url),
        "utf8"
      );
      expect(source).not.toMatch(/\bDurableObject(?:State|Storage)\b/);
      expect(source).not.toMatch(/:\s*WebSocket\b/);
      expect(source).not.toMatch(/\bSessionStorage\b/);
    }

    for (const source of readTypeScriptTree(
      new URL("../engine/", import.meta.url)
    )) {
      expect(source).not.toMatch(
        /\bDurableObject(?:State|Storage)\b|\bWebSocket\b|\.storage\b/
      );
      expect(source).not.toMatch(/from\s+["'][^"']*session\//);
    }
  });
});

function readTypeScriptTree(directory: URL): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(
      entry.isDirectory() ? `${entry.name}/` : entry.name,
      directory
    );
    if (entry.isDirectory()) return readTypeScriptTree(url);
    return entry.name.endsWith(".ts") ? [readFileSync(url, "utf8")] : [];
  });
}

function base64url(input: string | ArrayBuffer): string {
  const buffer =
    typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function mintGameToken(
  userId: string,
  gameId: string,
  jti: string,
  playerIndex: 0 | 1
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: userId,
      iat: now,
      exp: now + 300,
      gameId,
      jti,
      playerIndex,
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
  return `${signingInput}.${base64url(signature)}`;
}
