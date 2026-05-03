import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();
const updateManyMock = vi.fn();
const notifyUserMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    lobbyInvite: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      updateMany: (...args: unknown[]) => updateManyMock(...args),
    },
  },
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));

const { cancelPendingLobbyInvites } = await import("./cancel-invites");

beforeEach(() => {
  findManyMock.mockReset();
  updateManyMock.mockReset();
  notifyUserMock.mockReset();
  notifyUserMock.mockResolvedValue(undefined);
});

describe("cancelPendingLobbyInvites", () => {
  it("flips each PENDING row individually and fans out only on actual transition", async () => {
    findManyMock.mockResolvedValue([
      { id: "invite-A", toUserId: "user-A" },
      { id: "invite-B", toUserId: "user-B" },
    ]);
    updateManyMock.mockResolvedValue({ count: 1 });

    await cancelPendingLobbyInvites("lobby-1");

    // Per-row conditional update with `status: PENDING` guard.
    expect(updateManyMock).toHaveBeenCalledTimes(2);
    expect(updateManyMock.mock.calls).toEqual(
      expect.arrayContaining([
        [
          {
            where: { id: "invite-A", status: "PENDING" },
            data: { status: "CANCELED" },
          },
        ],
        [
          {
            where: { id: "invite-B", status: "PENDING" },
            data: { status: "CANCELED" },
          },
        ],
      ]),
    );

    expect(notifyUserMock).toHaveBeenCalledTimes(2);
    expect(notifyUserMock.mock.calls).toEqual(
      expect.arrayContaining([
        ["user-A", { type: "lobby:invite_canceled", inviteId: "invite-A" }],
        ["user-B", { type: "lobby:invite_canceled", inviteId: "invite-B" }],
      ]),
    );
  });

  it("does NOT fan a phantom cancel when the row already transitioned (CodeRabbit P2)", async () => {
    // A row that flipped to ACCEPTED/DECLINED/EXPIRED between findMany and
    // updateMany is already authoritatively resolved. The per-row conditional
    // update returns count: 0 for that row and we skip the notify.
    findManyMock.mockResolvedValue([
      { id: "invite-A", toUserId: "user-A" }, // still PENDING — gets notify
      { id: "invite-B", toUserId: "user-B" }, // raced to ACCEPTED — silenced
    ]);
    updateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await cancelPendingLobbyInvites("lobby-1");

    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith("user-A", {
      type: "lobby:invite_canceled",
      inviteId: "invite-A",
    });
  });

  it("is a no-op when there are no PENDING invites", async () => {
    findManyMock.mockResolvedValue([]);

    await cancelPendingLobbyInvites("lobby-1");

    expect(updateManyMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});
