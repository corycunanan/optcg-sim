import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const lobbyUpdateManyMock = vi.fn();
const lobbyCreateMock = vi.fn();
const deckFindFirstMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    lobby: {
      updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args),
      create: (...args: unknown[]) => lobbyCreateMock(...args),
    },
    deck: {
      findFirst: (...args: unknown[]) => deckFindFirstMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));

const { POST } = await import("./route");

function buildRequest(
  body: unknown = { deckId: "deck-1", format: "Standard" }
) {
  return new NextRequest("http://localhost/api/lobbies", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  lobbyUpdateManyMock.mockReset();
  lobbyCreateMock.mockReset();
  deckFindFirstMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  deckFindFirstMock.mockResolvedValue({ id: "deck-1" });
  lobbyUpdateManyMock.mockResolvedValue({ count: 0 });
  lobbyCreateMock.mockResolvedValue({ id: "lobby-1", joinCode: "ABCD" });
});

describe("POST /api/lobbies", () => {
  it("creates a PVP lobby without requiring an initial host deck", async () => {
    const res = await POST(buildRequest({ format: "Standard" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ data: { lobbyId: "lobby-1", joinCode: "ABCD" } });
    expect(deckFindFirstMock).not.toHaveBeenCalled();
    expect(lobbyCreateMock).toHaveBeenCalledWith({
      data: {
        hostUserId: "user-1",
        hostDeckId: null,
        format: "Standard",
        mode: "PVP",
        joinCode: expect.any(String),
      },
    });
  });

  it("persists an optional host deck when it belongs to the user", async () => {
    const res = await POST(buildRequest());

    expect(res.status).toBe(201);
    expect(deckFindFirstMock).toHaveBeenCalledWith({
      where: { id: "deck-1", userId: "user-1" },
      select: { id: true },
    });
    expect(lobbyCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ hostDeckId: "deck-1" }),
    });
  });

  it("returns 404 when an optional host deck is not owned by the user", async () => {
    deckFindFirstMock.mockResolvedValueOnce(null);

    const res = await POST(buildRequest());

    expect(res.status).toBe(404);
    expect(lobbyCreateMock).not.toHaveBeenCalled();
  });
});
