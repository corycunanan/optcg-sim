import { beforeEach, describe, expect, it, vi } from "vitest";

const gameFindFirstMock = vi.fn();
const transactionMock = vi.fn();
const queryRawMock = vi.fn();
const lobbyFindUniqueMock = vi.fn();
const lobbyUpdateMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const spectatorCountMock = vi.fn();
const spectatorCreateMock = vi.fn();
const spectatorFindManyMock = vi.fn();
const spectatorDeleteManyMock = vi.fn();
const guestDeleteManyMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userUpdateManyMock = vi.fn();
const inviteFindManyMock = vi.fn();
const inviteUpdateManyMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const notifyLobbyMock = vi.fn();
const notifySpectatorsRemovedMock = vi.fn();
const notifyUserMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findFirst: (...args: unknown[]) => gameFindFirstMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("./build-state", () => ({
  buildLobbyRoomState: (...args: unknown[]) => buildLobbyRoomStateMock(...args),
}));
vi.mock("@/lib/realtime/fanout-lobby", () => ({
  notifyLobby: (...args: unknown[]) => notifyLobbyMock(...args),
  notifySpectatorsRemoved: (...args: unknown[]) =>
    notifySpectatorsRemovedMock(...args),
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));

const { joinLobbyAsSpectator, MAX_LOBBY_SPECTATORS, publishSpectatorJoin } =
  await import("./join-spectator");

function targetLobby(overrides: Record<string, unknown> = {}) {
  return {
    id: "target-lobby",
    status: "WAITING",
    allowSpectators: true,
    hostUserId: "target-host",
    guest: { userId: "target-guest" },
    spectators: [],
    ...overrides,
  };
}

function transactionClient() {
  return {
    $queryRaw: queryRawMock,
    lobby: {
      findUnique: lobbyFindUniqueMock,
      update: lobbyUpdateMock,
      updateMany: lobbyUpdateManyMock,
    },
    lobbySpectator: {
      count: spectatorCountMock,
      create: spectatorCreateMock,
      findMany: spectatorFindManyMock,
      deleteMany: spectatorDeleteManyMock,
    },
    lobbyGuest: { deleteMany: guestDeleteManyMock },
    user: {
      findUnique: userFindUniqueMock,
      updateMany: userUpdateManyMock,
    },
    lobbyInvite: {
      findMany: inviteFindManyMock,
      updateMany: inviteUpdateManyMock,
    },
  };
}

beforeEach(() => {
  for (const mock of [
    gameFindFirstMock,
    transactionMock,
    queryRawMock,
    lobbyFindUniqueMock,
    lobbyUpdateMock,
    lobbyUpdateManyMock,
    spectatorCountMock,
    spectatorCreateMock,
    spectatorFindManyMock,
    spectatorDeleteManyMock,
    guestDeleteManyMock,
    userFindUniqueMock,
    userUpdateManyMock,
    inviteFindManyMock,
    inviteUpdateManyMock,
    buildLobbyRoomStateMock,
    notifyLobbyMock,
    notifySpectatorsRemovedMock,
    notifyUserMock,
  ]) {
    mock.mockReset();
  }

  gameFindFirstMock.mockResolvedValue(null);
  queryRawMock.mockResolvedValue([{ id: "target-lobby" }]);
  lobbyFindUniqueMock.mockResolvedValue(targetLobby());
  lobbyUpdateMock.mockResolvedValue({ id: "target-lobby" });
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  spectatorCountMock.mockResolvedValue(0);
  spectatorCreateMock.mockResolvedValue({ id: "spectator-row" });
  spectatorFindManyMock.mockResolvedValue([]);
  spectatorDeleteManyMock.mockResolvedValue({ count: 1 });
  guestDeleteManyMock.mockResolvedValue({ count: 1 });
  userFindUniqueMock.mockResolvedValue({
    activeLobbyId: null,
    activeLobby: null,
  });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  inviteFindManyMock.mockResolvedValue([]);
  inviteUpdateManyMock.mockResolvedValue({ count: 1 });
  transactionMock.mockImplementation(async (operation) =>
    operation(transactionClient())
  );
  buildLobbyRoomStateMock.mockResolvedValue(null);
  notifyLobbyMock.mockResolvedValue(undefined);
  notifySpectatorsRemovedMock.mockResolvedValue(undefined);
  notifyUserMock.mockResolvedValue(undefined);
});

describe("joinLobbyAsSpectator", () => {
  it.each(["WAITING", "READY", "IN_GAME"])(
    "creates a spectator in %s and bumps the target revision once",
    async (status) => {
      lobbyFindUniqueMock.mockResolvedValueOnce(targetLobby({ status }));

      await expect(
        joinLobbyAsSpectator({
          userId: "spectator-user",
          lobbyId: "target-lobby",
        })
      ).resolves.toMatchObject({
        kind: "joined",
        membership: "created",
        lobbyId: "target-lobby",
      });

      expect(queryRawMock).toHaveBeenCalledOnce();
      expect(spectatorCountMock).toHaveBeenCalledWith({
        where: { lobbyId: "target-lobby" },
      });
      expect(userUpdateManyMock).toHaveBeenCalledWith({
        where: { id: "spectator-user", activeLobbyId: null },
        data: { activeLobbyId: "target-lobby" },
      });
      expect(spectatorCreateMock).toHaveBeenCalledWith({
        data: { lobbyId: "target-lobby", userId: "spectator-user" },
      });
      expect(lobbyUpdateMock).toHaveBeenCalledOnce();
      expect(lobbyUpdateMock).toHaveBeenCalledWith({
        where: { id: "target-lobby" },
        data: { revision: { increment: 1 } },
      });
    }
  );

  it.each([
    ["not_found", null, 0],
    ["closed", targetLobby({ status: "CLOSED" }), 0],
    ["spectating_disabled", targetLobby({ allowSpectators: false }), 0],
    ["seated", targetLobby({ hostUserId: "spectator-user" }), 0],
    ["seated", targetLobby({ guest: { userId: "spectator-user" } }), 0],
    ["full", targetLobby(), MAX_LOBBY_SPECTATORS],
  ])(
    "returns %s without membership or revision mutation",
    async (kind, lobby, count) => {
      if (kind === "not_found") {
        queryRawMock.mockResolvedValueOnce([]);
      } else {
        lobbyFindUniqueMock.mockResolvedValueOnce(lobby);
      }
      spectatorCountMock.mockResolvedValueOnce(count);

      await expect(
        joinLobbyAsSpectator({
          userId: "spectator-user",
          lobbyId: "target-lobby",
        })
      ).resolves.toEqual({ kind });

      expect(spectatorCreateMock).not.toHaveBeenCalled();
      expect(userUpdateManyMock).not.toHaveBeenCalled();
      expect(lobbyUpdateMock).not.toHaveBeenCalled();
      expect(lobbyUpdateManyMock).not.toHaveBeenCalled();
    }
  );

  it("rejoins idempotently without counting, claiming, inserting, or bumping revision", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      targetLobby({ spectators: [{ userId: "spectator-user" }] })
    );

    await expect(
      joinLobbyAsSpectator({
        userId: "spectator-user",
        lobbyId: "target-lobby",
      })
    ).resolves.toMatchObject({ kind: "joined", membership: "existing" });

    expect(spectatorCountMock).not.toHaveBeenCalled();
    expect(userFindUniqueMock).not.toHaveBeenCalled();
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(spectatorCreateMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects an active player game before opening a transaction", async () => {
    gameFindFirstMock.mockResolvedValueOnce({ lobbyId: "active-game-lobby" });

    await expect(
      joinLobbyAsSpectator({
        userId: "spectator-user",
        lobbyId: "target-lobby",
      })
    ).resolves.toEqual({ kind: "active_game_exists" });

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns an active-lobby conflict when the user CAS claim loses", async () => {
    userUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    userFindUniqueMock
      .mockResolvedValueOnce({ activeLobbyId: null, activeLobby: null })
      .mockResolvedValueOnce({
        activeLobbyId: "other-lobby",
        activeLobby: {
          status: "READY",
          hostUserId: "other-host",
          guest: { userId: "spectator-user" },
          spectators: [],
        },
      });

    await expect(
      joinLobbyAsSpectator({
        userId: "spectator-user",
        lobbyId: "target-lobby",
      })
    ).resolves.toEqual({ kind: "active_lobby_exists" });

    expect(spectatorCreateMock).not.toHaveBeenCalled();
    expect(lobbyUpdateMock).not.toHaveBeenCalled();
  });

  it("switches from another spectator membership atomically", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "old-lobby",
      activeLobby: {
        id: "old-lobby",
        status: "IN_GAME",
        revision: 7,
        hostUserId: "old-host",
        host: { username: "Luffy", name: null },
        guest: {
          userId: "old-guest",
          user: { username: "Nami", name: null },
        },
        spectators: [{ userId: "spectator-user" }],
        invites: [],
      },
    });

    await expect(
      joinLobbyAsSpectator({
        userId: "spectator-user",
        lobbyId: "target-lobby",
      })
    ).resolves.toMatchObject({
      kind: "joined",
      previousLobbyId: "old-lobby",
      previousLobbyClosed: false,
    });

    expect(queryRawMock).toHaveBeenCalledTimes(2);
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "old-lobby",
        revision: 7,
        status: { not: "CLOSED" },
        spectators: { some: { userId: "spectator-user" } },
      },
      data: { revision: { increment: 1 } },
    });
    expect(spectatorDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "old-lobby", userId: "spectator-user" },
    });
    expect(userUpdateManyMock).toHaveBeenNthCalledWith(1, {
      where: { id: "spectator-user", activeLobbyId: "old-lobby" },
      data: { activeLobbyId: null },
    });
    expect(userUpdateManyMock).toHaveBeenNthCalledWith(2, {
      where: { id: "spectator-user", activeLobbyId: null },
      data: { activeLobbyId: "target-lobby" },
    });
  });

  it("switches from a guest seat and returns the old host to WAITING", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "old-lobby",
      activeLobby: {
        id: "old-lobby",
        status: "READY",
        revision: 3,
        hostUserId: "old-host",
        host: { username: "Zoro", name: null },
        guest: {
          userId: "spectator-user",
          user: { username: "Sanji", name: null },
        },
        spectators: [],
        invites: [],
      },
    });

    await expect(
      joinLobbyAsSpectator({
        userId: "spectator-user",
        lobbyId: "target-lobby",
      })
    ).resolves.toMatchObject({
      kind: "joined",
      previousLobbyId: "old-lobby",
    });

    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "old-lobby",
        status: "READY",
        mode: "PVP",
        guest: { is: { userId: "spectator-user" } },
      },
      data: {
        status: "WAITING",
        hostReady: false,
        revision: { increment: 1 },
      },
    });
    expect(guestDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "old-lobby", userId: "spectator-user" },
    });
  });

  it("requires confirmation before disbanding a hosted party", async () => {
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "old-lobby",
      activeLobby: {
        id: "old-lobby",
        status: "READY",
        revision: 5,
        hostUserId: "spectator-user",
        host: { username: "Luffy", name: null },
        guest: {
          userId: "old-guest",
          user: { username: "Nami", name: null },
        },
        spectators: [],
        invites: [],
      },
    });

    await expect(
      joinLobbyAsSpectator({
        userId: "spectator-user",
        lobbyId: "target-lobby",
      })
    ).resolves.toEqual({
      kind: "confirmation_required",
      currentLobbyId: "old-lobby",
      targetLobbyId: "target-lobby",
      guestName: "Nami",
      hasPendingInvite: false,
    });

    expect(spectatorFindManyMock).not.toHaveBeenCalled();
    expect(lobbyUpdateManyMock).not.toHaveBeenCalled();
    expect(spectatorCreateMock).not.toHaveBeenCalled();
  });

  it("captures hosted-lobby spectators before a confirmed close", async () => {
    let closed = false;
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "old-lobby",
      activeLobby: {
        id: "old-lobby",
        status: "READY",
        revision: 5,
        hostUserId: "spectator-user",
        host: { username: "Luffy", name: null },
        guest: {
          userId: "old-guest",
          user: { username: "Nami", name: null },
        },
        spectators: [],
        invites: [],
      },
    });
    spectatorFindManyMock.mockImplementationOnce(async () => {
      expect(closed).toBe(false);
      return [{ userId: "old-spectator" }];
    });
    lobbyUpdateManyMock.mockImplementationOnce(async () => {
      closed = true;
      return { count: 1 };
    });

    await expect(
      joinLobbyAsSpectator({
        userId: "spectator-user",
        lobbyId: "target-lobby",
        confirmDisbandLobbyId: "old-lobby",
      })
    ).resolves.toMatchObject({
      kind: "joined",
      previousLobbyId: "old-lobby",
      previousLobbyClosed: true,
      removedSpectatorUserIds: ["old-spectator"],
      disbandedGuest: { userId: "old-guest", lobbyId: "old-lobby" },
    });

    expect(spectatorFindManyMock.mock.invocationCallOrder[0]).toBeLessThan(
      lobbyUpdateManyMock.mock.invocationCallOrder[0]
    );
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { activeLobbyId: "old-lobby" },
      data: { activeLobbyId: null },
    });
  });

  it("serializes concurrent joins at count 19 so exactly one reaches the cap", async () => {
    const spectatorIds = new Set(
      Array.from({ length: 19 }, (_, index) => `existing-${index}`)
    );
    let revision = 12;
    let lockTail = Promise.resolve();

    transactionMock.mockImplementation(async (operation) => {
      let releaseLock: (() => void) | undefined;
      const tx = {
        $queryRaw: async () => {
          const previous = lockTail;
          lockTail = new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
          await previous;
          return [{ id: "target-lobby" }];
        },
        lobby: {
          findUnique: async (args: {
            select: { spectators: { where: { userId: string } } };
          }) => {
            const joiningUserId = args.select.spectators.where.userId;
            return targetLobby({
              spectators: spectatorIds.has(joiningUserId)
                ? [{ userId: joiningUserId }]
                : [],
            });
          },
          update: async () => {
            revision += 1;
            return { id: "target-lobby" };
          },
          updateMany: async () => ({ count: 1 }),
        },
        lobbySpectator: {
          count: async () => spectatorIds.size,
          create: async ({ data }: { data: { userId: string } }) => {
            spectatorIds.add(data.userId);
            return { id: data.userId };
          },
          findMany: async () => [],
          deleteMany: async () => ({ count: 1 }),
        },
        lobbyGuest: { deleteMany: async () => ({ count: 1 }) },
        user: {
          findUnique: async () => ({
            activeLobbyId: null,
            activeLobby: null,
          }),
          updateMany: async () => ({ count: 1 }),
        },
        lobbyInvite: {
          findMany: async () => [],
          updateMany: async () => ({ count: 1 }),
        },
      };

      try {
        return await operation(tx);
      } finally {
        releaseLock?.();
      }
    });

    const results = await Promise.all([
      joinLobbyAsSpectator({
        userId: "joiner-a",
        lobbyId: "target-lobby",
      }),
      joinLobbyAsSpectator({
        userId: "joiner-b",
        lobbyId: "target-lobby",
      }),
    ]);

    expect(results.map(({ kind }) => kind).sort()).toEqual(["full", "joined"]);
    expect(spectatorIds.size).toBe(MAX_LOBBY_SPECTATORS);
    expect(revision).toBe(13);
  });
});

describe("publishSpectatorJoin", () => {
  it("is a true no-op for idempotent rejoin", async () => {
    await publishSpectatorJoin(
      {
        kind: "joined",
        lobbyId: "target-lobby",
        membership: "existing",
        previousLobbyId: null,
        previousLobbyClosed: false,
        removedSpectatorUserIds: [],
        disbandedGuest: null,
        canceledInvites: [],
      },
      "spectator-user"
    );

    expect(buildLobbyRoomStateMock).not.toHaveBeenCalled();
    expect(notifyLobbyMock).not.toHaveBeenCalled();
    expect(notifySpectatorsRemovedMock).not.toHaveBeenCalled();
  });

  it("directs LOBBY_CLOSED to spectator IDs captured by a host switch", async () => {
    await publishSpectatorJoin(
      {
        kind: "joined",
        lobbyId: "target-lobby",
        membership: "created",
        previousLobbyId: "old-lobby",
        previousLobbyClosed: true,
        removedSpectatorUserIds: ["old-spectator"],
        disbandedGuest: null,
        canceledInvites: [],
      },
      "joining-host"
    );

    expect(notifySpectatorsRemovedMock).toHaveBeenCalledWith({
      lobbyId: "old-lobby",
      reason: "LOBBY_CLOSED",
      removedSpectatorUserIds: ["old-spectator"],
    });
  });
});
