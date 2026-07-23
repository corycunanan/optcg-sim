import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyFindUniqueMock = vi.fn();
const lobbyGuestDeleteManyMock = vi.fn();
const userUpdateManyMock = vi.fn();
const transactionMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const notifyLobbyMock = vi.fn();

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
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: (...args: unknown[]) => rateLimitMock(...args) },
}));
vi.mock("@/lib/lobbies/build-state", () => ({
  buildLobbyRoomState: (...args: unknown[]) => buildLobbyRoomStateMock(...args),
}));
vi.mock("@/lib/realtime/fanout-lobby", () => ({
  notifyLobby: (...args: unknown[]) => notifyLobbyMock(...args),
}));

const { POST } = await import("./route");

const request = new NextRequest("http://localhost/api/lobbies/lobby-1/leave", {
  method: "POST",
});
const params = { params: Promise.resolve({ id: "lobby-1" }) };

function lobbySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    status: "READY",
    mode: "PVP",
    hostUserId: "host-user",
    guest: { userId: "guest-user" },
    gameSession: null,
    ...overrides,
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  lobbyUpdateManyMock.mockReset();
  lobbyFindUniqueMock.mockReset();
  lobbyGuestDeleteManyMock.mockReset();
  userUpdateManyMock.mockReset();
  transactionMock.mockReset();
  buildLobbyRoomStateMock.mockReset();
  notifyLobbyMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "guest-user" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyFindUniqueMock.mockResolvedValue(lobbySnapshot());
  lobbyGuestDeleteManyMock.mockResolvedValue({ count: 1 });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  transactionMock.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        lobby: {
          updateMany: lobbyUpdateManyMock,
          findUnique: lobbyFindUniqueMock,
        },
        lobbyGuest: { deleteMany: lobbyGuestDeleteManyMock },
        user: { updateMany: userUpdateManyMock },
      }),
  );
  buildLobbyRoomStateMock.mockResolvedValue({
    id: "lobby-1",
    status: "WAITING",
    hostUserId: "host-user",
    guest: null,
  });
  notifyLobbyMock.mockResolvedValue(undefined);
  afterCalls.pending.length = 0;
});

describe("POST /api/lobbies/[id]/leave", () => {
  it("atomically releases the guest seat and resets the lobby to WAITING", async () => {
    const response = await POST(request, params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "lobby-1",
        status: "READY",
        mode: "PVP",
        guest: { is: { userId: "guest-user" } },
      },
      data: {
        status: "WAITING",
        hostReady: false,
        revision: { increment: 1 },
      },
    });
    expect(lobbyGuestDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1", userId: "guest-user" },
    });
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "guest-user", activeLobbyId: "lobby-1" },
      data: { activeLobbyId: null },
    });
  });

  it("fans out the fresh waiting state to the host", async () => {
    const response = await POST(request, params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(buildLobbyRoomStateMock).toHaveBeenCalledWith("lobby-1");
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lobby-1", status: "WAITING" }),
      { actorUserId: "guest-user" },
    );
  });

  it("rejects a repeated leave after the seat is already gone", async () => {
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    lobbyFindUniqueMock.mockResolvedValueOnce(
      lobbySnapshot({ status: "WAITING", guest: null }),
    );

    const response = await POST(request, params);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Guest seat was already released",
    });
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
    expect(notifyLobbyMock).not.toHaveBeenCalled();
  });

  it("rejects the host without changing the guest seat", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "host-user" } });
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const response = await POST(request, params);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
  });

  it("rejects a stale former guest after another guest takes the seat", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "former-guest" } });
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    lobbyFindUniqueMock.mockResolvedValueOnce(
      lobbySnapshot({ guest: { userId: "new-guest" } }),
    );

    const response = await POST(request, params);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
  });

  it("rejects a leave after game start wins the status lock", async () => {
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    lobbyFindUniqueMock.mockResolvedValueOnce(
      lobbySnapshot({
        status: "IN_GAME",
        gameSession: { id: "game-1" },
      }),
    );

    const response = await POST(request, params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Lobby already started",
      code: "ALREADY_STARTED",
    });
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
  });

  it("rolls back safely when the guest seat changes during the transaction", async () => {
    lobbyGuestDeleteManyMock.mockResolvedValueOnce({ count: 0 });

    const response = await POST(request, params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Guest seat changed before it could be released",
    });
    expect(notifyLobbyMock).not.toHaveBeenCalled();
  });

  it("requires authentication before touching lobby state", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await POST(request, params);

    expect(response.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
