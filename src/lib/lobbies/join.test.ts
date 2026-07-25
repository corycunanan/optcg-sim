import { beforeEach, describe, expect, it, vi } from "vitest";

const gameFindFirstMock = vi.fn();
const lobbyFindFirstMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyGuestCreateMock = vi.fn();
const lobbyGuestDeleteManyMock = vi.fn();
const lobbySpectatorDeleteManyMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userUpdateManyMock = vi.fn();
const inviteFindManyMock = vi.fn();
const inviteUpdateManyMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findFirst: (...args: unknown[]) => gameFindFirstMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("./build-state", () => ({ buildLobbyRoomState: vi.fn() }));
vi.mock("@/lib/realtime/fanout-lobby", () => ({ notifyLobby: vi.fn() }));
vi.mock("@/lib/realtime/fan-out", () => ({ notifyUser: vi.fn() }));

const { joinLobbyByCode } = await import("./join");

beforeEach(() => {
  for (const mock of [
    gameFindFirstMock,
    lobbyFindFirstMock,
    lobbyUpdateManyMock,
    lobbyGuestCreateMock,
    lobbyGuestDeleteManyMock,
    lobbySpectatorDeleteManyMock,
    userFindUniqueMock,
    userUpdateManyMock,
    inviteFindManyMock,
    inviteUpdateManyMock,
    transactionMock,
  ]) {
    mock.mockReset();
  }

  gameFindFirstMock.mockResolvedValue(null);
  lobbyFindFirstMock.mockResolvedValue({
    id: "player-lobby",
    joinCode: "ABC123",
    status: "WAITING",
    hostUserId: "target-host",
    mode: "PVP",
    guest: null,
  });
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyGuestCreateMock.mockResolvedValue(undefined);
  lobbyGuestDeleteManyMock.mockResolvedValue({ count: 1 });
  lobbySpectatorDeleteManyMock.mockResolvedValue({ count: 1 });
  userFindUniqueMock.mockResolvedValue({
    activeLobbyId: "spectated-lobby",
    activeLobby: {
      id: "spectated-lobby",
      status: "IN_GAME",
      revision: 7,
      hostUserId: "host-user",
      host: { username: "Luffy", name: null },
      guest: {
        userId: "guest-user",
        user: { username: "Nami", name: null },
      },
      spectators: [{ userId: "user-1" }],
      invites: [],
    },
  });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  inviteFindManyMock.mockResolvedValue([]);
  inviteUpdateManyMock.mockResolvedValue({ count: 1 });
  transactionMock.mockImplementation(async (operation) =>
    operation({
      lobby: {
        findFirst: lobbyFindFirstMock,
        updateMany: lobbyUpdateManyMock,
      },
      lobbyGuest: {
        create: lobbyGuestCreateMock,
        deleteMany: lobbyGuestDeleteManyMock,
      },
      lobbySpectator: { deleteMany: lobbySpectatorDeleteManyMock },
      user: {
        findUnique: userFindUniqueMock,
        updateMany: userUpdateManyMock,
      },
      lobbyInvite: {
        findMany: inviteFindManyMock,
        updateMany: inviteUpdateManyMock,
      },
    })
  );
});

describe("joinLobbyByCode", () => {
  it("atomically switches a spectator into a player membership", async () => {
    await expect(
      joinLobbyByCode({ userId: "user-1", code: "ABC123" })
    ).resolves.toMatchObject({
      kind: "joined",
      lobbyId: "player-lobby",
      previousLobbyId: "spectated-lobby",
      previousLobbyClosed: false,
      membership: "created",
    });

    expect(lobbyUpdateManyMock).toHaveBeenNthCalledWith(1, {
      where: {
        id: "spectated-lobby",
        revision: 7,
        status: { not: "CLOSED" },
        spectators: { some: { userId: "user-1" } },
      },
      data: { revision: { increment: 1 } },
    });
    expect(lobbySpectatorDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "spectated-lobby", userId: "user-1" },
    });
    expect(userUpdateManyMock).toHaveBeenNthCalledWith(1, {
      where: {
        id: "user-1",
        activeLobbyId: "spectated-lobby",
      },
      data: { activeLobbyId: null },
    });
    expect(userUpdateManyMock).toHaveBeenNthCalledWith(2, {
      where: { id: "user-1", activeLobbyId: null },
      data: { activeLobbyId: "player-lobby" },
    });
    expect(lobbyGuestCreateMock).toHaveBeenCalledWith({
      data: {
        lobbyId: "player-lobby",
        userId: "user-1",
        deckId: undefined,
      },
    });
  });

  it("changes roles in one lobby with one revision increment", async () => {
    lobbyFindFirstMock.mockResolvedValue({
      id: "spectated-lobby",
      joinCode: "ABC123",
      status: "WAITING",
      hostUserId: "host-user",
      mode: "PVP",
      guest: null,
    });
    userFindUniqueMock.mockResolvedValue({
      activeLobbyId: "spectated-lobby",
      activeLobby: {
        id: "spectated-lobby",
        status: "WAITING",
        revision: 7,
        hostUserId: "host-user",
        host: { username: "Luffy", name: null },
        guest: null,
        spectators: [{ userId: "user-1" }],
        invites: [],
      },
    });

    await expect(
      joinLobbyByCode({ userId: "user-1", code: "ABC123" })
    ).resolves.toMatchObject({
      kind: "joined",
      lobbyId: "spectated-lobby",
      previousLobbyId: null,
      membership: "created",
    });

    expect(lobbyUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "spectated-lobby",
        status: "WAITING",
        mode: "PVP",
        guest: { is: null },
      },
      data: { status: "READY", revision: { increment: 1 } },
    });
    expect(lobbySpectatorDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "spectated-lobby", userId: "user-1" },
    });
  });

  it("rolls back spectator release when the target seat race is lost", async () => {
    type HarnessState = {
      activeLobbyId: string | null;
      spectatorPresent: boolean;
      spectatedLobbyRevision: number;
    };

    let state: HarnessState = {
      activeLobbyId: "spectated-lobby",
      spectatorPresent: true,
      spectatedLobbyRevision: 7,
    };
    const initialState = structuredClone(state);
    let discardedState: HarnessState | null = null;

    transactionMock.mockImplementationOnce(async (operation) => {
      const draft = structuredClone(state);
      const tx = {
        lobby: {
          findFirst: async () => ({
            id: "player-lobby",
            joinCode: "ABC123",
            status: "WAITING",
            hostUserId: "target-host",
            mode: "PVP",
            guest: null,
          }),
          updateMany: async (args: { where: { id: string } }) => {
            if (args.where.id === "spectated-lobby") {
              draft.spectatedLobbyRevision += 1;
              return { count: 1 };
            }
            return { count: 0 };
          },
        },
        lobbyGuest: {
          create: async () => undefined,
          deleteMany: async () => ({ count: 1 }),
        },
        lobbySpectator: {
          deleteMany: async () => {
            draft.spectatorPresent = false;
            return { count: 1 };
          },
        },
        user: {
          findUnique: async () => ({
            activeLobbyId: draft.activeLobbyId,
            activeLobby: {
              id: "spectated-lobby",
              status: "IN_GAME",
              revision: draft.spectatedLobbyRevision,
              hostUserId: "host-user",
              host: { username: "Luffy", name: null },
              guest: {
                userId: "guest-user",
                user: { username: "Nami", name: null },
              },
              spectators: draft.spectatorPresent ? [{ userId: "user-1" }] : [],
              invites: [],
            },
          }),
          updateMany: async (args: {
            data: { activeLobbyId: string | null };
          }) => {
            draft.activeLobbyId = args.data.activeLobbyId;
            return { count: 1 };
          },
        },
        lobbyInvite: {
          findMany: async () => [],
          updateMany: async () => ({ count: 1 }),
        },
      };

      try {
        const result = await operation(tx);
        state = draft;
        return result;
      } catch (error) {
        discardedState = draft;
        throw error;
      }
    });

    await expect(
      joinLobbyByCode({ userId: "user-1", code: "ABC123" })
    ).resolves.toEqual({ kind: "occupied" });
    expect(discardedState).toEqual({
      activeLobbyId: null,
      spectatorPresent: false,
      spectatedLobbyRevision: 8,
    });
    expect(state).toEqual(initialState);
  });
});
