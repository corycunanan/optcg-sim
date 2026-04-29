import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const requirePlayableDeckMock = vi.fn();
const lobbyFindFirstMock = vi.fn();
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
      update: vi.fn(),
    },
    lobbyGuest: { create: vi.fn() },
    gameSession: { upsert: vi.fn(), delete: vi.fn() },
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

function buildRequest(body: unknown = { code: "ABCD", deckId: "guest-deck" }) {
  return new NextRequest("http://localhost/api/lobbies/join", {
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
    guest: null,
  });
  transactionMock.mockResolvedValue([{}, { id: "game-1" }, {}]);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
});

describe("POST /api/lobbies/join", () => {
  it("requires playable guest and host decks before starting a game", async () => {
    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
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
    expect(transactionMock).toHaveBeenCalledOnce();
  });

  it("returns structured 422 when the guest deck is illegal", async () => {
    requirePlayableDeckMock.mockRejectedValueOnce(new TestDeckInvalidError());

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body).toMatchObject({
      error: "Deck is not playable",
      code: "DECK_INVALID",
      details: [expect.objectContaining({ id: "ban-status" })],
    });
    expect(lobbyFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns structured 422 when the host deck became illegal before join", async () => {
    requirePlayableDeckMock
      .mockResolvedValueOnce({ deck: { id: "guest-deck" }, leader: { id: "leader" } })
      .mockRejectedValueOnce(new TestDeckInvalidError());

    const res = await POST(buildRequest());

    expect(res.status).toBe(422);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
