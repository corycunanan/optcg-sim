import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const gameFindFirstMock = vi.fn();
const lobbyFindFirstMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyGuestCreateMock = vi.fn();
const lobbyGuestDeleteManyMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userUpdateManyMock = vi.fn();
const inviteFindManyMock = vi.fn();
const inviteUpdateManyMock = vi.fn();
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
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findFirst: (...args: unknown[]) => gameFindFirstMock(...args),
    },
    lobby: {
      findFirst: (...args: unknown[]) => lobbyFindFirstMock(...args),
      updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args),
    },
    lobbyGuest: {
      create: (...args: unknown[]) => lobbyGuestCreateMock(...args),
      deleteMany: (...args: unknown[]) => lobbyGuestDeleteManyMock(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => userUpdateManyMock(...args),
    },
    lobbyInvite: {
      findMany: (...args: unknown[]) => inviteFindManyMock(...args),
      updateMany: (...args: unknown[]) => inviteUpdateManyMock(...args),
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

const targetLobby = {
  id: "target-lobby",
  joinCode: "ABC123",
  status: "WAITING",
  hostUserId: "target-host",
  mode: "PVP",
  guest: null,
};

function request(body: unknown = { code: "ABC123" }) {
  return new NextRequest("http://localhost/api/lobbies/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const mock of [
    authMock,
    rateLimitMock,
    gameFindFirstMock,
    lobbyFindFirstMock,
    lobbyUpdateManyMock,
    lobbyGuestCreateMock,
    lobbyGuestDeleteManyMock,
    userFindUniqueMock,
    userUpdateManyMock,
    inviteFindManyMock,
    inviteUpdateManyMock,
    transactionMock,
    buildLobbyRoomStateMock,
    notifyLobbyMock,
    notifyUserMock,
  ]) {
    mock.mockReset();
  }
  authMock.mockResolvedValue({ user: { id: "joiner" } });
  rateLimitMock.mockResolvedValue({ limited: false });
  gameFindFirstMock.mockResolvedValue(null);
  lobbyFindFirstMock.mockResolvedValue(targetLobby);
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyGuestCreateMock.mockResolvedValue(undefined);
  lobbyGuestDeleteManyMock.mockResolvedValue({ count: 1 });
  userFindUniqueMock.mockResolvedValue({
    activeLobbyId: null,
    activeLobby: null,
  });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  inviteFindManyMock.mockResolvedValue([]);
  inviteUpdateManyMock.mockResolvedValue({ count: 1 });
  buildLobbyRoomStateMock.mockResolvedValue({
    id: "target-lobby",
    hostUserId: "target-host",
    status: "READY",
  });
  notifyLobbyMock.mockResolvedValue(undefined);
  notifyUserMock.mockResolvedValue(undefined);
  transactionMock.mockImplementation(async (operation) =>
    operation({
      lobby: { findFirst: lobbyFindFirstMock, updateMany: lobbyUpdateManyMock },
      lobbyGuest: {
        create: lobbyGuestCreateMock,
        deleteMany: lobbyGuestDeleteManyMock,
      },
      user: { findUnique: userFindUniqueMock, updateMany: userUpdateManyMock },
      lobbyInvite: {
        findMany: inviteFindManyMock,
        updateMany: inviteUpdateManyMock,
      },
    })
  );
  afterCalls.pending.length = 0;
});

describe("POST /api/lobbies/join", () => {
  it("joins instantly when the user has no current party", async () => {
    const response = await POST(request());
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { lobbyId: "target-lobby" },
    });
    expect(lobbyGuestCreateMock).toHaveBeenCalledWith({
      data: {
        lobbyId: "target-lobby",
        userId: "joiner",
        deckId: undefined,
      },
    });
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "target-lobby" }),
      { actorUserId: "joiner" }
    );
  });

  it("silently closes an empty personal lobby in the same transaction", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "personal-lobby",
      activeLobby: {
        id: "personal-lobby",
        status: "WAITING",
        hostUserId: "joiner",
        host: { username: "Joiner", name: null },
        guest: null,
        invites: [],
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenNthCalledWith(1, {
      where: {
        id: "personal-lobby",
        hostUserId: "joiner",
        status: { in: ["WAITING", "READY"] },
      },
      data: { status: "CLOSED", revision: { increment: 1 } },
    });
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { activeLobbyId: "personal-lobby" },
      data: { activeLobbyId: null },
    });
  });

  it("requires explicit confirmation before disbanding a hosted guest", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "current-lobby",
      activeLobby: {
        id: "current-lobby",
        status: "READY",
        hostUserId: "joiner",
        host: { username: "Joiner", name: null },
        guest: {
          userId: "ex-guest",
          user: { username: "Nami", name: null },
        },
        invites: [],
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Switching parties requires confirmation",
      code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
      details: {
        currentLobbyId: "current-lobby",
        targetCode: "ABC123",
        guestName: "Nami",
        hasPendingInvite: false,
      },
    });
    expect(lobbyUpdateManyMock).not.toHaveBeenCalled();
  });

  it("also requires confirmation when the host only has a pending invite", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "current-lobby",
      activeLobby: {
        id: "current-lobby",
        status: "WAITING",
        hostUserId: "joiner",
        host: { username: "Joiner", name: null },
        guest: null,
        invites: [{ id: "pending-invite" }],
      },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("PARTY_SWITCH_CONFIRMATION_REQUIRED");
    expect(body.details).toMatchObject({
      guestName: null,
      hasPendingInvite: true,
    });
  });

  it("confirmed host switching disbands, clears both pointers, cancels invites, and explains to the ex-guest", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "current-lobby",
      activeLobby: {
        id: "current-lobby",
        status: "READY",
        hostUserId: "joiner",
        host: { username: "Luffy", name: null },
        guest: {
          userId: "ex-guest",
          user: { username: "Nami", name: null },
        },
        invites: [{ id: "pending-invite" }],
      },
    });
    inviteFindManyMock
      .mockResolvedValueOnce([{ id: "pending-invite", toUserId: "invitee" }])
      .mockResolvedValueOnce([]);

    const response = await POST(
      request({ code: "ABC123", confirmSwitch: true })
    );
    await flushAfter();

    expect(response.status).toBe(200);
    expect(lobbyGuestDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "current-lobby" },
    });
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { activeLobbyId: "current-lobby" },
      data: { activeLobbyId: null },
    });
    expect(inviteUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "pending-invite", status: "PENDING" },
      data: { status: "CANCELED" },
    });
    expect(notifyUserMock).toHaveBeenCalledWith("ex-guest", {
      type: "lobby:party_disbanded",
      hostName: "Luffy",
    });
    expect(notifyUserMock).toHaveBeenCalledWith("invitee", {
      type: "lobby:invite_canceled",
      inviteId: "pending-invite",
    });
  });

  it("lets a guest silently switch while returning the old host to WAITING", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "old-lobby",
      activeLobby: {
        id: "old-lobby",
        status: "READY",
        hostUserId: "old-host",
        host: { username: "Zoro", name: null },
        guest: {
          userId: "joiner",
          user: { username: "Joiner", name: null },
        },
        invites: [],
      },
    });
    buildLobbyRoomStateMock.mockImplementation(async (id: string) => ({
      id,
      hostUserId: id === "old-lobby" ? "old-host" : "target-host",
      status: id === "old-lobby" ? "WAITING" : "READY",
    }));

    const response = await POST(request());
    await flushAfter();

    expect(response.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenNthCalledWith(1, {
      where: {
        id: "old-lobby",
        status: "READY",
        mode: "PVP",
        guest: { is: { userId: "joiner" } },
      },
      data: {
        status: "WAITING",
        hostReady: false,
        revision: { increment: 1 },
      },
    });
    expect(lobbyGuestDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "old-lobby", userId: "joiner" },
    });
    expect(buildLobbyRoomStateMock).toHaveBeenCalledWith("old-lobby");
  });

  it.each([
    ["closed", { status: "CLOSED" }, "This party has been closed"],
    ["full", { guest: { userId: "someone-else" } }, "This party is full"],
    ["in game", { status: "IN_GAME" }, "This party is already in a game"],
    ["own code", { hostUserId: "joiner" }, "You're already in this party"],
  ])(
    "returns a clear error for a %s target",
    async (_label, patch, message) => {
      lobbyFindFirstMock.mockResolvedValue({ ...targetLobby, ...patch });

      const response = await POST(request());

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: message });
      expect(lobbyGuestCreateMock).not.toHaveBeenCalled();
    }
  );

  it("returns 404 for an unknown code and 400 for malformed input", async () => {
    lobbyFindFirstMock.mockResolvedValueOnce(null);
    const missing = await POST(request());
    const malformed = await POST(request({ code: "--" }));

    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Party code not found" });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      error: "Enter a valid 6-character party code",
    });
  });

  it("fails gracefully when the target fills between confirmation and commit", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "personal-lobby",
      activeLobby: {
        id: "personal-lobby",
        status: "WAITING",
        hostUserId: "joiner",
        host: { username: "Joiner", name: null },
        guest: null,
        invites: [],
      },
    });
    lobbyUpdateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "This party is full" });
    expect(lobbyGuestCreateMock).not.toHaveBeenCalled();
    expect(transactionMock).toHaveBeenCalledOnce();
  });

  it("blocks switching while the joiner has an active game", async () => {
    gameFindFirstMock.mockResolvedValue({ lobbyId: "game-lobby" });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Finish or leave your current game first",
      code: "ACTIVE_GAME_EXISTS",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
