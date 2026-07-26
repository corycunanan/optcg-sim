import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  ActiveLobbyConflictError,
  claimActiveLobby,
  releaseActiveLobbyMembers,
} from "./active-membership";

function transactionClient(user: {
  updateMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
}) {
  return { user } as unknown as Prisma.TransactionClient;
}

describe("claimActiveLobby", () => {
  it("clears a closed-lobby pointer and retries the claim once", async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const findUnique = vi.fn().mockResolvedValue({
      activeLobbyId: "closed-lobby",
      activeLobby: {
        status: "CLOSED",
        hostUserId: "user-1",
        guest: null,
        spectators: [],
      },
    });

    await expect(
      claimActiveLobby(
        transactionClient({ updateMany, findUnique }),
        "user-1",
        "new-lobby"
      )
    ).resolves.toBeUndefined();

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "user-1", activeLobbyId: null },
      data: { activeLobbyId: "new-lobby" },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "user-1", activeLobbyId: "closed-lobby" },
      data: { activeLobbyId: null },
    });
    expect(updateMany).toHaveBeenNthCalledWith(3, {
      where: { id: "user-1", activeLobbyId: null },
      data: { activeLobbyId: "new-lobby" },
    });
  });

  it("clears a pointer when the user no longer belongs to that lobby", async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const findUnique = vi.fn().mockResolvedValue({
      activeLobbyId: "unrelated-lobby",
      activeLobby: {
        status: "WAITING",
        hostUserId: "another-user",
        guest: { userId: "someone-else" },
        spectators: [],
      },
    });

    await expect(
      claimActiveLobby(
        transactionClient({ updateMany, findUnique }),
        "user-1",
        "new-lobby"
      )
    ).resolves.toBeUndefined();
  });

  it("preserves a genuine live membership and reports a conflict", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUnique = vi.fn().mockResolvedValue({
      activeLobbyId: "live-lobby",
      activeLobby: {
        status: "IN_GAME",
        hostUserId: "user-1",
        guest: { userId: "guest-user" },
        spectators: [],
      },
    });

    await expect(
      claimActiveLobby(
        transactionClient({ updateMany, findUnique }),
        "user-1",
        "new-lobby"
      )
    ).rejects.toBeInstanceOf(ActiveLobbyConflictError);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("preserves a genuine spectator membership and reports a conflict", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUnique = vi.fn().mockResolvedValue({
      activeLobbyId: "spectated-lobby",
      activeLobby: {
        status: "IN_GAME",
        hostUserId: "host-user",
        guest: { userId: "guest-user" },
        spectators: [{ userId: "user-1" }],
      },
    });

    await expect(
      claimActiveLobby(
        transactionClient({ updateMany, findUnique }),
        "user-1",
        "player-lobby"
      )
    ).rejects.toBeInstanceOf(ActiveLobbyConflictError);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["spectated-lobby", "player-lobby"],
    ["player-lobby", "spectated-lobby"],
  ])(
    "lets %s beat a simultaneous %s claim",
    async (winningLobbyId, losingLobbyId) => {
      let activeLobbyId: string | null = null;
      const updateMany = vi.fn(
        async ({
          where,
          data,
        }: {
          where: { activeLobbyId: string | null };
          data: { activeLobbyId: string | null };
        }) => {
          if (activeLobbyId !== where.activeLobbyId) return { count: 0 };
          activeLobbyId = data.activeLobbyId;
          return { count: 1 };
        }
      );
      const findUnique = vi.fn(async () => ({
        activeLobbyId,
        activeLobby:
          activeLobbyId === "spectated-lobby"
            ? {
                status: "IN_GAME",
                hostUserId: "host-user",
                guest: { userId: "guest-user" },
                spectators: [{ userId: "user-1" }],
              }
            : {
                status: "WAITING",
                hostUserId: "user-1",
                guest: null,
                spectators: [],
              },
      }));
      const tx = transactionClient({ updateMany, findUnique });

      const [winner, loser] = await Promise.allSettled([
        claimActiveLobby(tx, "user-1", winningLobbyId),
        claimActiveLobby(tx, "user-1", losingLobbyId),
      ]);

      expect(winner.status).toBe("fulfilled");
      expect(loser).toMatchObject({
        status: "rejected",
        reason: expect.any(ActiveLobbyConflictError),
      });
      expect(activeLobbyId).toBe(winningLobbyId);
    }
  );
});

describe("releaseActiveLobbyMembers", () => {
  it("locks and releases multiple users in ascending user-id order", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "user-z" },
      { id: "user-a" },
      { id: "user-m" },
    ]);
    const released: string[] = [];
    const updateMany = vi.fn(async ({ where }: { where: { id: string } }) => {
      released.push(where.id);
      return { count: 1 };
    });
    const tx = {
      user: { findMany, updateMany },
    } as unknown as Prisma.TransactionClient;

    await expect(releaseActiveLobbyMembers(tx, "lobby-1")).resolves.toEqual([
      "user-a",
      "user-m",
      "user-z",
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { activeLobbyId: "lobby-1" },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    expect(released).toEqual(["user-a", "user-m", "user-z"]);
  });
});
