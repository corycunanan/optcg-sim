import { describe, expect, it, vi } from "vitest";
import { notifyLobby, notifySpectatorRemoved } from "./fanout-lobby";
import type { LobbyRoomState } from "@/lib/lobbies/state";

const baseDeps = {
  workerUrl: "https://worker.example",
  workerSecret: "secret-123",
};

function lobbyState(overrides: Partial<LobbyRoomState> = {}): LobbyRoomState {
  return {
    id: "lobby-1",
    version: 1,
    status: "WAITING",
    joinCode: "ABCD",
    format: "Standard",
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    hostReady: false,
    hostUserId: "host-user",
    host: { username: "hosty", name: null, image: null },
    hostDeck: null,
    allowSpectators: false,
    spectators: [],
    spectatorCount: 0,
    viewerRole: null,
    guest: null,
    gameId: null,
    ...overrides,
  };
}

function withGuest(state: LobbyRoomState, guestUserId: string): LobbyRoomState {
  return {
    ...state,
    guest: {
      guestReady: false,
      user: { id: guestUserId, username: null, name: null, image: null },
      deck: null,
    },
  };
}

function withSpectators(
  state: LobbyRoomState,
  spectatorIds: string[]
): LobbyRoomState {
  return {
    ...state,
    allowSpectators: true,
    spectators: spectatorIds.map((id) => ({
      id,
      username: null,
      name: null,
      image: null,
    })),
    spectatorCount: spectatorIds.length,
  };
}

describe("notifyLobby", () => {
  it("notifies both members in PVP when no actor is specified", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const state = withGuest(lobbyState(), "guest-user");

    await notifyLobby(state, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateBuilder: async () => state,
    });

    const recipients = fetchMock.mock.calls.map(([url]) => url);
    expect(recipients).toEqual([
      "https://worker.example/user/host-user/notify",
      "https://worker.example/user/guest-user/notify",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.parse(init.body)).toEqual({
        type: "lobby:state_changed",
        lobby: state,
      });
    }
  });

  it("skips the actor's userId from the fanout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const state = withGuest(lobbyState(), "guest-user");

    await notifyLobby(state, {
      actorUserId: "guest-user",
      deps: { ...baseDeps, fetch: fetchMock },
      stateBuilder: async () => state,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://worker.example/user/host-user/notify"
    );
  });

  it("notifies spectators with their rebuilt viewer-scoped state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const state = withSpectators(withGuest(lobbyState(), "guest-user"), [
      "spectator-1",
      "spectator-2",
    ]);
    const stateBuilder = vi.fn(
      async (_lobbyId: string, viewerUserId: string) => ({
        ...state,
        viewerRole: viewerUserId.startsWith("spectator-")
          ? ("spectator" as const)
          : null,
      })
    );

    await notifyLobby(state, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateBuilder,
    });

    expect(stateBuilder).toHaveBeenCalledTimes(4);
    expect(stateBuilder).toHaveBeenCalledWith("lobby-1", "spectator-1");
    expect(stateBuilder).toHaveBeenCalledWith("lobby-1", "spectator-2");
    const spectatorPayloads = fetchMock.mock.calls
      .filter(([url]) => url.includes("spectator-"))
      .map(([, init]) => JSON.parse(init.body));
    expect(spectatorPayloads).toHaveLength(2);
    expect(
      spectatorPayloads.every(({ lobby }) => lobby.viewerRole === "spectator")
    ).toBe(true);
  });

  it("skips a spectator when that spectator is the actor", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const state = withSpectators(withGuest(lobbyState(), "guest-user"), [
      "spectator-actor",
    ]);
    const stateBuilder = vi.fn(async () => state);

    await notifyLobby(state, {
      actorUserId: "spectator-actor",
      deps: { ...baseDeps, fetch: fetchMock },
      stateBuilder,
    });

    expect(stateBuilder).toHaveBeenCalledTimes(2);
    expect(stateBuilder).not.toHaveBeenCalledWith("lobby-1", "spectator-actor");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://worker.example/user/host-user/notify",
      "https://worker.example/user/guest-user/notify",
    ]);
  });

  it("dedupes the solitaire host-as-guest while retaining spectators", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const state = withSpectators(
      withGuest(
        lobbyState({ mode: "SOLITAIRE", status: "READY" }),
        "host-user"
      ),
      ["spectator-user"]
    );

    await notifyLobby(state, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateBuilder: async () => state,
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://worker.example/user/host-user/notify",
      "https://worker.example/user/spectator-user/notify",
    ]);
  });

  it("is a no-op in solitaire when the host is also the actor", async () => {
    const fetchMock = vi.fn();
    const state = withGuest(
      lobbyState({ mode: "SOLITAIRE", status: "READY" }),
      "host-user"
    );

    await notifyLobby(state, {
      actorUserId: "host-user",
      deps: { ...baseDeps, fetch: fetchMock },
      stateBuilder: async () => state,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("targets only the host when there is no guest", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));

    const state = lobbyState();
    await notifyLobby(state, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateBuilder: async () => state,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://worker.example/user/host-user/notify"
    );
  });

  it("fans out to both members in parallel (Promise.all, not serial)", async () => {
    const resolvers: Array<() => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(() => resolve(new Response(null, { status: 202 })));
        })
    );
    const state = withGuest(lobbyState(), "guest-user");

    const pending = notifyLobby(state, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateBuilder: async () => state,
    });

    // Both fetch calls are pending before either resolves — proves they were
    // initiated in parallel, not awaited sequentially.
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvers.forEach((r) => r());
    await pending;
  });

  it("builds a participant-scoped snapshot for each realtime recipient", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const state = withGuest(lobbyState(), "guest-user");
    const stateBuilder = vi.fn(
      async (_lobbyId: string, viewerUserId: string) => ({
        ...state,
        hostDeck: {
          id: "deck-1",
          name: "Deck",
          leaderId: "OP01-001",
          leaderName: "Leader",
          leaderImageUrl: null,
          contents: {
            characters: [
              {
                id: "OP01-024",
                name: viewerUserId,
                quantity: 4,
                imageUrl: "/card.png",
              },
            ],
            events: [],
            stages: [],
          },
        },
      })
    );

    await notifyLobby(state, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateBuilder,
    });

    expect(stateBuilder).toHaveBeenCalledWith("lobby-1", "host-user");
    expect(stateBuilder).toHaveBeenCalledWith("lobby-1", "guest-user");
    const payloads = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(init.body)
    );
    expect(payloads[0].lobby.hostDeck.contents.characters[0].name).toBe(
      "host-user"
    );
    expect(payloads[1].lobby.hostDeck.contents.characters[0].name).toBe(
      "guest-user"
    );
  });

  it("sends nothing when a per-recipient rebuild returns null", async () => {
    const fetchMock = vi.fn();
    const viewerScopedInput = withGuest(
      lobbyState({ viewerRole: "host" }),
      "guest-user"
    );

    await notifyLobby(viewerScopedInput, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateBuilder: async () => null,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [0, 2],
    [1, 3],
    [20, 22],
  ])(
    "builds one viewer snapshot per target with %i spectators",
    async (spectatorCount, expectedBuilds) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 202 }));
      const state = withSpectators(
        withGuest(lobbyState(), "guest-user"),
        Array.from(
          { length: spectatorCount },
          (_, index) => `spectator-${index}`
        )
      );
      const stateBuilder = vi.fn(async () => state);

      await notifyLobby(state, {
        deps: { ...baseDeps, fetch: fetchMock },
        stateBuilder,
      });

      expect(stateBuilder).toHaveBeenCalledTimes(expectedBuilds);
      expect(fetchMock).toHaveBeenCalledTimes(expectedBuilds);
    }
  );

  it.each(["SPECTATING_DISABLED", "REMOVED_BY_HOST"] as const)(
    "directs exactly one %s event to a removed spectator outside current-state fanout",
    async (reason) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 202 }));
      const currentState = withGuest(lobbyState(), "guest-user");

      await notifySpectatorRemoved(
        "removed-spectator",
        currentState.id,
        reason,
        { ...baseDeps, fetch: fetchMock }
      );
      await notifyLobby(currentState, {
        actorUserId: "host-user",
        deps: { ...baseDeps, fetch: fetchMock },
        stateBuilder: async () => currentState,
      });

      const removedSpectatorCalls = fetchMock.mock.calls.filter(([url]) =>
        url.includes("removed-spectator")
      );
      expect(removedSpectatorCalls).toHaveLength(1);
      expect(JSON.parse(removedSpectatorCalls[0][1].body)).toEqual({
        type: "lobby:spectator_removed",
        lobbyId: "lobby-1",
        reason,
      });
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url.includes("removed-spectator") &&
            JSON.parse(init.body).type === "lobby:state_changed"
        )
      ).toBe(false);
    }
  );
});
