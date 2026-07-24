import { beforeEach, describe, expect, it, vi } from "vitest";

const lobbyFindUniqueMock = vi.fn();
const cardFindManyMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    lobby: {
      findUnique: (...args: unknown[]) => lobbyFindUniqueMock(...args),
    },
    card: {
      findMany: (...args: unknown[]) => cardFindManyMock(...args),
    },
  },
}));

const { buildLobbyRoomState } = await import("./build-state");

beforeEach(() => {
  lobbyFindUniqueMock.mockReset();
  cardFindManyMock.mockReset();
  cardFindManyMock.mockResolvedValue([]);
});

describe("buildLobbyRoomState pending invite", () => {
  it("serializes the live invited seat from its server expiry", async () => {
    lobbyFindUniqueMock.mockResolvedValue({
      id: "lobby-1",
      revision: 7,
      status: "WAITING",
      joinCode: "ABCD",
      format: "Standard",
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      hostReady: false,
      hostUserId: "host-1",
      host: { username: "luffy", name: null, image: null },
      hostDeck: null,
      guest: null,
      invites: [
        {
          id: "invite-1",
          expiresAt: new Date("2026-07-24T20:05:00.000Z"),
          toUser: {
            id: "friend-1",
            username: "nami",
            name: "Nami",
            image: null,
          },
        },
      ],
      gameSessions: [],
    });

    await expect(
      buildLobbyRoomState("lobby-1", "host-1")
    ).resolves.toMatchObject({
      version: 7,
      pendingInvite: {
        id: "invite-1",
        expiresAt: "2026-07-24T20:05:00.000Z",
        user: { id: "friend-1", username: "nami" },
      },
    });

    expect(lobbyFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          invites: expect.objectContaining({
            where: {
              status: "PENDING",
              expiresAt: { gt: expect.any(Date) },
            },
            take: 1,
          }),
        }),
      })
    );
  });

  it("omits pending invite identity for a non-host viewer", async () => {
    lobbyFindUniqueMock.mockResolvedValue({
      id: "lobby-1",
      revision: 7,
      status: "WAITING",
      joinCode: "ABCD",
      format: "Standard",
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      hostReady: false,
      hostUserId: "host-1",
      host: { username: "luffy", name: null, image: null },
      hostDeck: null,
      guest: null,
      invites: [
        {
          id: "invite-secret",
          expiresAt: new Date("2026-07-24T20:05:00.000Z"),
          toUser: {
            id: "friend-secret",
            username: "nami",
            name: "Nami",
            image: "https://example.com/private.png",
          },
        },
      ],
      gameSessions: [],
    });

    const state = await buildLobbyRoomState("lobby-1", "other-user");

    expect(state?.pendingInvite).toBeNull();
    expect(JSON.stringify(state)).not.toContain("invite-secret");
    expect(JSON.stringify(state)).not.toContain("friend-secret");
    expect(JSON.stringify(state)).not.toContain("private.png");
  });

  it("returns an open seat when no unexpired invite is selected", async () => {
    lobbyFindUniqueMock.mockResolvedValue({
      id: "lobby-1",
      revision: 8,
      status: "WAITING",
      joinCode: "ABCD",
      format: "Standard",
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      hostReady: false,
      hostUserId: "host-1",
      host: { username: "luffy", name: null, image: null },
      hostDeck: null,
      guest: null,
      invites: [],
      gameSessions: [],
    });

    await expect(buildLobbyRoomState("lobby-1")).resolves.toMatchObject({
      pendingInvite: null,
    });
  });
});
