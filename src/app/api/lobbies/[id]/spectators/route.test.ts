import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const joinLobbyAsSpectatorMock = vi.fn();
const publishSpectatorJoinMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const transactionMock = vi.fn();
const queryRawMock = vi.fn();
const lobbyFindUniqueMock = vi.fn();
const lobbySpectatorDeleteManyMock = vi.fn();
const lobbyUpdateMock = vi.fn();
const userUpdateManyMock = vi.fn();
const notifyLobbyMock = vi.fn();

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
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/lobbies/join-spectator", () => ({
  joinLobbyAsSpectator: (...args: unknown[]) =>
    joinLobbyAsSpectatorMock(...args),
  publishSpectatorJoin: (...args: unknown[]) =>
    publishSpectatorJoinMock(...args),
  spectatorJoinFailureMessage: (kind: string) =>
    ({
      not_found: "Party not found",
      closed: "This party has been closed",
      spectating_disabled: "Spectating is disabled for this party",
      full: "This party is full",
      seated: "Seated players cannot spectate their own party",
      active_game_exists: "Finish or leave your current game first",
      active_lobby_exists: "Your current party changed. Please try again",
      concurrent_state_conflict: "Party state changed concurrently. Try again.",
    })[kind],
}));
vi.mock("@/lib/lobbies/build-state", () => ({
  buildLobbyRoomState: (...args: unknown[]) => buildLobbyRoomStateMock(...args),
}));
vi.mock("@/lib/realtime/fanout-lobby", () => ({
  notifyLobby: (...args: unknown[]) => notifyLobbyMock(...args),
}));

const { DELETE, POST } = await import("./route");

const params = { params: Promise.resolve({ id: "lobby-1" }) };
const joinedResult = {
  kind: "joined",
  lobbyId: "lobby-1",
  membership: "created",
  previousLobbyId: null,
  previousLobbyClosed: false,
  removedSpectatorUserIds: [],
  disbandedGuest: null,
  canceledInvites: [],
};
const roomState = {
  id: "lobby-1",
  status: "IN_GAME",
  version: 8,
  viewerRole: "spectator",
};

function request(body: unknown = {}) {
  return new NextRequest("http://localhost/api/lobbies/lobby-1/spectators", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const mock of [
    authMock,
    rateLimitMock,
    joinLobbyAsSpectatorMock,
    publishSpectatorJoinMock,
    buildLobbyRoomStateMock,
    transactionMock,
    queryRawMock,
    lobbyFindUniqueMock,
    lobbySpectatorDeleteManyMock,
    lobbyUpdateMock,
    userUpdateManyMock,
    notifyLobbyMock,
  ]) {
    mock.mockReset();
  }
  authMock.mockResolvedValue({ user: { id: "spectator-user" } });
  rateLimitMock.mockResolvedValue({ limited: false });
  joinLobbyAsSpectatorMock.mockResolvedValue(joinedResult);
  publishSpectatorJoinMock.mockResolvedValue(undefined);
  buildLobbyRoomStateMock.mockResolvedValue(roomState);
  queryRawMock.mockResolvedValue([{ id: "lobby-1" }]);
  lobbyFindUniqueMock.mockResolvedValue({
    status: "IN_GAME",
    hostUserId: "host-user",
    guest: { userId: "guest-user" },
    spectators: [{ userId: "spectator-user" }],
  });
  lobbySpectatorDeleteManyMock.mockResolvedValue({ count: 1 });
  lobbyUpdateMock.mockResolvedValue({ id: "lobby-1" });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  notifyLobbyMock.mockResolvedValue(undefined);
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

describe("POST /api/lobbies/[id]/spectators", () => {
  it("returns the viewer-scoped current state and publishes a created join", async () => {
    const response = await POST(request(), params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: roomState });
    expect(rateLimitMock).toHaveBeenCalledWith("lobby-join:spectator-user");
    expect(joinLobbyAsSpectatorMock).toHaveBeenCalledWith({
      userId: "spectator-user",
      lobbyId: "lobby-1",
    });
    expect(buildLobbyRoomStateMock).toHaveBeenCalledWith(
      "lobby-1",
      "spectator-user"
    );
    expect(publishSpectatorJoinMock).toHaveBeenCalledWith(
      joinedResult,
      "spectator-user"
    );
  });

  it("returns 401 before rate limiting or mutation when unauthenticated", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await POST(request(), params);

    expect(response.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(joinLobbyAsSpectatorMock).not.toHaveBeenCalled();
  });

  it("returns 429 before parsing or mutation when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true });

    const response = await POST(
      new NextRequest("http://localhost/api/lobbies/lobby-1/spectators", {
        method: "POST",
        body: "not-json",
      }),
      params
    );

    expect(response.status).toBe(429);
    expect(joinLobbyAsSpectatorMock).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404, "Party not found"],
    ["spectating_disabled", 403, "Spectating is disabled for this party"],
    ["full", 409, "This party is full"],
    ["closed", 409, "This party has been closed"],
    ["seated", 409, "Seated players cannot spectate their own party"],
  ])("maps %s to its distinct response", async (kind, status, error) => {
    joinLobbyAsSpectatorMock.mockResolvedValueOnce({ kind });

    const response = await POST(request(), params);

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(buildLobbyRoomStateMock).not.toHaveBeenCalled();
    expect(publishSpectatorJoinMock).not.toHaveBeenCalled();
  });

  it("passes explicit host-disband confirmation through to the transaction", async () => {
    await POST(request({ confirmDisbandLobbyId: "current-lobby" }), params);

    expect(joinLobbyAsSpectatorMock).toHaveBeenCalledWith({
      userId: "spectator-user",
      lobbyId: "lobby-1",
      confirmDisbandLobbyId: "current-lobby",
    });
  });

  it("returns the target lobby in the host-disband confirmation payload", async () => {
    joinLobbyAsSpectatorMock.mockResolvedValueOnce({
      kind: "confirmation_required",
      currentLobbyId: "current-lobby",
      targetLobbyId: "lobby-1",
      guestName: "Nami",
      hasPendingInvite: true,
    });

    const response = await POST(request(), params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Switching parties requires confirmation",
      code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
      details: {
        currentLobbyId: "current-lobby",
        targetLobbyId: "lobby-1",
        guestName: "Nami",
        hasPendingInvite: true,
      },
    });
    expect(buildLobbyRoomStateMock).not.toHaveBeenCalled();
  });

  it("returns the existing spectator's state through the no-op publisher", async () => {
    joinLobbyAsSpectatorMock.mockResolvedValueOnce({
      ...joinedResult,
      membership: "existing",
    });

    const response = await POST(request(), params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: roomState });
    expect(publishSpectatorJoinMock).toHaveBeenCalledWith(
      expect.objectContaining({ membership: "existing" }),
      "spectator-user"
    );
  });
});

describe("DELETE /api/lobbies/[id]/spectators", () => {
  it("removes the caller's spectator row, releases membership, and bumps revision once", async () => {
    const response = await DELETE(request(), params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(rateLimitMock).toHaveBeenCalledWith("lobby-leave:spectator-user");
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(lobbySpectatorDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1", userId: "spectator-user" },
    });
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "spectator-user", activeLobbyId: "lobby-1" },
      data: { activeLobbyId: null },
    });
    expect(lobbyUpdateMock).toHaveBeenCalledWith({
      where: { id: "lobby-1" },
      data: { revision: { increment: 1 } },
    });
  });

  it("fans out the decremented spectator count without a directed self-ejection event", async () => {
    buildLobbyRoomStateMock.mockResolvedValueOnce({
      ...roomState,
      spectators: [],
    });

    const response = await DELETE(request(), params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ spectators: [] }),
      { actorUserId: "spectator-user" }
    );
  });

  it("returns 200 without a revision bump or fanout when already removed", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce({
      status: "IN_GAME",
      hostUserId: "host-user",
      guest: { userId: "guest-user" },
      spectators: [],
    });

    const response = await DELETE(request(), params);
    await flushAfter();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
    expect(buildLobbyRoomStateMock).not.toHaveBeenCalled();
    expect(notifyLobbyMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "host",
      userId: "host-user",
    },
    {
      name: "guest",
      userId: "guest-user",
    },
  ])(
    "returns 403 before mutation when the $name attempts self-leave",
    async ({ userId }) => {
      authMock.mockResolvedValueOnce({ user: { id: userId } });

      const response = await DELETE(request(), params);

      expect(response.status).toBe(403);
      expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
      expect(userUpdateManyMock).not.toHaveBeenCalled();
      expect(lobbyUpdateMock).not.toHaveBeenCalled();
    }
  );

  it("returns 401 before rate limiting or mutation when unauthenticated", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await DELETE(request(), params);

    expect(response.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 429 before mutation when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true });

    const response = await DELETE(request(), params);

    expect(response.status).toBe(429);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 404 before mutation when the lobby lock cannot be acquired", async () => {
    queryRawMock.mockResolvedValueOnce([]);

    const response = await DELETE(request(), params);

    expect(response.status).toBe(404);
    expect(lobbyFindUniqueMock).not.toHaveBeenCalled();
    expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 404 before mutation for a closed lobby", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce({
      status: "CLOSED",
      hostUserId: "host-user",
      guest: null,
      spectators: [{ userId: "spectator-user" }],
    });

    const response = await DELETE(request(), params);

    expect(response.status).toBe(404);
    expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 409 and relies on transaction rollback when the row changes after capture", async () => {
    lobbySpectatorDeleteManyMock.mockResolvedValueOnce({ count: 0 });

    const response = await DELETE(request(), params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Spectator membership changed before it could be released",
      code: "LOBBY_STATE_CHANGED",
    });
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
    expect(buildLobbyRoomStateMock).not.toHaveBeenCalled();
  });
});
