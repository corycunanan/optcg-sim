import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const lobbyUpdateManyMock = vi.fn();
const lobbyCreateMock = vi.fn();
const userUpdateManyMock = vi.fn();
const deckFindFirstMock = vi.fn();
const transactionMock = vi.fn();

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
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));

const { POST } = await import("./route");

function buildRequest(
  body: unknown = { deckId: "deck-1", format: "Standard" },
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
  userUpdateManyMock.mockReset();
  deckFindFirstMock.mockReset();
  transactionMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  deckFindFirstMock.mockResolvedValue({ id: "deck-1" });
  lobbyCreateMock.mockResolvedValue({ id: "lobby-1", joinCode: "ABCD" });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  transactionMock.mockImplementation(async (operation) =>
    operation({
      lobby: { create: lobbyCreateMock },
      user: { updateMany: userUpdateManyMock },
    }),
  );
});

describe("POST /api/lobbies", () => {
  it("creates a PVP lobby without requiring an initial host deck", async () => {
    const res = await POST(buildRequest({ format: "Standard" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ data: { lobbyId: "lobby-1", joinCode: "ABCD" } });
    expect(deckFindFirstMock).not.toHaveBeenCalled();
    expect(lobbyUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyCreateMock).toHaveBeenCalledWith({
      data: {
        hostUserId: "user-1",
        hostDeckId: null,
        format: "Standard",
        mode: "PVP",
        joinCode: expect.any(String),
      },
    });
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "user-1", activeLobbyId: null },
      data: { activeLobbyId: "lobby-1" },
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

  it("retries a join-code collision", async () => {
    lobbyCreateMock
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["join_code"] },
        }),
      )
      .mockResolvedValueOnce({ id: "lobby-2", joinCode: "EFGH" });

    const res = await POST(buildRequest({ format: "Standard" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      data: { lobbyId: "lobby-2", joinCode: "EFGH" },
    });
    expect(lobbyCreateMock).toHaveBeenCalledTimes(2);
  });

  it("returns a stable conflict when another create wins the active-lobby race", async () => {
    userUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const res = await POST(buildRequest({ format: "Standard" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "An active lobby already exists",
      code: "ACTIVE_LOBBY_EXISTS",
    });
    expect(lobbyCreateMock).toHaveBeenCalledTimes(1);
  });
});
