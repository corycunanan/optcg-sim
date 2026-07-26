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

const { buildLobbyRoomState } = await import("@/lib/lobbies/build-state");
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
    invites: [
      {
        id: "invite-secret",
        expiresAt: new Date("2026-07-25T12:00:00.000Z"),
        toUser: {
          id: "invitee-secret",
          username: "nami",
          name: "Nami",
          image: "/private-invitee.png",
        },
      },
    ],
    gameSessions: [],
  };
}

describe("notifyLobby production database cost", () => {
  it.each([
    [0, 2, 3],
    [1, 3, 3],
    [20, 22, 3],
  ])(
    "runs %i-spectator fanout to %i recipients with %i database queries",
    async (spectatorCount, expectedRecipients, expectedQueries) => {
      lobbyFindUniqueMock.mockResolvedValue(databaseLobby(spectatorCount));
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 202 }));

      await notifyLobby(wireLobby(spectatorCount), {
        deps: { ...baseDeps, fetch: fetchMock },
      });

      expect(lobbyFindUniqueMock).toHaveBeenCalledTimes(1);
      expect(cardFindManyMock).toHaveBeenCalledTimes(1);
      expect(deckFindManyMock).toHaveBeenCalledTimes(1);
      expect(
        lobbyFindUniqueMock.mock.calls.length +
          cardFindManyMock.mock.calls.length +
          deckFindManyMock.mock.calls.length
      ).toBe(expectedQueries);
      expect(fetchMock).toHaveBeenCalledTimes(expectedRecipients);
    }
  );

  it.each([
    [0, 2, 6],
    [1, 3, 6],
    [20, 22, 6],
  ])(
    "runs route-style build plus %i-spectator fanout to %i recipients with %i database queries",
    async (spectatorCount, expectedRecipients, expectedQueries) => {
      lobbyFindUniqueMock.mockResolvedValue(databaseLobby(spectatorCount));
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 202 }));

      const state = await buildLobbyRoomState("lobby-cost");
      expect(state).not.toBeNull();
      await notifyLobby(state!, {
        deps: { ...baseDeps, fetch: fetchMock },
      });

      expect(lobbyFindUniqueMock).toHaveBeenCalledTimes(2);
      expect(cardFindManyMock).toHaveBeenCalledTimes(2);
      expect(deckFindManyMock).toHaveBeenCalledTimes(2);
      expect(
        lobbyFindUniqueMock.mock.calls.length +
          cardFindManyMock.mock.calls.length +
          deckFindManyMock.mock.calls.length
      ).toBe(expectedQueries);
      expect(fetchMock).toHaveBeenCalledTimes(expectedRecipients);
    }
  );

  async function fanoutPayloads(spectatorCount = 1) {
    lobbyFindUniqueMock.mockResolvedValue(databaseLobby(spectatorCount));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));

    await notifyLobby(wireLobby(spectatorCount), {
      deps: { ...baseDeps, fetch: fetchMock },
    });

    return new Map(
      fetchMock.mock.calls.map(([url, init]) => [
        new URL(url).pathname.split("/")[2],
        JSON.parse(init.body).lobby as LobbyRoomState,
      ])
    );
  }

  it("keeps every recipient's viewer role isolated", async () => {
    const payloads = await fanoutPayloads();

    expect(payloads.get("host-user")?.viewerRole).toBe("host");
    expect(payloads.get("guest-user")?.viewerRole).toBe("guest");
    expect(payloads.get("spectator-0")?.viewerRole).toBe("spectator");
  });

  it("keeps pending invite identity host-only", async () => {
    const payloads = await fanoutPayloads();

    expect(payloads.get("host-user")?.pendingInvite).toMatchObject({
      id: "invite-secret",
      user: { id: "invitee-secret" },
    });
    for (const userId of ["guest-user", "spectator-0"]) {
      const payload = payloads.get(userId);
      expect(payload?.pendingInvite).toBeNull();
      expect(JSON.stringify(payload)).not.toContain("invite-secret");
      expect(JSON.stringify(payload)).not.toContain("invitee-secret");
      expect(JSON.stringify(payload)).not.toContain("private-invitee.png");
    }
  });

  it("delivers grouped cards to both participants and omits contents for spectators", async () => {
    deckFindManyMock.mockResolvedValue([
      {
        id: "host-deck",
        cards: [
          {
            cardId: "OP01-024",
            quantity: 4,
            selectedArtUrl: "/known-alt.png",
            card: {
              name: "Known Character",
              type: "Character",
              imageUrl: "/known-base.png",
            },
          },
        ],
      },
      { id: "guest-deck", cards: [] },
    ]);
    const payloads = await fanoutPayloads();
    const knownContents = {
      characters: [
        {
          id: "OP01-024",
          name: "Known Character",
          quantity: 4,
          imageUrl: "/known-alt.png",
        },
      ],
      events: [],
      stages: [],
    };

    for (const userId of ["host-user", "guest-user"]) {
      expect(payloads.get(userId)?.hostDeck?.contents).toEqual(knownContents);
      expect(payloads.get(userId)?.guest?.deck?.contents).toEqual({
        characters: [],
        events: [],
        stages: [],
      });
    }
    expect(payloads.get("spectator-0")?.hostDeck?.contents).toBeUndefined();
    expect(payloads.get("spectator-0")?.guest?.deck?.contents).toBeUndefined();
  });

  it("keeps the spectator projection byte-identical to the pre-refactor snapshot", async () => {
    const payloads = await fanoutPayloads();
    const preRefactorSpectatorSnapshot: LobbyRoomState = {
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
      spectators: spectatorUsers(1),
      spectatorCount: 1,
      viewerRole: "spectator",
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
      pendingInvite: null,
      gameId: null,
    };

    expect(JSON.stringify(payloads.get("spectator-0"))).toBe(
      JSON.stringify(preRefactorSpectatorSnapshot)
    );
  });

  it("gives every recipient one revision when a mutation races the shared read", async () => {
    let releaseRead!: (lobby: ReturnType<typeof databaseLobby>) => void;
    lobbyFindUniqueMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRead = resolve;
        })
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));

    const pendingFanout = notifyLobby(wireLobby(1), {
      deps: { ...baseDeps, fetch: fetchMock },
    });
    await vi.waitFor(() =>
      expect(lobbyFindUniqueMock).toHaveBeenCalledTimes(1)
    );
    let databaseRevision = 41;
    const capturedRead = { ...databaseLobby(1), revision: databaseRevision };
    releaseRead(capturedRead);
    databaseRevision = 42;
    await pendingFanout;

    expect(databaseRevision).toBe(42);
    expect(
      fetchMock.mock.calls.map(
        ([, init]) => JSON.parse(init.body).lobby.version
      )
    ).toEqual([41, 41, 41]);
    expect(lobbyFindUniqueMock).toHaveBeenCalledTimes(1);
  });
});
