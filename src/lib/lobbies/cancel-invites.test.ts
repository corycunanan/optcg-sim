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
  it("cancels every PENDING invite and fans out lobby:invite_canceled to each recipient", async () => {
    findManyMock.mockResolvedValue([
      { id: "invite-A", toUserId: "user-A" },
      { id: "invite-B", toUserId: "user-B" },
    ]);
    updateManyMock.mockResolvedValue({ count: 2 });

    await cancelPendingLobbyInvites("lobby-1");

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1", status: "PENDING" },
      data: { status: "CANCELED" },
    });

    expect(notifyUserMock).toHaveBeenCalledTimes(2);
    expect(notifyUserMock.mock.calls).toEqual(
      expect.arrayContaining([
        ["user-A", { type: "lobby:invite_canceled", inviteId: "invite-A" }],
        ["user-B", { type: "lobby:invite_canceled", inviteId: "invite-B" }],
      ]),
    );
  });

  it("is a no-op when there are no PENDING invites", async () => {
    findManyMock.mockResolvedValue([]);

    await cancelPendingLobbyInvites("lobby-1");

    expect(updateManyMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});
