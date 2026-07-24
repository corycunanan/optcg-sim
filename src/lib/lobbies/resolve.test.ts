import { beforeEach, describe, expect, it, vi } from "vitest";

const gameFindFirstMock = vi.fn();
const userFindUniqueMock = vi.fn();
const lobbyCreateMock = vi.fn();
const userUpdateManyMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findFirst: (...args: unknown[]) => gameFindFirstMock(...args),
    },
    user: { findUnique: (...args: unknown[]) => userFindUniqueMock(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const { resolveCanonicalLobby } = await import("./resolve");

const activeMembership = {
  activeLobbyId: "lobby-active",
  activeLobby: {
    id: "lobby-active",
    status: "WAITING",
    hostUserId: "user-1",
    guest: null,
  },
};

beforeEach(() => {
  gameFindFirstMock.mockReset();
  userFindUniqueMock.mockReset();
  lobbyCreateMock.mockReset();
  userUpdateManyMock.mockReset();
  transactionMock.mockReset();

  gameFindFirstMock.mockResolvedValue(null);
  userFindUniqueMock.mockResolvedValue(null);
  lobbyCreateMock.mockResolvedValue({ id: "lobby-created" });
  userUpdateManyMock.mockResolvedValue({ count: 1 });
  transactionMock.mockImplementation(async (operation) =>
    operation({
      lobby: { create: lobbyCreateMock },
      user: {
        updateMany: userUpdateManyMock,
        findUnique: userFindUniqueMock,
      },
    })
  );
});

describe("resolveCanonicalLobby", () => {
  it("resolves the latest active game before lobby membership", async () => {
    gameFindFirstMock.mockResolvedValue({ lobbyId: "lobby-in-game" });

    await expect(resolveCanonicalLobby("user-1")).resolves.toEqual({
      lobbyId: "lobby-in-game",
      branch: "active_game",
    });

    expect(userFindUniqueMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("uses a valid active-lobby membership without creating", async () => {
    userFindUniqueMock.mockResolvedValue(activeMembership);

    await expect(resolveCanonicalLobby("user-1")).resolves.toEqual({
      lobbyId: "lobby-active",
      branch: "membership",
    });

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("lazily creates and claims a personal lobby", async () => {
    await expect(resolveCanonicalLobby("user-1")).resolves.toEqual({
      lobbyId: "lobby-created",
      branch: "created",
    });

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
      data: { activeLobbyId: "lobby-created" },
    });
  });

  it("refetches the winner when another first visit wins the claim race", async () => {
    userFindUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeMembership)
      .mockResolvedValueOnce(activeMembership);
    userUpdateManyMock.mockResolvedValue({ count: 0 });

    await expect(resolveCanonicalLobby("user-1")).resolves.toEqual({
      lobbyId: "lobby-active",
      branch: "membership",
    });

    expect(lobbyCreateMock).toHaveBeenCalledTimes(1);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(userFindUniqueMock).toHaveBeenCalledTimes(3);
  });

  it("commits exactly one lobby across simultaneous first visits", async () => {
    let activeLobbyId: string | null = null;
    let lobbySequence = 0;
    const committedLobbyIds: string[] = [];
    const initialReadResolvers: Array<(value: null) => void> = [];

    userFindUniqueMock.mockImplementation(() => {
      if (initialReadResolvers.length < 2) {
        return new Promise<null>((resolve) => {
          initialReadResolvers.push(resolve);
          if (initialReadResolvers.length === 2) {
            for (const release of initialReadResolvers) release(null);
          }
        });
      }

      return Promise.resolve(
        activeLobbyId
          ? {
              activeLobbyId,
              activeLobby: {
                id: activeLobbyId,
                status: "WAITING",
                hostUserId: "user-1",
                guest: null,
              },
            }
          : null
      );
    });

    transactionMock.mockImplementation(async (operation) => {
      let createdLobbyId: string | null = null;
      const result = await operation({
        lobby: {
          create: async () => {
            createdLobbyId = `lobby-${++lobbySequence}`;
            return { id: createdLobbyId };
          },
        },
        user: {
          updateMany: async () => {
            if (activeLobbyId === null && createdLobbyId) {
              activeLobbyId = createdLobbyId;
              return { count: 1 };
            }
            return { count: 0 };
          },
          findUnique: async () => ({
            activeLobbyId,
            activeLobby: activeLobbyId
              ? {
                  status: "WAITING",
                  hostUserId: "user-1",
                  guest: null,
                }
              : null,
          }),
        },
      });

      if (createdLobbyId) committedLobbyIds.push(createdLobbyId);
      return result;
    });

    const resolutions = await Promise.all([
      resolveCanonicalLobby("user-1"),
      resolveCanonicalLobby("user-1"),
    ]);

    expect(resolutions).toEqual([
      { lobbyId: activeLobbyId, branch: "created" },
      { lobbyId: activeLobbyId, branch: "membership" },
    ]);
    expect(committedLobbyIds).toEqual([activeLobbyId]);
    expect(lobbySequence).toBe(2);
  });
});
