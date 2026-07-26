import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workerPath = "../../../../workers/game/src/index.ts";
const sessionPath = "../../../../workers/game/src/GameSession.ts";
const worker = (await import(/* @vite-ignore */ workerPath)).default as {
  fetch(request: Request, env: unknown): Promise<Response>;
};
const { GameSession } = (await import(/* @vite-ignore */ sessionPath)) as {
  GameSession: new (state: unknown, env: unknown) => unknown;
};

const authMock = vi.fn();
const lobbyFindUniqueMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyUpdateMock = vi.fn();
const spectatorFindManyMock = vi.fn();
const spectatorDeleteManyMock = vi.fn();
const gameSessionFindFirstMock = vi.fn();
const queryRawMock = vi.fn();

const afterCalls = vi.hoisted(() => ({ pending: [] as Promise<void>[] }));

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => void | Promise<void>) => {
      afterCalls.pending.push(Promise.resolve().then(callback));
    },
  };
});
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: vi.fn(async () => ({ limited: false })) },
}));
vi.mock("@/lib/db", () => {
  const tx = {
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
    lobby: {
      findUnique: (...args: unknown[]) => lobbyFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args),
      update: (...args: unknown[]) => lobbyUpdateMock(...args),
    },
    lobbySpectator: {
      findMany: (...args: unknown[]) => spectatorFindManyMock(...args),
      deleteMany: (...args: unknown[]) => spectatorDeleteManyMock(...args),
    },
    lobbyGuest: {
      deleteMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    deck: { findFirst: vi.fn() },
  };
  return {
    prisma: {
      ...tx,
      $transaction: (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      gameSession: {
        findFirst: (...args: unknown[]) => gameSessionFindFirstMock(...args),
      },
    },
  };
});
vi.mock("@/lib/lobbies/build-state", () => ({
  buildLobbyRoomState: vi.fn(async () => null),
}));
vi.mock("@/lib/realtime/fanout-lobby", () => ({
  notifyLobby: vi.fn(async () => undefined),
  notifySpectatorsRemoved: vi.fn(async () => undefined),
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: vi.fn(async () => undefined),
}));
vi.mock("@/lib/lobbies/cancel-invites", () => ({
  cancelPendingLobbyInvites: vi.fn(async () => undefined),
}));

const lobbyRoute = await import("./[id]/route");
const spectatorRoute = await import("./[id]/spectators/route");
const hostRemovalRoute = await import("./[id]/spectators/[userId]/route");

class MockWebSocket {
  readonly closed: Array<{ code?: number; reason?: string }> = [];
  private attachment: unknown;

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }

  send(): void {}

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class MockDurableObjectState {
  private readonly data = new Map<string, unknown>();
  private readonly sockets: WebSocket[] = [];
  private readonly tags = new Map<WebSocket, string[]>();

  storage = {
    get: async <T>(key: string): Promise<T | undefined> =>
      this.data.get(key) as T | undefined,
    put: async (key: string, value: unknown): Promise<void> => {
      this.data.set(key, value);
    },
    setAlarm: async (): Promise<void> => undefined,
    deleteAlarm: async (): Promise<void> => undefined,
  };

  acceptWebSocket(ws: WebSocket, tags?: string[]): void {
    this.sockets.push(ws);
    this.tags.set(ws, tags ?? []);
  }

  getWebSockets(tag?: string): WebSocket[] {
    return tag
      ? this.sockets.filter((socket) => this.tags.get(socket)?.includes(tag))
      : this.sockets;
  }

  getTags(ws: WebSocket): string[] {
    return this.tags.get(ws) ?? [];
  }
}

type SessionAccess = {
  transport: {
    acceptSpectator(userId: string, ws: WebSocket, expiresAt: number): boolean;
  };
};

async function flushAfter(): Promise<void> {
  while (afterCalls.pending.length > 0) {
    await Promise.all(afterCalls.pending.splice(0));
  }
}

function connectSpectator(userId = "spectator-user"): MockWebSocket {
  const durableState = new MockDurableObjectState();
  const session = new GameSession(
    durableState,
    {
      GAME_WORKER_SECRET: "test-secret",
      NEXTJS_URL: "https://app.example.test",
    }
  ) as unknown as SessionAccess;
  const socket = new MockWebSocket();
  session.transport.acceptSpectator(
    userId,
    socket as unknown as WebSocket,
    Date.now() + 300_000
  );
  const workerEnv = {
    GAME_WORKER_SECRET: "test-secret",
    NEXTJS_URL: "https://app.example.test",
    GAME_SESSION: {
      idFromName: vi.fn(() => "durable-id"),
      get: vi.fn(() => session),
    },
  };
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    worker.fetch(new Request(input, init), workerEnv)
  );
  return socket;
}

function baseLobby(overrides: Record<string, unknown> = {}) {
  return {
    id: "lobby-1",
    hostUserId: "host-user",
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    format: "Standard",
    status: "IN_GAME",
    hostDeckId: "deck-1",
    hostReady: true,
    allowSpectators: true,
    revision: 7,
    guest: { userId: "guest-user", deckId: "deck-2", guestReady: true },
    spectators: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("GAME_WORKER_URL", "https://worker.example.test");
  vi.stubEnv("GAME_WORKER_SECRET", "test-secret");
  for (const mock of [
    authMock,
    lobbyFindUniqueMock,
    lobbyUpdateManyMock,
    lobbyUpdateMock,
    spectatorFindManyMock,
    spectatorDeleteManyMock,
    gameSessionFindFirstMock,
    queryRawMock,
  ]) {
    mock.mockReset();
  }
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyUpdateMock.mockResolvedValue({ id: "lobby-1" });
  spectatorDeleteManyMock.mockResolvedValue({ count: 1 });
  gameSessionFindFirstMock.mockResolvedValue({ id: "game-1" });
  queryRawMock.mockResolvedValue([{ id: "lobby-1" }]);
  afterCalls.pending.length = 0;
});

describe("spectator removal server-close integration", () => {
  it("toggle-off closes every connected removed spectator without client action", async () => {
    authMock.mockResolvedValue({ user: { id: "host-user" } });
    lobbyFindUniqueMock.mockResolvedValue(baseLobby());
    spectatorFindManyMock.mockResolvedValue([
      { userId: "spectator-user" },
    ]);
    const socket = connectSpectator();

    const response = await lobbyRoute.PATCH(
      new NextRequest("http://localhost/api/lobbies/lobby-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowSpectators: false }),
      }),
      { params: Promise.resolve({ id: "lobby-1" }) }
    );
    await flushAfter();

    expect(response.status).toBe(200);
    expect(socket.closed).toEqual([
      { code: 1008, reason: "spectator access revoked" },
    ]);
  });

  it("host removal closes the target socket without client action", async () => {
    authMock.mockResolvedValue({ user: { id: "host-user" } });
    lobbyFindUniqueMock.mockResolvedValue(
      baseLobby({ spectators: [{ userId: "spectator-user" }] })
    );
    const socket = connectSpectator();

    const response = await hostRemovalRoute.DELETE(
      new NextRequest(
        "http://localhost/api/lobbies/lobby-1/spectators/spectator-user",
        { method: "DELETE" }
      ),
      {
        params: Promise.resolve({
          id: "lobby-1",
          userId: "spectator-user",
        }),
      }
    );
    await flushAfter();

    expect(response.status).toBe(200);
    expect(socket.closed).toEqual([
      { code: 1008, reason: "spectator access revoked" },
    ]);
  });

  it("self-leave closes the caller socket without client action", async () => {
    authMock.mockResolvedValue({ user: { id: "spectator-user" } });
    lobbyFindUniqueMock.mockResolvedValue(
      baseLobby({ spectators: [{ userId: "spectator-user" }] })
    );
    const socket = connectSpectator();

    const response = await spectatorRoute.DELETE(
      new NextRequest("http://localhost/api/lobbies/lobby-1/spectators", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "lobby-1" }) }
    );
    await flushAfter();

    expect(response.status).toBe(200);
    expect(socket.closed).toEqual([
      { code: 1008, reason: "spectator access revoked" },
    ]);
  });

  it("lobby close closes every captured spectator without client action", async () => {
    authMock.mockResolvedValue({ user: { id: "host-user" } });
    lobbyFindUniqueMock.mockResolvedValue(
      baseLobby({
        status: "WAITING",
        spectators: [{ userId: "spectator-user" }],
      })
    );
    const socket = connectSpectator();

    const response = await lobbyRoute.DELETE(
      new NextRequest("http://localhost/api/lobbies/lobby-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "lobby-1" }) }
    );
    await flushAfter();

    expect(response.status).toBe(200);
    expect(socket.closed).toEqual([
      { code: 1008, reason: "spectator access revoked" },
    ]);
  });
});
