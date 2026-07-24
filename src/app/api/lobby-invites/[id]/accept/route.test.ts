import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const gameFindFirstMock = vi.fn();
const inviteFindUniqueMock = vi.fn();
const inviteFindManyMock = vi.fn();
const inviteUpdateManyMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyGuestCreateMock = vi.fn();
const lobbyGuestDeleteManyMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userUpdateManyMock = vi.fn();
const transactionMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const notifyLobbyMock = vi.fn();
const notifyUserMock = vi.fn();

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
vi.mock("@/lib/rate-limit", () => ({ apiLimiter: { check: rateLimitMock } }));
vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findFirst: (...args: unknown[]) => gameFindFirstMock(...args),
    },
    lobbyInvite: {
      findUnique: (...args: unknown[]) => inviteFindUniqueMock(...args),
      findMany: (...args: unknown[]) => inviteFindManyMock(...args),
      updateMany: (...args: unknown[]) => inviteUpdateManyMock(...args),
    },
    lobby: { updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args) },
    lobbyGuest: {
      create: (...args: unknown[]) => lobbyGuestCreateMock(...args),
      deleteMany: (...args: unknown[]) => lobbyGuestDeleteManyMock(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => userUpdateManyMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
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

const { POST } = await import("./route");

const invite = {
  id: "invite-1",
  toUserId: "recipient",
  status: "PENDING",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  lobby: {
    id: "target-lobby",
    joinCode: "ABC123",
    status: "WAITING",
    hostUserId: "target-host",
    mode: "PVP",
    guest: null,
  },
};

function request(body?: unknown) {
  return {
    request: new NextRequest(
      "http://localhost/api/lobby-invites/invite-1/accept",
      {
        method: "POST",
        ...(body === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }),
      }
    ),
    params: Promise.resolve({ id: "invite-1" }),
  };
}

beforeEach(() => {
  for (const mock of [
    authMock,
    rateLimitMock,
    gameFindFirstMock,
    inviteFindUniqueMock,
    inviteFindManyMock,
    inviteUpdateManyMock,
    lobbyUpdateManyMock,
    lobbyGuestCreateMock,
    lobbyGuestDeleteManyMock,
    userFindUniqueMock,
    userUpdateManyMock,
    transactionMock,
    buildLobbyRoomStateMock,
    notifyLobbyMock,
    notifyUserMock,
  ]) {
    mock.mockReset();
  }
  authMock.mockResolvedValue({ user: { id: "recipient" } });
  rateLimitMock.mockResolvedValue({ limited: false });
  gameFindFirstMock.mockResolvedValue(null);
  inviteFindUniqueMock.mockResolvedValue(invite);
  inviteFindManyMock.mockResolvedValue([]);
  inviteUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyGuestCreateMock.mockResolvedValue(undefined);
  lobbyGuestDeleteManyMock.mockResolvedValue({ count: 1 });
  userFindUniqueMock.mockResolvedValue({
    activeLobbyId: null,
    activeLobby: null,
  });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  buildLobbyRoomStateMock.mockResolvedValue({
    id: "target-lobby",
    hostUserId: "target-host",
    status: "READY",
  });
  notifyLobbyMock.mockResolvedValue(undefined);
  notifyUserMock.mockResolvedValue(undefined);
  transactionMock.mockImplementation(async (operation) =>
    operation({
      lobbyInvite: {
        findUnique: inviteFindUniqueMock,
        findMany: inviteFindManyMock,
        updateMany: inviteUpdateManyMock,
      },
      lobby: { updateMany: lobbyUpdateManyMock },
      lobbyGuest: {
        create: lobbyGuestCreateMock,
        deleteMany: lobbyGuestDeleteManyMock,
      },
      user: { findUnique: userFindUniqueMock, updateMany: userUpdateManyMock },
    })
  );
  afterCalls.pending.length = 0;
});

describe("POST /api/lobby-invites/[id]/accept", () => {
  it("accepts through the shared switch transaction and fans out", async () => {
    const input = request();
    const response = await POST(input.request, { params: input.params });
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { lobbyId: "target-lobby" },
    });
    expect(inviteUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "invite-1", status: "PENDING" },
      data: { status: "ACCEPTED" },
    });
    expect(lobbyGuestCreateMock).toHaveBeenCalledWith({
      data: {
        lobbyId: "target-lobby",
        userId: "recipient",
        deckId: undefined,
      },
    });
    expect(notifyLobbyMock).toHaveBeenCalledOnce();
  });

  it("returns the same host-switch confirmation contract", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "hosted-lobby",
      activeLobby: {
        id: "hosted-lobby",
        status: "READY",
        revision: 8,
        hostUserId: "recipient",
        host: { username: "Robin", name: null },
        guest: {
          userId: "ex-guest",
          user: { username: "Franky", name: null },
        },
        invites: [],
      },
    });

    const input = request();
    const response = await POST(input.request, { params: input.params });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
      details: { targetCode: "ABC123", guestName: "Franky" },
    });
    expect(inviteUpdateManyMock).not.toHaveBeenCalled();
  });

  it("confirmed invite acceptance disbands and joins atomically", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "hosted-lobby",
      activeLobby: {
        id: "hosted-lobby",
        status: "READY",
        revision: 8,
        hostUserId: "recipient",
        host: { username: "Robin", name: null },
        guest: {
          userId: "ex-guest",
          user: { username: "Franky", name: null },
        },
        invites: [],
      },
    });

    const input = request({ confirmDisbandLobbyId: "hosted-lobby" });
    const response = await POST(input.request, { params: input.params });
    await flushAfter();

    expect(response.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenNthCalledWith(1, {
      where: {
        id: "hosted-lobby",
        hostUserId: "recipient",
        revision: 8,
        status: { in: ["WAITING", "READY"] },
      },
      data: { status: "CLOSED", revision: { increment: 1 } },
    });
    expect(notifyUserMock).toHaveBeenCalledWith("ex-guest", {
      type: "lobby:party_disbanded",
      lobbyId: "hosted-lobby",
      hostName: "Robin",
    });
  });

  it("rejects a non-recipient and an expired invite", async () => {
    inviteFindUniqueMock.mockResolvedValueOnce({
      ...invite,
      toUserId: "other",
    });
    let input = request();
    const forbidden = await POST(input.request, { params: input.params });

    inviteFindUniqueMock.mockResolvedValueOnce({
      ...invite,
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    });
    input = request();
    const expired = await POST(input.request, { params: input.params });

    expect(forbidden.status).toBe(403);
    expect(expired.status).toBe(410);
    expect(inviteUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "invite-1", status: "PENDING" },
      data: { status: "EXPIRED" },
    });
  });

  it("fails gracefully when the invite or target seat changes during commit", async () => {
    inviteUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    let input = request();
    const staleInvite = await POST(input.request, { params: input.params });

    inviteUpdateManyMock.mockResolvedValue({ count: 1 });
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    input = request();
    const filled = await POST(input.request, { params: input.params });

    expect(staleInvite.status).toBe(410);
    expect(filled.status).toBe(409);
    expect(await filled.json()).toEqual({ error: "This party is full" });
  });
});
