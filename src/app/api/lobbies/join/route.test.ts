import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const requirePlayableDeckMock = vi.fn();
const lobbyFindFirstMock = vi.fn();
const lobbyUpdateMock = vi.fn();
const lobbyGuestCreateMock = vi.fn();
const gameSessionUpsertMock = vi.fn();
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
      findFirst: (...args: unknown[]) => lobbyFindFirstMock(...args),
      update: (...args: unknown[]) => lobbyUpdateMock(...args),
    },
    lobbyGuest: { create: (...args: unknown[]) => lobbyGuestCreateMock(...args) },
    gameSession: {
      upsert: (...args: unknown[]) => gameSessionUpsertMock(...args),
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
  buildGameInitPayload: vi.fn(() => ({ gameId: "game-1" })),
}));

const { POST } = await import("./route");

function buildRequest(
  body: unknown = { code: "ABCD", deckId: "guest-deck" },
  search = "",
) {
  return new NextRequest(`http://localhost/api/lobbies/join${search}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  requirePlayableDeckMock.mockReset();
  lobbyFindFirstMock.mockReset();
  lobbyUpdateMock.mockReset();
  lobbyGuestCreateMock.mockReset();
  gameSessionUpsertMock.mockReset();
  gameSessionDeleteMock.mockReset();
  transactionMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "guest-user" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  requirePlayableDeckMock.mockResolvedValue({
    deck: { id: "deck", cards: [] },
    leader: { id: "leader" },
  });
  lobbyFindFirstMock.mockResolvedValue({
    id: "lobby-1",
    joinCode: "ABCD",
    status: "WAITING",
    hostUserId: "host-user",
    hostDeckId: "host-deck",
    format: "Standard",
    mode: "PVP",
    guest: null,
  });
  lobbyGuestCreateMock.mockReturnValue({ query: "create-guest" });
  lobbyUpdateMock.mockReturnValue({ query: "update-lobby" });
  gameSessionUpsertMock.mockReturnValue({ query: "upsert-game" });
  gameSessionDeleteMock.mockReturnValue({ query: "delete-game" });
  transactionMock.mockResolvedValue([{}, { id: "game-1" }, {}]);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
});

describe("POST /api/lobbies/join", () => {
  it("enters the lobby room without checking deck legality or starting a game", async () => {
    const res = await POST(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { lobbyId: "lobby-1" } });
    expect(requirePlayableDeckMock).not.toHaveBeenCalled();
    expect(gameSessionUpsertMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(lobbyGuestCreateMock).toHaveBeenCalledWith({
      data: { lobbyId: "lobby-1", userId: "guest-user", deckId: "guest-deck" },
    });
    expect(lobbyUpdateMock).toHaveBeenCalledWith({
      where: { id: "lobby-1" },
      data: { status: "READY" },
    });
    expect(transactionMock).toHaveBeenCalledOnce();
  });

  it("allows entering the room without a deck", async () => {
    const res = await POST(buildRequest({ code: "ABCD" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { lobbyId: "lobby-1" } });
    expect(requirePlayableDeckMock).not.toHaveBeenCalled();
    expect(lobbyGuestCreateMock).toHaveBeenCalledWith({
      data: { lobbyId: "lobby-1", userId: "guest-user", deckId: undefined },
    });
  });

  it("allows entering the room when the host has not selected a deck yet", async () => {
    lobbyFindFirstMock.mockResolvedValueOnce({
      id: "lobby-1",
      joinCode: "ABCD",
      status: "WAITING",
      hostUserId: "host-user",
      hostDeckId: null,
      format: "Standard",
      mode: "PVP",
      guest: null,
    });

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { lobbyId: "lobby-1" } });
    expect(requirePlayableDeckMock).not.toHaveBeenCalled();
  });

  it("rejects joins for solitaire lobbies", async () => {
    lobbyFindFirstMock.mockResolvedValueOnce({
      id: "lobby-1",
      joinCode: "ABCD",
      status: "WAITING",
      hostUserId: "host-user",
      hostDeckId: null,
      format: "Standard",
      mode: "SOLITAIRE",
      guest: null,
    });

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "This lobby is in solo mode and cannot be joined",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("preserves legacy auto-start behind the temporary shim", async () => {
    const res = await POST(buildRequest(undefined, "?autoStart=true"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { gameId: "game-1" } });
    expect(requirePlayableDeckMock).toHaveBeenNthCalledWith(
      1,
      "guest-deck",
      "guest-user",
    );
    expect(requirePlayableDeckMock).toHaveBeenNthCalledWith(
      2,
      "host-deck",
      "host-user",
    );
    expect(gameSessionUpsertMock).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "https://worker.example.test/game/game-1/init",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns structured 422 when the guest deck is illegal during auto-start", async () => {
    requirePlayableDeckMock.mockRejectedValueOnce(new TestDeckInvalidError());

    const res = await POST(buildRequest(undefined, "?autoStart=true"));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body).toMatchObject({
      error: "Deck is not playable",
      code: "DECK_INVALID",
      details: [expect.objectContaining({ id: "ban-status" })],
    });
    expect(lobbyFindFirstMock).toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns structured 422 when the host deck became illegal during auto-start", async () => {
    requirePlayableDeckMock
      .mockResolvedValueOnce({ deck: { id: "guest-deck" }, leader: { id: "leader" } })
      .mockRejectedValueOnce(new TestDeckInvalidError());

    const res = await POST(buildRequest(undefined, "?autoStart=true"));

    expect(res.status).toBe(422);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
