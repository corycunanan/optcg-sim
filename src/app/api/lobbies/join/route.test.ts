import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const lobbyFindFirstMock = vi.fn();
const lobbyUpdateMock = vi.fn();
const lobbyGuestCreateMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    lobby: {
      findFirst: (...args: unknown[]) => lobbyFindFirstMock(...args),
      update: (...args: unknown[]) => lobbyUpdateMock(...args),
    },
    lobbyGuest: {
      create: (...args: unknown[]) => lobbyGuestCreateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
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
  lobbyFindFirstMock.mockReset();
  lobbyUpdateMock.mockReset();
  lobbyGuestCreateMock.mockReset();
  transactionMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "guest-user" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
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
  transactionMock.mockResolvedValue([]);
});

describe("POST /api/lobbies/join", () => {
  it("enters the lobby room without requiring a deck or starting a game", async () => {
    const res = await POST(buildRequest({ code: "ABCD" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { lobbyId: "lobby-1" } });
    expect(lobbyGuestCreateMock).toHaveBeenCalledWith({
      data: { lobbyId: "lobby-1", userId: "guest-user", deckId: undefined },
    });
    expect(lobbyUpdateMock).toHaveBeenCalledWith({
      where: { id: "lobby-1" },
      data: { status: "READY" },
    });
    expect(transactionMock).toHaveBeenCalledWith([
      { query: "create-guest" },
      { query: "update-lobby" },
    ]);
  });

  it("keeps a provided guest deck as mutable room state", async () => {
    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(lobbyGuestCreateMock).toHaveBeenCalledWith({
      data: { lobbyId: "lobby-1", userId: "guest-user", deckId: "guest-deck" },
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

    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledOnce();
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

  it("rejects joins when a lobby already has a guest", async () => {
    lobbyFindFirstMock.mockResolvedValueOnce({
      id: "lobby-1",
      joinCode: "ABCD",
      status: "WAITING",
      hostUserId: "host-user",
      hostDeckId: "host-deck",
      format: "Standard",
      mode: "PVP",
      guest: { userId: "someone" },
    });

    const res = await POST(buildRequest());

    expect(res.status).toBe(409);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
