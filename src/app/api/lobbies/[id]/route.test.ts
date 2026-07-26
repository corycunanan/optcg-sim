import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const lobbyFindUniqueMock = vi.fn();
const lobbyFindFirstMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyGuestCreateMock = vi.fn();
const lobbyGuestDeleteManyMock = vi.fn();
const lobbyGuestUpdateMock = vi.fn();
const lobbyGuestUpsertMock = vi.fn();
const lobbySpectatorFindManyMock = vi.fn();
const lobbySpectatorDeleteManyMock = vi.fn();
const userUpdateManyMock = vi.fn();
const userFindManyMock = vi.fn();
const deckFindFirstMock = vi.fn();
const transactionMock = vi.fn();
const queryRawMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const notifyLobbyMock = vi.fn();
const notifySpectatorsRemovedAudienceMock = vi.fn();
const revokeSpectatorSocketsMock = vi.fn();
const notifyUserMock = vi.fn();
const cancelPendingLobbyInvitesMock = vi.fn();
const releaseActiveLobbyCallMock = vi.fn();

// Track `after()` callbacks so tests can deterministically wait for them
// before asserting on fanout side effects. The cb chain has multiple awaits
// (build state → notify), so a bare `void cb()` would race the assertions.
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
    lobby: {
      findUnique: (...args: unknown[]) => lobbyFindUniqueMock(...args),
      findFirst: (...args: unknown[]) => lobbyFindFirstMock(...args),
    },
    lobbyGuest: {
      create: (...args: unknown[]) => lobbyGuestCreateMock(...args),
      deleteMany: (...args: unknown[]) => lobbyGuestDeleteManyMock(...args),
      update: (...args: unknown[]) => lobbyGuestUpdateMock(...args),
      upsert: (...args: unknown[]) => lobbyGuestUpsertMock(...args),
    },
    deck: {
      findFirst: (...args: unknown[]) => deckFindFirstMock(...args),
    },
    card: {
      findMany: vi.fn(),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/lobbies/build-state", () => ({
  buildLobbyRoomState: (...args: unknown[]) => buildLobbyRoomStateMock(...args),
}));
vi.mock("@/lib/realtime/fanout-lobby", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/realtime/fanout-lobby")>();
  return {
    notifyLobby: (...args: unknown[]) => notifyLobbyMock(...args),
    notifySpectatorsRemoved: (
      audience: Parameters<typeof actual.notifySpectatorsRemoved>[0],
      deps: Parameters<typeof actual.notifySpectatorsRemoved>[1],
    ) => {
      notifySpectatorsRemovedAudienceMock(audience);
      return actual.notifySpectatorsRemoved(audience, deps);
    },
  };
});
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));
vi.mock("@/lib/realtime/revoke-spectators", () => ({
  revokeSpectatorSocketsForLobby: (...args: unknown[]) =>
    revokeSpectatorSocketsMock(...args),
}));
vi.mock("@/lib/lobbies/cancel-invites", () => ({
  cancelPendingLobbyInvites: (...args: unknown[]) =>
    cancelPendingLobbyInvitesMock(...args),
}));
vi.mock("@/lib/lobbies/active-membership", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/lobbies/active-membership")>();
  return {
    ...actual,
    releaseActiveLobby: (
      tx: Parameters<typeof actual.releaseActiveLobby>[0],
      userId: string,
      lobbyId: string,
    ) => {
      releaseActiveLobbyCallMock(userId, lobbyId);
      return actual.releaseActiveLobby(tx, userId, lobbyId);
    },
  };
});

const { GET, PATCH, DELETE } = await import("./route");

function buildRequest(body: unknown, search = "") {
  return new NextRequest(`http://localhost/api/lobbies/lobby-1${search}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "lobby-1" }) };

function baseLobby(overrides: Record<string, unknown> = {}) {
  return {
    id: "lobby-1",
    hostUserId: "host-user",
    hostDeckId: "host-deck",
    format: "Standard",
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    status: "READY",
    revision: 7,
    hostReady: true,
    allowSpectators: false,
    spectators: [],
    guest: {
      userId: "guest-user",
      deckId: "guest-deck",
      guestReady: true,
      user: { id: "guest-user", username: "guesty", name: "Guest Player" },
    },
    ...overrides,
  };
}

function createTransactionClient() {
  return {
    $queryRaw: queryRawMock,
    lobby: {
      updateMany: lobbyUpdateManyMock,
      findUnique: lobbyFindUniqueMock,
    },
    lobbyGuest: {
      deleteMany: lobbyGuestDeleteManyMock,
      update: lobbyGuestUpdateMock,
      upsert: lobbyGuestUpsertMock,
    },
    lobbySpectator: {
      findMany: lobbySpectatorFindManyMock,
      deleteMany: lobbySpectatorDeleteManyMock,
    },
    user: { findMany: userFindManyMock, updateMany: userUpdateManyMock },
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  lobbyFindUniqueMock.mockReset();
  lobbyFindFirstMock.mockReset();
  lobbyUpdateManyMock.mockReset();
  lobbyGuestCreateMock.mockReset();
  lobbyGuestDeleteManyMock.mockReset();
  lobbyGuestUpdateMock.mockReset();
  lobbyGuestUpsertMock.mockReset();
  lobbySpectatorFindManyMock.mockReset();
  lobbySpectatorDeleteManyMock.mockReset();
  userUpdateManyMock.mockReset();
  userFindManyMock.mockReset();
  deckFindFirstMock.mockReset();
  transactionMock.mockReset();
  queryRawMock.mockReset();
  buildLobbyRoomStateMock.mockReset();
  notifyLobbyMock.mockReset();
  notifySpectatorsRemovedAudienceMock.mockReset();
  revokeSpectatorSocketsMock.mockReset();
  notifyUserMock.mockReset();
  cancelPendingLobbyInvitesMock.mockReset();
  releaseActiveLobbyCallMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "host-user" } });
  revokeSpectatorSocketsMock.mockResolvedValue(undefined);
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  lobbyFindUniqueMock.mockResolvedValue(baseLobby());
  lobbyFindFirstMock.mockResolvedValue({
    id: "lobby-1",
    hostUserId: "host-user",
    status: "WAITING",
  });
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyGuestCreateMock.mockReturnValue({ query: "create-guest" });
  lobbyGuestDeleteManyMock.mockReturnValue({ query: "delete-guests" });
  lobbyGuestUpdateMock.mockReturnValue({ query: "update-guest" });
  lobbyGuestUpsertMock.mockReturnValue({ query: "upsert-guest" });
  lobbySpectatorFindManyMock.mockResolvedValue([]);
  lobbySpectatorDeleteManyMock.mockResolvedValue({ count: 0 });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  userFindManyMock.mockResolvedValue([]);
  deckFindFirstMock.mockResolvedValue({ id: "deck-1" });
  transactionMock.mockImplementation(async (operation) => {
    if (typeof operation !== "function") return [];
    return operation(createTransactionClient());
  });
  queryRawMock.mockResolvedValue([{ id: "lobby-1" }]);
  buildLobbyRoomStateMock.mockResolvedValue({
    id: "lobby-1",
    status: "READY",
    hostUserId: "host-user",
    viewerRole: "host",
    guest: null,
  });
  notifyLobbyMock.mockResolvedValue(undefined);
  notifyUserMock.mockResolvedValue(undefined);
  cancelPendingLobbyInvitesMock.mockResolvedValue(undefined);
  afterCalls.pending.length = 0;
});

describe("GET /api/lobbies/[id]", () => {
  it("builds the room snapshot for the authenticated viewer", async () => {
    const request = new NextRequest("http://localhost/api/lobbies/lobby-1");

    const res = await GET(request, params);

    expect(res.status).toBe(200);
    expect(buildLobbyRoomStateMock).toHaveBeenCalledWith(
      "lobby-1",
      "host-user",
    );
  });

  it("does not mark a current spectator as evicted", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "spectator-user" } });
    buildLobbyRoomStateMock.mockResolvedValueOnce({
      id: "lobby-1",
      status: "WAITING",
      hostUserId: "host-user",
      guest: null,
      viewerRole: "spectator",
    });

    const res = await GET(
      new NextRequest("http://localhost/api/lobbies/lobby-1"),
      params,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { status: "WAITING", viewerRole: "spectator" },
    });
  });
});

describe("PATCH /api/lobbies/[id]", () => {
  it.each([false, true])(
    "treats a same-value allowSpectators=%s request as a pure no-op",
    async (allowSpectators) => {
      lobbyFindUniqueMock.mockResolvedValueOnce(
        baseLobby({ allowSpectators }),
      );

      const res = await PATCH(buildRequest({ allowSpectators }), params);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(transactionMock).not.toHaveBeenCalled();
      expect(lobbyUpdateManyMock).not.toHaveBeenCalled();
      expect(lobbySpectatorFindManyMock).not.toHaveBeenCalled();
      expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
      expect(buildLobbyRoomStateMock).not.toHaveBeenCalled();
      expect(notifyLobbyMock).not.toHaveBeenCalled();
      expect(notifySpectatorsRemovedAudienceMock).not.toHaveBeenCalled();
      expect(afterCalls.pending).toHaveLength(0);
    },
  );

  it("ignores a same spectator value while applying other PATCH fields", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({ allowSpectators: true }),
    );

    const res = await PATCH(
      buildRequest({ allowSpectators: true, format: "Unlimited" }),
      params,
    );
    await flushAfter();

    expect(res.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenCalledOnce();
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lobby-1", status: "READY", mode: "PVP" },
      data: {
        format: "Unlimited",
        hostReady: false,
        revision: { increment: 1 },
      },
    });
    expect(lobbySpectatorFindManyMock).not.toHaveBeenCalled();
    expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
    expect(notifyLobbyMock).toHaveBeenCalledOnce();
    expect(notifySpectatorsRemovedAudienceMock).not.toHaveBeenCalled();
  });

  it("lets the host enable spectating with one revision bump and realtime fanout", async () => {
    const res = await PATCH(buildRequest({ allowSpectators: true }), params);
    await flushAfter();

    expect(res.status).toBe(200);
    expect(rateLimitMock).toHaveBeenCalledWith("lobby-update:host-user");
    expect(lobbyUpdateManyMock).toHaveBeenCalledOnce();
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "lobby-1",
        status: "READY",
        mode: "PVP",
        revision: 7,
      },
      data: {
        allowSpectators: true,
        revision: { increment: 1 },
      },
    });
    expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
    expect(notifyLobbyMock).toHaveBeenCalledOnce();
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lobby-1" }),
      { actorUserId: "host-user" },
    );
    expect(notifySpectatorsRemovedAudienceMock).not.toHaveBeenCalled();
  });

  it("rejects a guest spectator-setting change", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "guest-user" } });

    const res = await PATCH(buildRequest({ allowSpectators: false }), params);

    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 401 for an anonymous spectator-setting change", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await PATCH(buildRequest({ allowSpectators: false }), params);

    expect(res.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(lobbyFindUniqueMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-member spectator-setting change", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "outsider-user" } });

    const res = await PATCH(buildRequest({ allowSpectators: false }), params);

    expect(res.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a current spectator spectator-setting change", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "spectator-user" } });
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({ spectators: [{ userId: "spectator-user" }] }),
    );

    const res = await PATCH(buildRequest({ allowSpectators: false }), params);

    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 429 before reading or mutating the lobby", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });

    const res = await PATCH(buildRequest({ allowSpectators: false }), params);

    expect(res.status).toBe(429);
    expect(lobbyFindUniqueMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("captures spectators before deletion, releases their claims, and ejects each one", async () => {
    const preMutationSpectatorUserIds = ["spectator-1", "spectator-2"];
    let persistedSpectators = [...preMutationSpectatorUserIds]
      .reverse()
      .map((userId) => ({
      userId,
      }));
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({ allowSpectators: true, status: "IN_GAME" }),
    );
    lobbySpectatorFindManyMock.mockImplementation(async () => [
      ...persistedSpectators,
    ]);
    lobbySpectatorDeleteManyMock.mockImplementation(async () => {
      const count = persistedSpectators.length;
      persistedSpectators = [];
      return { count };
    });
    buildLobbyRoomStateMock.mockResolvedValueOnce({
      id: "lobby-1",
      status: "IN_GAME",
      hostUserId: "host-user",
      guest: { user: { id: "guest-user" } },
      spectators: [],
    });

    const res = await PATCH(buildRequest({ allowSpectators: false }), params);
    await flushAfter();

    expect(res.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenCalledOnce();
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "lobby-1",
        status: "IN_GAME",
        mode: "PVP",
        revision: 7,
      },
      data: {
        allowSpectators: false,
        revision: { increment: 1 },
      },
    });
    expect(lobbySpectatorFindManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1" },
      select: { userId: true },
      orderBy: { userId: "asc" },
    });
    expect(lobbySpectatorDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1" },
    });
    expect(lobbySpectatorFindManyMock.mock.invocationCallOrder[0]).toBeLessThan(
      lobbySpectatorDeleteManyMock.mock.invocationCallOrder[0],
    );
    expect(notifySpectatorsRemovedAudienceMock).toHaveBeenCalledWith({
      lobbyId: "lobby-1",
      reason: "SPECTATING_DISABLED",
      removedSpectatorUserIds: preMutationSpectatorUserIds,
    });
    expect(revokeSpectatorSocketsMock).toHaveBeenCalledWith(
      "lobby-1",
      8,
      preMutationSpectatorUserIds,
    );
    expect(userUpdateManyMock).toHaveBeenCalledTimes(2);
    expect(releaseActiveLobbyCallMock.mock.calls).toEqual(
      preMutationSpectatorUserIds.map((spectatorUserId) => [
        spectatorUserId,
        "lobby-1",
      ]),
    );
    for (const spectatorUserId of preMutationSpectatorUserIds) {
      expect(releaseActiveLobbyCallMock).toHaveBeenCalledWith(
        spectatorUserId,
        "lobby-1",
      );
      expect(userUpdateManyMock).toHaveBeenCalledWith({
        where: {
          id: spectatorUserId,
          activeLobbyId: "lobby-1",
        },
        data: { activeLobbyId: null },
      });
      expect(notifyUserMock).toHaveBeenCalledWith(
        spectatorUserId,
        {
          type: "lobby:spectator_removed",
          lobbyId: "lobby-1",
          reason: "SPECTATING_DISABLED",
        },
        undefined,
      );
    }
    expect(notifyUserMock).toHaveBeenCalledTimes(2);
    expect(notifyLobbyMock).toHaveBeenCalledOnce();
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lobby-1", spectators: [] }),
      { actorUserId: "host-user" },
    );
  });

  it("delivers directed ejections when the post-commit state rebuild fails", async () => {
    const removedSpectatorUserIds = ["spectator-1", "spectator-2"];
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({ allowSpectators: true }),
    );
    lobbySpectatorFindManyMock.mockResolvedValueOnce(
      removedSpectatorUserIds.map((userId) => ({ userId })),
    );
    buildLobbyRoomStateMock.mockRejectedValueOnce(
      new Error("state rebuild unavailable"),
    );

    const res = await PATCH(buildRequest({ allowSpectators: false }), params);
    await flushAfter();

    expect(res.status).toBe(200);
    expect(notifyLobbyMock).not.toHaveBeenCalled();
    expect(notifySpectatorsRemovedAudienceMock).toHaveBeenCalledWith({
      lobbyId: "lobby-1",
      reason: "SPECTATING_DISABLED",
      removedSpectatorUserIds,
    });
    expect(revokeSpectatorSocketsMock).toHaveBeenCalledWith(
      "lobby-1",
      8,
      removedSpectatorUserIds,
    );
    for (const spectatorUserId of removedSpectatorUserIds) {
      expect(notifyUserMock).toHaveBeenCalledWith(
        spectatorUserId,
        {
          type: "lobby:spectator_removed",
          lobbyId: "lobby-1",
          reason: "SPECTATING_DISABLED",
        },
        undefined,
      );
    }
    expect(notifyUserMock).toHaveBeenCalledTimes(2);
  });

  it("schedules no ejection fanout when the transaction rejects after deletion", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({ allowSpectators: true }),
    );
    lobbySpectatorFindManyMock.mockResolvedValueOnce([
      { userId: "spectator-1" },
    ]);
    transactionMock.mockImplementationOnce(async (operation) => {
      if (typeof operation !== "function") return [];
      await operation(createTransactionClient());
      throw new Error("commit rejected");
    });

    await expect(
      PATCH(buildRequest({ allowSpectators: false }), params),
    ).rejects.toThrow("commit rejected");

    expect(lobbySpectatorFindManyMock).toHaveBeenCalledOnce();
    expect(lobbySpectatorDeleteManyMock).toHaveBeenCalledOnce();
    expect(afterCalls.pending).toHaveLength(0);
    await flushAfter();
    expect(notifySpectatorsRemovedAudienceMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
    expect(notifyLobbyMock).not.toHaveBeenCalled();
  });

  it("rejects a spectator toggle when the observed revision is stale", async () => {
    lobbyFindUniqueMock
      .mockResolvedValueOnce(baseLobby({ allowSpectators: true, revision: 12 }))
      .mockResolvedValueOnce({ status: "READY" });
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const res = await PATCH(buildRequest({ allowSpectators: false }), params);
    await flushAfter();

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Lobby state changed before the update completed",
      code: "LOBBY_STATE_CHANGED",
    });
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revision: 12 }),
      }),
    );
    expect(lobbySpectatorFindManyMock).not.toHaveBeenCalled();
    expect(lobbySpectatorDeleteManyMock).not.toHaveBeenCalled();
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(notifyLobbyMock).not.toHaveBeenCalled();
    expect(notifySpectatorsRemovedAudienceMock).not.toHaveBeenCalled();
  });

  it("lets the host change pre-game flow and bumps the lobby revision", async () => {
    const res = await PATCH(
      buildRequest({ pregameMode: "GUEST_FIRST" }),
      params,
    );

    expect(res.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lobby-1", status: "READY", mode: "PVP" },
      data: {
        pregameMode: "GUEST_FIRST",
        hostReady: false,
        revision: { increment: 1 },
      },
    });
  });

  it("rejects a guest pre-game flow change", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "guest-user" } });

    const res = await PATCH(
      buildRequest({ pregameMode: "GUEST_FIRST" }),
      params,
    );

    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("accepts Solitaire pre-game modes only for Solitaire lobbies", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({ mode: "SOLITAIRE", pregameMode: "SOLITAIRE_RANDOM" }),
    );

    const accepted = await PATCH(
      buildRequest({ pregameMode: "SIDE_A_FIRST" }),
      params,
    );
    expect(accepted.status).toBe(200);

    lobbyFindUniqueMock.mockResolvedValueOnce(baseLobby());
    const rejected = await PATCH(
      buildRequest({ pregameMode: "SIDE_A_FIRST" }),
      params,
    );
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({
      code: "INVALID_PREGAME_MODE",
    });
  });

  it("rejects PVP pre-game modes for Solitaire lobbies", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({ mode: "SOLITAIRE", pregameMode: "SIDE_B_FIRST" }),
    );

    const res = await PATCH(
      buildRequest({ pregameMode: "RANDOM_FIXED" }),
      params,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "INVALID_PREGAME_MODE",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("normalizes explicit legacy PRIORITY_ROLL input for Solitaire", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({ mode: "SOLITAIRE", pregameMode: "PRIORITY_ROLL" }),
    );

    const res = await PATCH(
      buildRequest({ pregameMode: "PRIORITY_ROLL" }),
      params,
    );

    expect(res.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lobby-1", status: "READY", mode: "SOLITAIRE" },
      data: {
        pregameMode: "SOLITAIRE_RANDOM",
        hostReady: false,
        revision: { increment: 1 },
      },
    });
  });

  it("normalizes the stored PVP mode when switching to Solitaire", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(baseLobby({ guest: null }));

    const res = await PATCH(buildRequest({ mode: "SOLITAIRE" }), params);

    expect(res.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lobby-1", status: "READY", mode: "PVP" },
      data: {
        mode: "SOLITAIRE",
        pregameMode: "SOLITAIRE_RANDOM",
        hostReady: false,
        status: "READY",
        revision: { increment: 1 },
      },
    });
  });

  it("normalizes the stored Solitaire mode when switching to PVP", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({
        mode: "SOLITAIRE",
        pregameMode: "SIDE_A_FIRST",
        guest: null,
      }),
    );

    const res = await PATCH(buildRequest({ mode: "PVP" }), params);

    expect(res.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lobby-1", status: "READY", mode: "SOLITAIRE" },
      data: {
        mode: "PVP",
        pregameMode: "PRIORITY_ROLL",
        hostReady: false,
        status: "WAITING",
        revision: { increment: 1 },
      },
    });
  });

  it.each(["IN_GAME", "CLOSED"])(
    "rejects a pre-game flow change when the lobby is %s",
    async (status) => {
      lobbyFindUniqueMock.mockResolvedValueOnce(baseLobby({ status }));

      const res = await PATCH(
        buildRequest({ pregameMode: "RANDOM_FIXED" }),
        params,
      );

      expect(res.status).toBe(404);
      expect(transactionMock).not.toHaveBeenCalled();
    },
  );

  it("blocks PVP to Solitaire while a real guest is present unless forced", async () => {
    const res = await PATCH(
      buildRequest({ mode: "SOLITAIRE", pregameMode: "SOLITAIRE_RANDOM" }),
      params,
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "Guest is present",
      code: "GUEST_PRESENT",
      details: { guestUserId: "guest-user", guestUserName: "guesty" },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("force-switches PVP to Solitaire by ejecting the real guest and creating the host side B row", async () => {
    const res = await PATCH(
      buildRequest(
        {
          mode: "SOLITAIRE",
          pregameMode: "SOLITAIRE_RANDOM",
          guestDeckId: "side-b-deck",
        },
        "?force=true",
      ),
      params,
    );

    expect(res.status).toBe(200);
    expect(lobbyGuestDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1" },
    });
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "guest-user", activeLobbyId: "lobby-1" },
      data: { activeLobbyId: null },
    });
    expect(lobbyGuestUpsertMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1" },
      create: {
        lobbyId: "lobby-1",
        userId: "host-user",
        deckId: "side-b-deck",
        guestReady: false,
      },
      update: {
        userId: "host-user",
        deckId: "side-b-deck",
        guestReady: false,
      },
    });
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "lobby-1",
        status: "READY",
        mode: "PVP",
        revision: 7,
      },
      data: {
        mode: "SOLITAIRE",
        pregameMode: "SOLITAIRE_RANDOM",
        hostReady: false,
        status: "READY",
        revision: { increment: 1 },
      },
    });
    expect(transactionMock).toHaveBeenCalledOnce();
  });

  it("revision-guards forced Solitaire guest ejection against a concurrent kick", async () => {
    lobbyFindUniqueMock
      .mockResolvedValueOnce(baseLobby({ status: "WAITING", revision: 12 }))
      .mockResolvedValueOnce({ status: "WAITING" });
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const res = await PATCH(
      buildRequest(
        { mode: "SOLITAIRE", pregameMode: "SOLITAIRE_RANDOM" },
        "?force=true",
      ),
      params,
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Lobby state changed before the update completed",
      code: "LOBBY_STATE_CHANGED",
    });
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revision: 12 }),
      }),
    );
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("cleans up host-as-guest state when switching Solitaire back to PVP", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({
        mode: "SOLITAIRE",
        pregameMode: "SIDE_B_FIRST",
        guest: {
          userId: "host-user",
          deckId: "side-b-deck",
          guestReady: false,
          user: { id: "host-user", username: "hosty", name: "Host Player" },
        },
      }),
    );

    const res = await PATCH(
      buildRequest({ mode: "PVP", pregameMode: "PRIORITY_ROLL" }),
      params,
    );

    expect(res.status).toBe(200);
    expect(lobbyGuestDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1", userId: "host-user" },
    });
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lobby-1", status: "READY", mode: "SOLITAIRE" },
      data: {
        mode: "PVP",
        pregameMode: "PRIORITY_ROLL",
        hostReady: false,
        status: "WAITING",
        revision: { increment: 1 },
      },
    });
  });

  it("lets the PVP guest change only their deck and clears guestReady", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "guest-user" } });

    const res = await PATCH(
      buildRequest({ guestDeckId: "new-guest-deck" }),
      params,
    );

    expect(res.status).toBe(200);
    expect(deckFindFirstMock).toHaveBeenCalledWith({
      where: { id: "new-guest-deck", userId: "guest-user" },
    });
    expect(lobbyGuestUpdateMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1" },
      data: { deckId: "new-guest-deck", guestReady: false },
    });
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lobby-1", status: "READY", mode: "PVP" },
      data: {
        status: "READY",
        revision: { increment: 1 },
      },
    });
  });

  it("rejects host attempts to mutate the PVP guest deck slot", async () => {
    const res = await PATCH(
      buildRequest({ guestDeckId: "new-guest-deck" }),
      params,
    );

    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("requires the actor seat to have a deck before readying", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(baseLobby({ hostDeckId: null }));

    const res = await PATCH(buildRequest({ ready: true }), params);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body).toEqual({
      error: "Select a deck before readying",
      code: "DECK_REQUIRED",
    });
  });

  it("clears hostReady when the host changes their deck", async () => {
    const res = await PATCH(buildRequest({ hostDeckId: null }), params);

    expect(res.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lobby-1", status: "READY", mode: "PVP" },
      data: {
        hostDeckId: null,
        hostReady: false,
        revision: { increment: 1 },
      },
    });
  });

  it("rejects PVComputer mutations until the mode is implemented", async () => {
    const res = await PATCH(buildRequest({ mode: "PVCOMPUTER" }), params);

    expect(res.status).toBe(501);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("fans out lobby:state_changed to other members after a successful PATCH", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "guest-user" } });
    buildLobbyRoomStateMock.mockResolvedValueOnce({
      id: "lobby-1",
      status: "READY",
      hostUserId: "host-user",
      guest: { user: { id: "guest-user" } },
    });

    const res = await PATCH(buildRequest({ ready: true }), params);
    await flushAfter();

    expect(res.status).toBe(200);
    expect(buildLobbyRoomStateMock).toHaveBeenCalledWith("lobby-1");
    expect(notifyLobbyMock).toHaveBeenCalledTimes(1);
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lobby-1" }),
      { actorUserId: "guest-user" },
    );
    // No eject in this scenario, so the EVICTED single-user notify is silent.
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("notifies the ejected guest with status=EVICTED on a forced PVP→Solitaire flip", async () => {
    buildLobbyRoomStateMock.mockResolvedValueOnce({
      id: "lobby-1",
      status: "READY",
      hostUserId: "host-user",
      guest: {
        user: { id: "host-user", username: "hosty", name: null, image: null },
      },
    });

    const res = await PATCH(
      buildRequest(
        {
          mode: "SOLITAIRE",
          pregameMode: "SOLITAIRE_RANDOM",
          guestDeckId: "side-b-deck",
        },
        "?force=true",
      ),
      params,
    );
    await flushAfter();

    expect(res.status).toBe(200);
    expect(notifyLobbyMock).toHaveBeenCalledTimes(1);
    expect(notifyLobbyMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lobby-1" }),
      { actorUserId: "host-user" },
    );
    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith("guest-user", {
      type: "lobby:state_changed",
      lobby: expect.objectContaining({ status: "EVICTED" }),
    });
  });

  it("does not fan out when PATCH is rejected before the transaction", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(null);

    const res = await PATCH(buildRequest({ ready: true }), params);
    await flushAfter();

    expect(res.status).toBe(404);
    expect(notifyLobbyMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("does not mutate guest seats when close wins before PATCH commits", async () => {
    lobbyFindUniqueMock
      .mockResolvedValueOnce(baseLobby())
      .mockResolvedValueOnce({ status: "CLOSED" });
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const res = await PATCH(
      buildRequest(
        {
          mode: "SOLITAIRE",
          pregameMode: "SOLITAIRE_RANDOM",
          guestDeckId: "side-b-deck",
        },
        "?force=true",
      ),
      params,
    );
    await flushAfter();

    expect(res.status).toBe(404);
    expect(lobbyGuestDeleteManyMock).not.toHaveBeenCalled();
    expect(lobbyGuestUpsertMock).not.toHaveBeenCalled();
    expect(notifyLobbyMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/lobbies/[id]", () => {
  it("closes a WAITING PVP lobby and cancels pending invites", async () => {
    const res = await DELETE(
      new NextRequest("http://localhost/api/lobbies/lobby-1", {
        method: "DELETE",
      }),
      params,
    );
    await flushAfter();

    expect(res.status).toBe(200);
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "lobby-1",
        hostUserId: "host-user",
        mode: "PVP",
        status: { in: ["WAITING", "READY"] },
        revision: 7,
      },
      data: { status: "CLOSED", revision: { increment: 1 } },
    });
    expect(userFindManyMock).toHaveBeenCalledWith({
      where: { activeLobbyId: "lobby-1" },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    expect(cancelPendingLobbyInvitesMock).toHaveBeenCalledWith("lobby-1");
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("closes a READY PVP lobby and notifies its guest with status=CLOSED", async () => {
    buildLobbyRoomStateMock.mockResolvedValueOnce({
      id: "lobby-1",
      status: "CLOSED",
      hostUserId: "host-user",
      guest: {
        user: { id: "guest-user", username: "guesty", name: null, image: null },
      },
    });

    const res = await DELETE(
      new NextRequest("http://localhost/api/lobbies/lobby-1", {
        method: "DELETE",
      }),
      params,
    );
    await flushAfter();

    expect(res.status).toBe(200);
    expect(cancelPendingLobbyInvitesMock).toHaveBeenCalledWith("lobby-1");
    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith("guest-user", {
      type: "lobby:state_changed",
      lobby: expect.objectContaining({ status: "CLOSED" }),
    });
  });

  it("captures spectators before CLOSED and directs a terminal event to all of them", async () => {
    const capturedSpectators = [
      { userId: "spectator-1" },
      { userId: "spectator-2" },
    ];
    let lobbyClosed = false;
    lobbyFindUniqueMock.mockImplementationOnce(async () => ({
      ...baseLobby(),
      spectators: capturedSpectators,
    }));
    lobbyUpdateManyMock.mockImplementationOnce(async () => {
      lobbyClosed = true;
      return { count: 1 };
    });
    notifySpectatorsRemovedAudienceMock.mockImplementationOnce(() => {
      expect(lobbyClosed).toBe(true);
    });

    const response = await DELETE(
      new NextRequest("http://localhost/api/lobbies/lobby-1", {
        method: "DELETE",
      }),
      params,
    );
    await flushAfter();

    expect(response.status).toBe(200);
    expect(queryRawMock.mock.invocationCallOrder[0]).toBeLessThan(
      lobbyFindUniqueMock.mock.invocationCallOrder[0],
    );
    expect(lobbyFindUniqueMock.mock.invocationCallOrder[0]).toBeLessThan(
      lobbyUpdateManyMock.mock.invocationCallOrder[0],
    );
    expect(notifySpectatorsRemovedAudienceMock).toHaveBeenCalledWith({
      lobbyId: "lobby-1",
      reason: "LOBBY_CLOSED",
      removedSpectatorUserIds: ["spectator-1", "spectator-2"],
    });
    expect(revokeSpectatorSocketsMock).toHaveBeenCalledWith(
      "lobby-1",
      8,
      ["spectator-1", "spectator-2"],
    );
    expect(notifyUserMock).toHaveBeenCalledWith(
      "spectator-1",
      {
        type: "lobby:spectator_removed",
        lobbyId: "lobby-1",
        reason: "LOBBY_CLOSED",
      },
      undefined,
    );
    expect(notifyUserMock).toHaveBeenCalledWith(
      "spectator-2",
      {
        type: "lobby:spectator_removed",
        lobbyId: "lobby-1",
        reason: "LOBBY_CLOSED",
      },
      undefined,
    );
  });

  it("still notifies spectators if rebuilding CLOSED state fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    lobbyFindUniqueMock.mockResolvedValueOnce({
      ...baseLobby(),
      spectators: [{ userId: "spectator-1" }],
    });
    buildLobbyRoomStateMock.mockRejectedValueOnce(
      new Error("state unavailable"),
    );

    const response = await DELETE(
      new NextRequest("http://localhost/api/lobbies/lobby-1", {
        method: "DELETE",
      }),
      params,
    );
    await flushAfter();

    expect(response.status).toBe(200);
    expect(notifyUserMock).toHaveBeenCalledWith(
      "spectator-1",
      {
        type: "lobby:spectator_removed",
        lobbyId: "lobby-1",
        reason: "LOBBY_CLOSED",
      },
      undefined,
    );
    consoleError.mockRestore();
  });

  it("still notifies the guest if invite cancellation fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    cancelPendingLobbyInvitesMock.mockRejectedValueOnce(
      new Error("realtime unavailable"),
    );
    buildLobbyRoomStateMock.mockResolvedValueOnce({
      id: "lobby-1",
      status: "CLOSED",
      hostUserId: "host-user",
      guest: {
        user: { id: "guest-user", username: "guesty", name: null, image: null },
      },
    });

    const res = await DELETE(
      new NextRequest("http://localhost/api/lobbies/lobby-1", {
        method: "DELETE",
      }),
      params,
    );
    await flushAfter();

    expect(res.status).toBe(200);
    expect(notifyUserMock).toHaveBeenCalledWith("guest-user", {
      type: "lobby:state_changed",
      lobby: expect.objectContaining({ status: "CLOSED" }),
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[lobbies:close] invite cancellation failed",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("rejects a non-host without closing or canceling invites", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "guest-user" } });
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    lobbyFindUniqueMock.mockResolvedValueOnce(baseLobby());

    const res = await DELETE(
      new NextRequest("http://localhost/api/lobbies/lobby-1", {
        method: "DELETE",
      }),
      params,
    );
    await flushAfter();

    expect(res.status).toBe(403);
    expect(cancelPendingLobbyInvitesMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("returns a stable conflict when start wins the READY status race", async () => {
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({
        status: "IN_GAME",
        gameSession: { id: "game-1" },
      }),
    );

    const res = await DELETE(
      new NextRequest("http://localhost/api/lobbies/lobby-1", {
        method: "DELETE",
      }),
      params,
    );
    await flushAfter();

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Lobby already started",
      code: "ALREADY_STARTED",
    });
    expect(cancelPendingLobbyInvitesMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("excludes Solitaire lobbies from the host close flow", async () => {
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({ mode: "SOLITAIRE", gameSession: null }),
    );

    const res = await DELETE(
      new NextRequest("http://localhost/api/lobbies/lobby-1", {
        method: "DELETE",
      }),
      params,
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Only a pre-game PVP lobby can be closed",
    });
    expect(cancelPendingLobbyInvitesMock).not.toHaveBeenCalled();
  });

  it("returns 404 without side effects when the lobby is already gone", async () => {
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    lobbyFindUniqueMock.mockResolvedValueOnce(null);

    const res = await DELETE(
      new NextRequest("http://localhost/api/lobbies/lobby-1", {
        method: "DELETE",
      }),
      params,
    );
    await flushAfter();

    expect(res.status).toBe(404);
    expect(cancelPendingLobbyInvitesMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});
