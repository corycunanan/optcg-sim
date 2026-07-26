import { describe, expect, it, vi } from "vitest";
import { notifyLobby, notifySpectatorsRemoved } from "./fanout-lobby";
import type { LobbyRoomState } from "@/lib/lobbies/state";
import type { LobbyRoomStateRead } from "@/lib/lobbies/build-state";

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

function sharedRead(state: LobbyRoomState): LobbyRoomStateRead {
  const {
    hostDeck,
    guest,
    viewerRole: _viewerRole,
    pendingInvite,
    ...common
  } = state;
  void _viewerRole;
  return {
    common,
    hostDeck,
    guest,
    pendingInvite: pendingInvite ?? null,
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
      stateReader: async () => sharedRead(state),
    });

    const recipients = fetchMock.mock.calls.map(([url]) => url);
    expect(recipients).toEqual([
      "https://worker.example/user/host-user/notify",
      "https://worker.example/user/guest-user/notify",
    ]);
    expect(
      fetchMock.mock.calls.map(
        ([, init]) => JSON.parse(init.body).lobby.viewerRole
      )
    ).toEqual(["host", "guest"]);
  });

  it("skips the actor's userId from the fanout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const state = withGuest(lobbyState(), "guest-user");

    await notifyLobby(state, {
      actorUserId: "guest-user",
      deps: { ...baseDeps, fetch: fetchMock },
      stateReader: async () => sharedRead(state),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://worker.example/user/host-user/notify"
    );
  });

  it("notifies spectators with their projected viewer-scoped state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const state = withSpectators(withGuest(lobbyState(), "guest-user"), [
      "spectator-1",
      "spectator-2",
    ]);
    const stateReader = vi.fn(async () => sharedRead(state));

    await notifyLobby(state, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateReader,
    });

    expect(stateReader).toHaveBeenCalledTimes(1);
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
    await notifyLobby(state, {
      actorUserId: "spectator-actor",
      deps: { ...baseDeps, fetch: fetchMock },
      stateReader: async () => sharedRead(state),
    });

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
      stateReader: async () => sharedRead(state),
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
    const stateReader = vi.fn(async () => sharedRead(state));

    await notifyLobby(state, {
      actorUserId: "host-user",
      deps: { ...baseDeps, fetch: fetchMock },
      stateReader,
    });

    expect(stateReader).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("targets only the host when there is no guest", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));

    const state = lobbyState();
    await notifyLobby(state, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateReader: async () => sharedRead(state),
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
      stateReader: async () => sharedRead(state),
    });

    // Both fetch calls are pending before either resolves — proves they were
    // initiated in parallel, not awaited sequentially.
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvers.forEach((r) => r());
    await pending;
  });

  it("projects the required viewer role for each realtime recipient", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const state = withGuest(lobbyState(), "guest-user");
    await notifyLobby(state, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateReader: async () => sharedRead(state),
    });

    const payloads = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(init.body)
    );
    expect(payloads.map(({ lobby }) => lobby.viewerRole)).toEqual([
      "host",
      "guest",
    ]);
  });

  it("sends nothing when the shared read returns null", async () => {
    const fetchMock = vi.fn();
    const viewerScopedInput = withGuest(
      lobbyState({ viewerRole: "host" }),
      "guest-user"
    );

    await notifyLobby(viewerScopedInput, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateReader: async () => null,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [0, 2],
    [1, 3],
    [20, 22],
  ])(
    "reads once and projects one viewer snapshot per target with %i spectators",
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
      const stateReader = vi.fn(async () => sharedRead(state));

      await notifyLobby(state, {
        deps: { ...baseDeps, fetch: fetchMock },
        stateReader,
      });

      expect(stateReader).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(expectedBuilds);
    }
  );

  it.each(["SPECTATING_DISABLED", "REMOVED_BY_HOST", "LOBBY_CLOSED"] as const)(
    "directs exactly one %s event to every removed spectator outside current-state fanout",
    async (reason) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 202 }));
      const currentState = withGuest(lobbyState(), "guest-user");

      await notifySpectatorsRemoved(
        {
          lobbyId: currentState.id,
          reason,
          // Duplicate proves the bulk primitive emits at most one terminal
          // event per captured user ID.
          removedSpectatorUserIds: [
            "removed-spectator",
            "other-spectator",
            "removed-spectator",
          ],
        },
        { ...baseDeps, fetch: fetchMock }
      );
      await notifyLobby(currentState, {
        actorUserId: "host-user",
        deps: { ...baseDeps, fetch: fetchMock },
        stateReader: async () => sharedRead(currentState),
      });

      const removedSpectatorCalls = fetchMock.mock.calls.filter(([url]) =>
        url.includes("removed-spectator")
      );
      const otherSpectatorCalls = fetchMock.mock.calls.filter(([url]) =>
        url.includes("other-spectator")
      );
      expect(removedSpectatorCalls).toHaveLength(1);
      expect(otherSpectatorCalls).toHaveLength(1);
      expect(JSON.parse(removedSpectatorCalls[0][1].body)).toEqual({
        type: "lobby:spectator_removed",
        lobbyId: "lobby-1",
        reason,
      });
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            (url.includes("removed-spectator") ||
              url.includes("other-spectator")) &&
            JSON.parse(init.body).type === "lobby:state_changed"
        )
      ).toBe(false);
    }
  );
});
