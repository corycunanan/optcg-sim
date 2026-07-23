import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const requirePlayableDeckMock = vi.fn();
const buildGameInitPayloadMock = vi.fn((input: unknown) => ({
  ...(typeof input === "object" && input !== null ? input : {}),
  gameId: "game-1",
  mode: "PVP",
  pregameMode: "PRIORITY_ROLL",
}));
const lobbyFindUniqueMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyUpdateMock = vi.fn();
const gameSessionCreateMock = vi.fn();
const gameSessionFindFirstMock = vi.fn();
const gameSessionDeleteMock = vi.fn();
const transactionMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const notifyLobbyMock = vi.fn();

class TestDeckNotFoundError extends Error {}
class TestDeckInvalidError extends Error {
  details = [
    {
      id: "ban-status",
      rule: "Ban List",
      message: "Banned Card banned",
      severity: "error",
      passed: false,
      cardIds: ["CARD-1"],
    },
  ];
}

vi.stubEnv("GAME_WORKER_URL", "https://worker.example.test");
vi.stubEnv("GAME_WORKER_SECRET", "secret");

// Track `after()` callbacks so tests can deterministically flush them before
// asserting on fanout side effects.
const afterCalls = vi.hoisted(() => ({
  pending: [] as Promise<void>[],
}));

async function flushAfter(): Promise<void> {
  while (afterCalls.pending.length) {
    const batch = afterCalls.pending.splice(0);
    await Promise.all(batch);
  }
}

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => void | Promise<void>) => {
      afterCalls.pending.push(Promise.resolve().then(cb));
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    lobby: {
      findUnique: (...args: unknown[]) => lobbyFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args),
      update: (...args: unknown[]) => lobbyUpdateMock(...args),
    },
    gameSession: {
      create: (...args: unknown[]) => gameSessionCreateMock(...args),
      findFirst: (...args: unknown[]) => gameSessionFindFirstMock(...args),
      delete: (...args: unknown[]) => gameSessionDeleteMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/decks/playable", () => ({
  DECK_INVALID_CODE: "DECK_INVALID",
  DeckInvalidError: TestDeckInvalidError,
  DeckNotFoundError: TestDeckNotFoundError,
  requirePlayableDeck: (...args: unknown[]) => requirePlayableDeckMock(...args),
}));
vi.mock("@/lib/game/init-payload", () => ({
  buildGameInitPayload: (input: unknown) => buildGameInitPayloadMock(input),
}));
vi.mock("@/lib/lobbies/build-state", () => ({
  buildLobbyRoomState: (...args: unknown[]) => buildLobbyRoomStateMock(...args),
}));
vi.mock("@/lib/realtime/fanout-lobby", () => ({
  notifyLobby: (...args: unknown[]) => notifyLobbyMock(...args),
}));
// OPT-360 — pending invite cleanup runs in `after()` after a successful start;
// covered by cancel-invites.test.ts. Stubbed here so the start flow doesn't
// drag the lobbyInvite Prisma surface into this test.
vi.mock("@/lib/lobbies/cancel-invites", () => ({
  cancelPendingLobbyInvites: vi.fn(async () => undefined),
}));

const { POST } = await import("./route");

function buildRequest() {
  return new NextRequest("http://localhost/api/lobbies/lobby-1/start", {
    method: "POST",
  });
}

const params = { params: Promise.resolve({ id: "lobby-1" }) };

function baseLobby(overrides: Record<string, unknown> = {}) {
  return {
    id: "lobby-1",
    hostUserId: "host-user",
    hostDeckId: "host-deck",
    format: "Standard",
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    status: "READY",
    hostReady: true,
    revision: 7,
    guest: {
      userId: "guest-user",
      deckId: "guest-deck",
      guestReady: true,
    },
    gameSessions: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("GAME_WORKER_URL", "https://worker.example.test");
  vi.stubEnv("GAME_WORKER_SECRET", "secret");
  authMock.mockReset();
  rateLimitMock.mockReset();
  requirePlayableDeckMock.mockReset();
  buildGameInitPayloadMock.mockClear();
  lobbyFindUniqueMock.mockReset();
  lobbyUpdateManyMock.mockReset();
  lobbyUpdateMock.mockReset();
  gameSessionCreateMock.mockReset();
  gameSessionFindFirstMock.mockReset();
  gameSessionDeleteMock.mockReset();
  transactionMock.mockReset();
  buildLobbyRoomStateMock.mockReset();
  notifyLobbyMock.mockReset();
  buildLobbyRoomStateMock.mockResolvedValue({
    id: "lobby-1",
    status: "IN_GAME",
    hostUserId: "host-user",
  });
  notifyLobbyMock.mockResolvedValue(undefined);
  afterCalls.pending.length = 0;

  authMock.mockResolvedValue({ user: { id: "host-user" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  requirePlayableDeckMock.mockResolvedValue({
    deck: { id: "deck", cards: [] },
    leader: { id: "leader" },
  });
  buildGameInitPayloadMock.mockReturnValue({
    gameId: "game-1",
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
  });
  lobbyFindUniqueMock.mockResolvedValue(baseLobby());
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  gameSessionCreateMock.mockResolvedValue({ id: "game-1" });
  gameSessionFindFirstMock.mockResolvedValue({ id: "game-1" });
  gameSessionDeleteMock.mockReturnValue({ query: "delete-game" });
  lobbyUpdateMock.mockReturnValue({ query: "update-lobby" });
  transactionMock.mockImplementation(async (arg) => {
    if (typeof arg === "function") {
      return arg({
        lobby: { updateMany: lobbyUpdateManyMock },
        gameSession: {
          create: gameSessionCreateMock,
          findFirst: gameSessionFindFirstMock,
        },
      });
    }
    return [];
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("ok", { status: 200 })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/lobbies/[id]/start", () => {
  it("starts a ready PVP lobby and initializes the worker", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({ pregameMode: "GUEST_FIRST" }),
    );
    const res = await POST(buildRequest(), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { gameId: "game-1" } });
    expect(requirePlayableDeckMock).toHaveBeenNthCalledWith(
      1,
      "host-deck",
      "host-user",
    );
    expect(requirePlayableDeckMock).toHaveBeenNthCalledWith(
      2,
      "guest-deck",
      "guest-user",
    );
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lobby-1", status: "READY", revision: 7 },
      data: { status: "IN_GAME", revision: { increment: 1 } },
    });
    expect(gameSessionCreateMock).toHaveBeenCalledWith({
      data: {
        lobbyId: "lobby-1",
        player1Id: "host-user",
        player2Id: "guest-user",
        player1DeckId: "host-deck",
        player2DeckId: "guest-deck",
        format: "Standard",
        mode: "PVP",
        pregameMode: "GUEST_FIRST",
        status: "IN_PROGRESS",
      },
      select: { id: true },
    });
    expect(buildGameInitPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "game-1",
        format: "Standard",
        mode: "PVP",
        pregameMode: "GUEST_FIRST",
        player1: expect.objectContaining({ userId: "host-user" }),
        player2: expect.objectContaining({ userId: "guest-user" }),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://worker.example.test/game/game-1/init",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("starts a Solitaire lobby with the host occupying both seats", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({
        mode: "SOLITAIRE",
        pregameMode: "SIDE_A_FIRST",
        status: "READY",
        guest: {
          userId: "host-user",
          deckId: "side-b-deck",
          guestReady: false,
        },
      }),
    );

    const res = await POST(buildRequest(), params);

    expect(res.status).toBe(200);
    expect(requirePlayableDeckMock).toHaveBeenNthCalledWith(
      1,
      "host-deck",
      "host-user",
    );
    expect(requirePlayableDeckMock).toHaveBeenNthCalledWith(
      2,
      "side-b-deck",
      "host-user",
    );
    expect(gameSessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          player1Id: "host-user",
          player2Id: "host-user",
          player1DeckId: "host-deck",
          player2DeckId: "side-b-deck",
          mode: "SOLITAIRE",
          pregameMode: "SIDE_A_FIRST",
        }),
      }),
    );
    expect(buildGameInitPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "SOLITAIRE",
        pregameMode: "SIDE_A_FIRST",
        player1: expect.objectContaining({ userId: "host-user" }),
        player2: expect.objectContaining({ userId: "host-user" }),
      }),
    );
  });

  it("normalizes a stale Solitaire priority-roll pairing before snapshotting", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({
        mode: "SOLITAIRE",
        pregameMode: "PRIORITY_ROLL",
        status: "READY",
        guest: {
          userId: "host-user",
          deckId: "side-b-deck",
          guestReady: false,
        },
      }),
    );

    const res = await POST(buildRequest(), params);

    expect(res.status).toBe(200);
    expect(gameSessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mode: "SOLITAIRE",
          pregameMode: "SOLITAIRE_RANDOM",
        }),
      }),
    );
    expect(buildGameInitPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "SOLITAIRE",
        pregameMode: "SOLITAIRE_RANDOM",
      }),
    );
  });

  it("rejects non-host callers", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "guest-user" } });

    const res = await POST(buildRequest(), params);

    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects missing ready prerequisites with structured details", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({
        hostReady: false,
        guest: {
          userId: "guest-user",
          deckId: "guest-deck",
          guestReady: false,
        },
      }),
    );

    const res = await POST(buildRequest(), params);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "Lobby is not ready to start",
      code: "LOBBY_NOT_READY",
      details: { missing: ["hostReady", "guestReady"] },
    });
    expect(requirePlayableDeckMock).not.toHaveBeenCalled();
  });

  it("returns structured 422 when a deck is not playable", async () => {
    requirePlayableDeckMock.mockRejectedValueOnce(new TestDeckInvalidError());

    const res = await POST(buildRequest(), params);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body).toMatchObject({
      error: "Deck is not playable",
      code: "DECK_INVALID",
      details: [expect.objectContaining({ id: "ban-status" })],
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns ALREADY_STARTED with the existing game id after a successful start", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({
        status: "IN_GAME",
        gameSessions: [{ id: "game-existing" }],
      }),
    );

    const res = await POST(buildRequest(), params);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "Lobby already started",
      code: "ALREADY_STARTED",
      gameId: "game-existing",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rolls back GameSession and lobby status when worker init fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );

    const res = await POST(buildRequest(), params);

    expect(res.status).toBe(502);
    expect(consoleError).toHaveBeenCalledWith(
      "[lobbies:start] worker init failed with status 500",
      "nope",
    );
    expect(transactionMock).toHaveBeenNthCalledWith(2, [
      { query: "delete-game" },
      { query: "update-lobby" },
    ]);
    expect(gameSessionDeleteMock).toHaveBeenCalledWith({
      where: { id: "game-1" },
    });
    expect(lobbyUpdateMock).toHaveBeenCalledWith({
      where: { id: "lobby-1" },
      data: { status: "READY", revision: { increment: 1 } },
    });
  });

  it("rolls back GameSession and lobby status when worker init cannot connect", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const res = await POST(buildRequest(), params);

    expect(res.status).toBe(502);
    expect(consoleError).toHaveBeenCalledWith(
      "[lobbies:start] worker init request failed",
      expect.objectContaining({ message: "fetch failed" }),
    );
    expect(transactionMock).toHaveBeenNthCalledWith(2, [
      { query: "delete-game" },
      { query: "update-lobby" },
    ]);
    expect(gameSessionDeleteMock).toHaveBeenCalledWith({
      where: { id: "game-1" },
    });
    expect(lobbyUpdateMock).toHaveBeenCalledWith({
      where: { id: "lobby-1" },
      data: { status: "READY", revision: { increment: 1 } },
    });
  });

  it("rolls back GameSession and lobby status when worker init times out", async () => {
    vi.useFakeTimers();
    try {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      let markFetchStarted: (() => void) | undefined;
      const fetchStarted = new Promise<void>((resolve) => {
        markFetchStarted = resolve;
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              markFetchStarted?.();
              init?.signal?.addEventListener("abort", () => {
                reject(new DOMException("aborted", "AbortError"));
              });
            }),
        ),
      );

      const pending = POST(buildRequest(), params);
      await fetchStarted;
      await vi.advanceTimersByTimeAsync(2_000);
      const res = await pending;

      expect(res.status).toBe(502);
      expect(consoleError).toHaveBeenCalledWith(
        "[lobbies:start] worker init request failed",
        expect.objectContaining({ name: "AbortError" }),
      );
      expect(transactionMock).toHaveBeenNthCalledWith(2, [
        { query: "delete-game" },
        { query: "update-lobby" },
      ]);
      expect(gameSessionDeleteMock).toHaveBeenCalledWith({
        where: { id: "game-1" },
      });
      expect(lobbyUpdateMock).toHaveBeenCalledWith({
        where: { id: "lobby-1" },
        data: { status: "READY", revision: { increment: 1 } },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rolls back when worker init returns error headers but stalls its body", async () => {
    vi.useFakeTimers();
    try {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      let markFetchStarted: (() => void) | undefined;
      const fetchStarted = new Promise<void>((resolve) => {
        markFetchStarted = resolve;
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          markFetchStarted?.();
          return new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener("abort", () => {
                  controller.error(new DOMException("aborted", "AbortError"));
                });
              },
            }),
            { status: 500 },
          );
        }),
      );

      const pending = POST(buildRequest(), params);
      await fetchStarted;
      await vi.advanceTimersByTimeAsync(2_000);
      const res = await pending;

      expect(res.status).toBe(502);
      expect(consoleError).toHaveBeenCalledWith(
        "[lobbies:start] worker init request failed",
        expect.objectContaining({ name: "AbortError" }),
      );
      expect(transactionMock).toHaveBeenNthCalledWith(2, [
        { query: "delete-game" },
        { query: "update-lobby" },
      ]);
      expect(gameSessionDeleteMock).toHaveBeenCalledWith({
        where: { id: "game-1" },
      });
      expect(lobbyUpdateMock).toHaveBeenCalledWith({
        where: { id: "lobby-1" },
        data: { status: "READY", revision: { increment: 1 } },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves the 503 response when worker configuration is missing", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubEnv("GAME_WORKER_URL", "");

    const res = await POST(buildRequest(), params);

    expect(res.status).toBe(503);
    expect(consoleError).toHaveBeenCalledWith(
      "[lobbies:start] game worker configuration missing",
    );
    expect(requirePlayableDeckMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects PVComputer start attempts until implemented", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({ mode: "PVCOMPUTER" }),
    );

    const res = await POST(buildRequest(), params);

    expect(res.status).toBe(501);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("fans out lobby:state_changed to other members after a successful start", async () => {
    const res = await POST(buildRequest(), params);
    await flushAfter();

    expect(res.status).toBe(200);
    expect(buildLobbyRoomStateMock).toHaveBeenCalledWith("lobby-1");
    expect(notifyLobbyMock).toHaveBeenCalledTimes(1);
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lobby-1" }),
      { actorUserId: "host-user" },
    );
  });

  it("fans out the restored lobby state after worker init rollback", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    buildLobbyRoomStateMock.mockResolvedValueOnce({
      id: "lobby-1",
      status: "READY",
      hostUserId: "host-user",
    });

    const res = await POST(buildRequest(), params);
    await flushAfter();

    expect(res.status).toBe(502);
    expect(consoleError).toHaveBeenCalledWith(
      "[lobbies:start] worker init failed with status 500",
      "nope",
    );
    expect(buildLobbyRoomStateMock).toHaveBeenCalledWith("lobby-1");
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lobby-1", status: "READY" }),
    );
  });
});
