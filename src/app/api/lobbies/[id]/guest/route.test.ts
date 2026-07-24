import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const lobbyFindUniqueMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyGuestDeleteManyMock = vi.fn();
const userUpdateManyMock = vi.fn();
const transactionMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const notifyLobbyMock = vi.fn();
const notifyUserMock = vi.fn();

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
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));

const { DELETE } = await import("./route");

const request = new NextRequest("http://localhost/api/lobbies/lobby-1/guest", {
  method: "DELETE",
});
const params = { params: Promise.resolve({ id: "lobby-1" }) };

function lobbySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    hostUserId: "host-user",
    status: "READY",
    mode: "PVP",
    host: { username: "strawhat", name: "Luffy" },
    guest: { userId: "guest-user" },
    ...overrides,
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  lobbyFindUniqueMock.mockReset();
  lobbyUpdateManyMock.mockReset();
  lobbyGuestDeleteManyMock.mockReset();
  userUpdateManyMock.mockReset();
  transactionMock.mockReset();
  buildLobbyRoomStateMock.mockReset();
  notifyLobbyMock.mockReset();
  notifyUserMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "host-user" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  lobbyFindUniqueMock.mockResolvedValue(lobbySnapshot());
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyGuestDeleteManyMock.mockResolvedValue({ count: 1 });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  transactionMock.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        lobby: {
          findUnique: lobbyFindUniqueMock,
          updateMany: lobbyUpdateManyMock,
        },
        lobbyGuest: { deleteMany: lobbyGuestDeleteManyMock },
        user: { updateMany: userUpdateManyMock },
      })
  );
  buildLobbyRoomStateMock.mockResolvedValue({
    id: "lobby-1",
    status: "WAITING",
    hostReady: true,
    hostUserId: "host-user",
    guest: null,
  });
  notifyLobbyMock.mockResolvedValue(undefined);
  notifyUserMock.mockResolvedValue(undefined);
  afterCalls.pending.length = 0;
});

describe("DELETE /api/lobbies/[id]/guest", () => {
  it("atomically opens the seat, preserves host readiness, and releases membership", async () => {
    const response = await DELETE(request, params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "lobby-1",
        hostUserId: "host-user",
        status: { in: ["WAITING", "READY"] },
        mode: "PVP",
        guest: { is: { userId: "guest-user" } },
      },
      data: {
        status: "WAITING",
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

  it("fans out the open-seat state to the host and one directed removal event", async () => {
    const response = await DELETE(request, params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "WAITING", guest: null })
    );
    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith("guest-user", {
      type: "lobby:guest_removed",
      lobbyId: "lobby-1",
      hostName: "strawhat",
    });
  });

  it("returns 403 when a non-host calls the endpoint", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "guest-user" } });

    const response = await DELETE(request, params);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(lobbyUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
  });

  it("returns 409 without removing the guest while IN_GAME", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      lobbySnapshot({ status: "IN_GAME" })
    );

    const response = await DELETE(request, params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Lobby already started",
      code: "ALREADY_STARTED",
    });
    expect(lobbyUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the guest seat is already open", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(lobbySnapshot({ guest: null }));

    const response = await DELETE(request, params);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Guest not found" });
  });

  it("returns 409 if the occupied seat changes during the guarded update", async () => {
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const response = await DELETE(request, params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Guest seat changed before it could be removed",
      code: "LOBBY_STATE_CHANGED",
    });
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
  });
});
