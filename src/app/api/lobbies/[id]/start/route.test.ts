import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const requirePlayableDeckMock = vi.fn();
const buildGameInitPayloadMock = vi.fn((input: unknown) => ({
  ...(typeof input === "object" && input !== null ? input : {}),
  gameId: "game-1",
  mode: "PVP",
}));
const lobbyFindUniqueMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyUpdateMock = vi.fn();
const gameSessionCreateMock = vi.fn();
const gameSessionFindUniqueMock = vi.fn();
const gameSessionDeleteMock = vi.fn();
const transactionMock = vi.fn();

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
      findUnique: (...args: unknown[]) => gameSessionFindUniqueMock(...args),
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
    status: "READY",
    hostReady: true,
    guest: {
      userId: "guest-user",
      deckId: "guest-deck",
      guestReady: true,
    },
    gameSession: null,
    ...overrides,
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  requirePlayableDeckMock.mockReset();
  buildGameInitPayloadMock.mockClear();
  lobbyFindUniqueMock.mockReset();
  lobbyUpdateManyMock.mockReset();
  lobbyUpdateMock.mockReset();
  gameSessionCreateMock.mockReset();
  gameSessionFindUniqueMock.mockReset();
  gameSessionDeleteMock.mockReset();
  transactionMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "host-user" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  requirePlayableDeckMock.mockResolvedValue({
    deck: { id: "deck", cards: [] },
    leader: { id: "leader" },
  });
  buildGameInitPayloadMock.mockReturnValue({ gameId: "game-1", mode: "PVP" });
  lobbyFindUniqueMock.mockResolvedValue(baseLobby());
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  gameSessionCreateMock.mockResolvedValue({ id: "game-1" });
  gameSessionFindUniqueMock.mockResolvedValue({ id: "game-1" });
  gameSessionDeleteMock.mockReturnValue({ query: "delete-game" });
  lobbyUpdateMock.mockReturnValue({ query: "update-lobby" });
  transactionMock.mockImplementation(async (arg) => {
    if (typeof arg === "function") {
      return arg({
        lobby: { updateMany: lobbyUpdateManyMock },
        gameSession: {
          create: gameSessionCreateMock,
          findUnique: gameSessionFindUniqueMock,
        },
      });
    }
    return [];
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
});

describe("POST /api/lobbies/[id]/start", () => {
  it("starts a ready PVP lobby and initializes the worker", async () => {
    const res = await POST(buildRequest(), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { gameId: "game-1" } });
    expect(requirePlayableDeckMock).toHaveBeenNthCalledWith(1, "host-deck", "host-user");
    expect(requirePlayableDeckMock).toHaveBeenNthCalledWith(2, "guest-deck", "guest-user");
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lobby-1", status: "READY" },
      data: { status: "IN_GAME" },
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
        status: "IN_PROGRESS",
      },
      select: { id: true },
    });
    expect(buildGameInitPayloadMock).toHaveBeenCalledWith(expect.objectContaining({
      gameId: "game-1",
      format: "Standard",
      mode: "PVP",
      player1: expect.objectContaining({ userId: "host-user" }),
      player2: expect.objectContaining({ userId: "guest-user" }),
    }));
    expect(fetch).toHaveBeenCalledWith(
      "https://worker.example.test/game/game-1/init",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("starts a Solitaire lobby with the host occupying both seats", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(baseLobby({
      mode: "SOLITAIRE",
      status: "READY",
      guest: {
        userId: "host-user",
        deckId: "side-b-deck",
        guestReady: false,
      },
    }));

    const res = await POST(buildRequest(), params);

    expect(res.status).toBe(200);
    expect(requirePlayableDeckMock).toHaveBeenNthCalledWith(1, "host-deck", "host-user");
    expect(requirePlayableDeckMock).toHaveBeenNthCalledWith(2, "side-b-deck", "host-user");
    expect(gameSessionCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        player1Id: "host-user",
        player2Id: "host-user",
        player1DeckId: "host-deck",
        player2DeckId: "side-b-deck",
        mode: "SOLITAIRE",
      }),
    }));
    expect(buildGameInitPayloadMock).toHaveBeenCalledWith(expect.objectContaining({
      mode: "SOLITAIRE",
      player1: expect.objectContaining({ userId: "host-user" }),
      player2: expect.objectContaining({ userId: "host-user" }),
    }));
  });

  it("rejects non-host callers", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "guest-user" } });

    const res = await POST(buildRequest(), params);

    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects missing ready prerequisites with structured details", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(baseLobby({
      hostReady: false,
      guest: {
        userId: "guest-user",
        deckId: "guest-deck",
        guestReady: false,
      },
    }));

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
    lobbyFindUniqueMock.mockResolvedValueOnce(baseLobby({
      status: "IN_GAME",
      gameSession: { id: "game-existing" },
    }));

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
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));

    const res = await POST(buildRequest(), params);

    expect(res.status).toBe(502);
    expect(transactionMock).toHaveBeenNthCalledWith(2, [
      { query: "delete-game" },
      { query: "update-lobby" },
    ]);
    expect(gameSessionDeleteMock).toHaveBeenCalledWith({ where: { id: "game-1" } });
    expect(lobbyUpdateMock).toHaveBeenCalledWith({
      where: { id: "lobby-1" },
      data: { status: "READY" },
    });
  });

  it("rejects PVComputer start attempts until implemented", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(baseLobby({ mode: "PVCOMPUTER" }));

    const res = await POST(buildRequest(), params);

    expect(res.status).toBe(501);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
