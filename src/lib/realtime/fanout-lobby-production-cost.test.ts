import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LobbyRoomState } from "@/lib/lobbies/state";

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

const { notifyLobby } = await import("./fanout-lobby");

const baseDeps = {
  workerUrl: "https://worker.example",
  workerSecret: "secret-123",
};

beforeEach(() => {
  lobbyFindUniqueMock.mockReset();
  cardFindManyMock.mockReset();
  deckFindManyMock.mockReset();
  cardFindManyMock.mockResolvedValue([
    { id: "OP01-001", name: "Leader A", imageUrl: "/leader-a.png" },
    { id: "OP01-002", name: "Leader B", imageUrl: "/leader-b.png" },
  ]);
  deckFindManyMock.mockResolvedValue([
    { id: "host-deck", cards: [] },
    { id: "guest-deck", cards: [] },
  ]);
});

function spectatorUsers(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `spectator-${index}`,
    username: null,
    name: null,
    image: null,
  }));
}

function wireLobby(spectatorCount: number): LobbyRoomState {
  return {
    id: "lobby-cost",
    version: 1,
    status: "READY",
    joinCode: "COST",
    format: "Standard",
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    hostReady: true,
    hostUserId: "host-user",
    host: { username: "host", name: null, image: null },
    hostDeck: {
      id: "host-deck",
      name: "Host Deck",
      leaderId: "OP01-001",
      leaderName: "Leader A",
      leaderImageUrl: "/leader-a.png",
    },
    allowSpectators: true,
    spectators: spectatorUsers(spectatorCount),
    spectatorCount,
    viewerRole: null,
    guest: {
      guestReady: true,
      user: {
        id: "guest-user",
        username: "guest",
        name: null,
        image: null,
      },
      deck: {
        id: "guest-deck",
        name: "Guest Deck",
        leaderId: "OP01-002",
        leaderName: "Leader B",
        leaderImageUrl: "/leader-b.png",
      },
    },
    gameId: null,
  };
}

function databaseLobby(spectatorCount: number) {
  return {
    id: "lobby-cost",
    revision: 1,
    status: "READY",
    joinCode: "COST",
    format: "Standard",
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    hostReady: true,
    hostUserId: "host-user",
    allowSpectators: true,
    host: { username: "host", name: null, image: null },
    hostDeck: {
      id: "host-deck",
      name: "Host Deck",
      leaderId: "OP01-001",
      leaderArtUrl: null,
    },
    guest: {
      guestReady: true,
      user: {
        id: "guest-user",
        username: "guest",
        name: null,
        image: null,
      },
      deck: {
        id: "guest-deck",
        name: "Guest Deck",
        leaderId: "OP01-002",
        leaderArtUrl: null,
      },
    },
    spectators: spectatorUsers(spectatorCount).map((user) => ({ user })),
    invites: [],
    gameSessions: [],
  };
}

describe("notifyLobby production database cost", () => {
  it.each([
    [0, 2, 6],
    [1, 3, 8],
    [20, 22, 46],
  ])(
    "runs %i-spectator fanout through %i builders and %i database queries",
    async (spectatorCount, expectedBuilders, expectedQueries) => {
      lobbyFindUniqueMock.mockResolvedValue(databaseLobby(spectatorCount));
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 202 }));

      await notifyLobby(wireLobby(spectatorCount), {
        deps: { ...baseDeps, fetch: fetchMock },
      });

      expect(lobbyFindUniqueMock).toHaveBeenCalledTimes(expectedBuilders);
      expect(cardFindManyMock).toHaveBeenCalledTimes(expectedBuilders);
      expect(deckFindManyMock).toHaveBeenCalledTimes(2);
      expect(
        lobbyFindUniqueMock.mock.calls.length +
          cardFindManyMock.mock.calls.length +
          deckFindManyMock.mock.calls.length
      ).toBe(expectedQueries);
      expect(fetchMock).toHaveBeenCalledTimes(expectedBuilders);
    }
  );
});
