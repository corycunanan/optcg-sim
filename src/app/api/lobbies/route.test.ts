import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const requirePlayableDeckMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyCreateMock = vi.fn();

class TestDeckNotFoundError extends Error {}
class TestDeckInvalidError extends Error {
  details = [
    {
      id: "deck-size",
      rule: "Deck Size",
      message: "49/50 cards",
      severity: "error",
      passed: false,
    },
  ];
}

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    lobby: {
      updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args),
      create: (...args: unknown[]) => lobbyCreateMock(...args),
    },
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

const { POST } = await import("./route");

function buildRequest(body: unknown = { deckId: "deck-1", format: "Standard" }) {
  return new NextRequest("http://localhost/api/lobbies", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  requirePlayableDeckMock.mockReset();
  lobbyUpdateManyMock.mockReset();
  lobbyCreateMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  requirePlayableDeckMock.mockResolvedValue({ deck: { id: "deck-1" } });
  lobbyUpdateManyMock.mockResolvedValue({ count: 0 });
  lobbyCreateMock.mockResolvedValue({ id: "lobby-1", joinCode: "ABCD" });
});

describe("POST /api/lobbies", () => {
  it("requires a playable host deck before creating a lobby", async () => {
    const res = await POST(buildRequest());

    expect(res.status).toBe(201);
    expect(requirePlayableDeckMock).toHaveBeenCalledWith("deck-1", "user-1");
    expect(lobbyCreateMock).toHaveBeenCalledOnce();
  });

  it("returns structured 422 when the host deck is illegal", async () => {
    requirePlayableDeckMock.mockRejectedValue(new TestDeckInvalidError());

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body).toMatchObject({
      error: "Deck is not playable",
      code: "DECK_INVALID",
      details: [expect.objectContaining({ id: "deck-size" })],
    });
    expect(lobbyCreateMock).not.toHaveBeenCalled();
  });

  it("preserves the 404 response for a missing deck", async () => {
    requirePlayableDeckMock.mockRejectedValue(new TestDeckNotFoundError());

    const res = await POST(buildRequest());

    expect(res.status).toBe(404);
    expect(lobbyCreateMock).not.toHaveBeenCalled();
  });
});
