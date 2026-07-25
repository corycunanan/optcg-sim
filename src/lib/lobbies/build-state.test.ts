import { beforeEach, describe, expect, it, vi } from "vitest";

const lobbyFindUniqueMock = vi.fn();
const cardFindManyMock = vi.fn();
const deckFindManyMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    lobby: {
      findUnique: (...args: unknown[]) => lobbyFindUniqueMock(...args),
    },
    card: {
      findMany: (...args: unknown[]) => cardFindManyMock(...args),
    },
    deck: {
      findMany: (...args: unknown[]) => deckFindManyMock(...args),
    },
  },
}));

const { buildLobbyRoomState } = await import("./build-state");

beforeEach(() => {
  lobbyFindUniqueMock.mockReset();
  cardFindManyMock.mockReset();
  deckFindManyMock.mockReset();
  cardFindManyMock.mockResolvedValue([]);
  deckFindManyMock.mockResolvedValue([]);
});

describe("buildLobbyRoomState participant deck contents", () => {
  const lobbyWithDecks = {
    id: "lobby-1",
    revision: 9,
    status: "READY",
    joinCode: "ABCD",
    format: "Standard",
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    hostReady: true,
    hostUserId: "host-1",
    host: { username: "luffy", name: null, image: null },
    hostDeck: {
      id: "host-deck",
      name: "Straw Hats",
      leaderId: "OP01-001",
      leaderArtUrl: null,
    },
    guest: {
      guestReady: true,
      user: {
        id: "guest-1",
        username: "zoro",
        name: null,
        image: null,
      },
      deck: {
        id: "guest-deck",
        name: "Three Sword Style",
        leaderId: "OP01-025",
        leaderArtUrl: null,
      },
    },
    invites: [],
    gameSessions: [],
  };

  it.each(["host-1", "guest-1"])(
    "includes both grouped deck lists for participant %s",
    async (viewerUserId) => {
      lobbyFindUniqueMock.mockResolvedValue(lobbyWithDecks);
      deckFindManyMock.mockResolvedValue([
        {
          id: "host-deck",
          cards: [
            {
              cardId: "OP01-024",
              quantity: 4,
              selectedArtUrl: "https://images.example/alt.png",
              card: {
                name: "Monkey.D.Luffy",
                type: "Character",
                imageUrl: "https://images.example/base.png",
              },
            },
            {
              cardId: "OP01-029",
              quantity: 2,
              selectedArtUrl: null,
              card: {
                name: "Radical Beam!!",
                type: "Event",
                imageUrl: "https://images.example/event.png",
              },
            },
          ],
        },
        { id: "guest-deck", cards: [] },
      ]);

      const state = await buildLobbyRoomState("lobby-1", viewerUserId);

      expect(state?.hostDeck?.contents).toEqual({
        characters: [
          {
            id: "OP01-024",
            name: "Monkey.D.Luffy",
            quantity: 4,
            imageUrl: "https://images.example/alt.png",
          },
        ],
        events: [
          {
            id: "OP01-029",
            name: "Radical Beam!!",
            quantity: 2,
            imageUrl: "https://images.example/event.png",
          },
        ],
        stages: [],
      });
      expect(state?.guest?.deck?.contents).toEqual({
        characters: [],
        events: [],
        stages: [],
      });
    }
  );

  it("omits all deck contents for a non-participant viewer", async () => {
    lobbyFindUniqueMock.mockResolvedValue(lobbyWithDecks);

    const state = await buildLobbyRoomState("lobby-1", "stranger-1");

    expect(state?.hostDeck?.contents).toBeUndefined();
    expect(state?.guest?.deck?.contents).toBeUndefined();
    expect(deckFindManyMock).not.toHaveBeenCalled();
  });
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
