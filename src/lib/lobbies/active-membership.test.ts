import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  ActiveLobbyConflictError,
  claimActiveLobby,
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
      },
    });

    await expect(
      claimActiveLobby(
        transactionClient({ updateMany, findUnique }),
        "user-1",
        "new-lobby",
      ),
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
      },
    });

    await expect(
      claimActiveLobby(
        transactionClient({ updateMany, findUnique }),
        "user-1",
        "new-lobby",
      ),
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
      },
    });

    await expect(
      claimActiveLobby(
        transactionClient({ updateMany, findUnique }),
        "user-1",
        "new-lobby",
      ),
    ).rejects.toBeInstanceOf(ActiveLobbyConflictError);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
