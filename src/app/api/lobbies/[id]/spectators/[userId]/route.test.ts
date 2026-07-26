import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const transactionMock = vi.fn();
const queryRawMock = vi.fn();
const lobbyFindUniqueMock = vi.fn();
const lobbySpectatorDeleteManyMock = vi.fn();
const lobbyUpdateMock = vi.fn();
const userUpdateManyMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const notifyLobbyMock = vi.fn();
const notifySpectatorsRemovedMock = vi.fn();

const afterCalls = vi.hoisted(() => ({ pending: [] as Promise<void>[] }));

async function flushAfter() {
  while (afterCalls.pending.length) {
    await Promise.all(afterCalls.pending.splice(0));
  }
}

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
  apiLimiter: { check: (...args: unknown[]) => rateLimitMock(...args) },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/lobbies/build-state", () => ({
  buildLobbyRoomState: (...args: unknown[]) => buildLobbyRoomStateMock(...args),
}));
vi.mock("@/lib/realtime/fanout-lobby", () => ({
  notifyLobby: (...args: unknown[]) => notifyLobbyMock(...args),
  notifySpectatorsRemoved: (...args: unknown[]) =>
    notifySpectatorsRemovedMock(...args),
}));

const { DELETE } = await import("./route");

const request = new NextRequest(
  "http://localhost/api/lobbies/lobby-1/spectators/target-user",
  { method: "DELETE" }
);
const params = {
  params: Promise.resolve({ id: "lobby-1", userId: "target-user" }),
};

function lobbySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    status: "IN_GAME",
    hostUserId: "host-user",
    guest: { userId: "guest-user" },
    spectators: [{ userId: "other-spectator" }, { userId: "target-user" }],
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of [
    authMock,
    rateLimitMock,
    transactionMock,
    queryRawMock,
    lobbyFindUniqueMock,
    lobbySpectatorDeleteManyMock,
    lobbyUpdateMock,
    userUpdateManyMock,
    buildLobbyRoomStateMock,
    notifyLobbyMock,
    notifySpectatorsRemovedMock,
  ]) {
    mock.mockReset();
  }

  authMock.mockResolvedValue({ user: { id: "host-user" } });
  rateLimitMock.mockResolvedValue({ limited: false });
  queryRawMock.mockResolvedValue([{ id: "lobby-1" }]);
  lobbyFindUniqueMock.mockResolvedValue(lobbySnapshot());
  lobbySpectatorDeleteManyMock.mockResolvedValue({ count: 1 });
  lobbyUpdateMock.mockResolvedValue({ id: "lobby-1" });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  buildLobbyRoomStateMock.mockResolvedValue({
    id: "lobby-1",
    status: "IN_GAME",
    hostUserId: "host-user",
    guest: { user: { id: "guest-user" } },
    spectators: [{ id: "other-spectator" }],
  });
  notifyLobbyMock.mockResolvedValue(undefined);
  notifySpectatorsRemovedMock.mockResolvedValue(undefined);
  transactionMock.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: queryRawMock,
        lobby: {
          findUnique: lobbyFindUniqueMock,
          update: lobbyUpdateMock,
        },
        lobbySpectator: { deleteMany: lobbySpectatorDeleteManyMock },
        user: { updateMany: userUpdateManyMock },
      })
  );
  afterCalls.pending.length = 0;
});

describe("DELETE /api/lobbies/[id]/spectators/[userId]", () => {
  it("removes the captured spectator, releases membership, and bumps revision once", async () => {
    const response = await DELETE(request, params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(rateLimitMock).toHaveBeenCalledWith("lobby-kick:host-user");
    expect(queryRawMock.mock.invocationCallOrder[0]).toBeLessThan(
      lobbyFindUniqueMock.mock.invocationCallOrder[0]
    );
    expect(lobbyFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "lobby-1" },
      select: {
        status: true,
        hostUserId: true,
        guest: { select: { userId: true } },
        spectators: {
          select: { userId: true },
          orderBy: { userId: "asc" },
        },
      },
    });
    expect(lobbyFindUniqueMock.mock.invocationCallOrder[0]).toBeLessThan(
      lobbySpectatorDeleteManyMock.mock.invocationCallOrder[0]
    );
    expect(lobbySpectatorDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1", userId: "target-user" },
    });
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "target-user", activeLobbyId: "lobby-1" },
      data: { activeLobbyId: null },
    });
    expect(lobbyUpdateMock).toHaveBeenCalledWith({
      where: { id: "lobby-1" },
      data: { revision: { increment: 1 } },
    });
  });

  it("fans out the count decrement and a distinct host-removal event", async () => {
    const response = await DELETE(request, params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ spectators: [{ id: "other-spectator" }] })
    );
    expect(notifySpectatorsRemovedMock).toHaveBeenCalledWith({
      lobbyId: "lobby-1",
      reason: "REMOVED_BY_HOST",
      removedSpectatorUserIds: ["target-user"],
    });
  });

  it("still sends the directed ejection event when state rebuilding fails", async () => {
    buildLobbyRoomStateMock.mockRejectedValueOnce(
      new Error("state unavailable")
    );

    const response = await DELETE(request, params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(notifySpectatorsRemovedMock).toHaveBeenCalledWith({
      lobbyId: "lobby-1",
      reason: "REMOVED_BY_HOST",
      removedSpectatorUserIds: ["target-user"],
    });
    expect(notifyLobbyMock).not.toHaveBeenCalled();
  });

  it("returns 200 without a revision bump or fanout when already removed", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      lobbySnapshot({ spectators: [{ userId: "other-spectator" }] })
    );

    const response = await DELETE(request, params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
    expect(buildLobbyRoomStateMock).not.toHaveBeenCalled();
    expect(notifyLobbyMock).not.toHaveBeenCalled();
    expect(notifySpectatorsRemovedMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "guest",
      actorUserId: "guest-user",
    },
    {
      name: "another spectator",
      actorUserId: "other-spectator",
    },
  ])("returns 403 before mutation for the $name", async ({ actorUserId }) => {
    authMock.mockResolvedValueOnce({ user: { id: actorUserId } });

    const response = await DELETE(request, params);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 404 before mutation for a non-member", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "stranger-user" } });

    const response = await DELETE(request, params);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Lobby not found" });
    expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 401 before rate limiting or mutation when unauthenticated", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await DELETE(request, params);

    expect(response.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 429 before mutation when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true });

    const response = await DELETE(request, params);

    expect(response.status).toBe(429);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 404 before mutation when the lobby lock cannot be acquired", async () => {
    queryRawMock.mockResolvedValueOnce([]);

    const response = await DELETE(request, params);

    expect(response.status).toBe(404);
    expect(lobbyFindUniqueMock).not.toHaveBeenCalled();
    expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 404 before mutation for a closed lobby", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      lobbySnapshot({ status: "CLOSED" })
    );

    const response = await DELETE(request, params);

    expect(response.status).toBe(404);
    expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 409 and relies on transaction rollback when the row changes after capture", async () => {
    lobbySpectatorDeleteManyMock.mockResolvedValueOnce({ count: 0 });

    const response = await DELETE(request, params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Spectator membership changed before it could be removed",
      code: "LOBBY_STATE_CHANGED",
    });
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
    expect(buildLobbyRoomStateMock).not.toHaveBeenCalled();
    expect(notifySpectatorsRemovedMock).not.toHaveBeenCalled();
  });
});
