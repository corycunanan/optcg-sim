import { describe, expect, it, vi } from "vitest";
import { notifyLobby } from "./fanout-lobby";
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

  it("dedupes solitaire (host occupies the guest seat) into a single fanout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const state = withGuest(
      lobbyState({ mode: "SOLITAIRE", status: "READY" }),
      "host-user"
    );

    await notifyLobby(state, {
      deps: { ...baseDeps, fetch: fetchMock },
      stateBuilder: async () => state,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://worker.example/user/host-user/notify"
    );
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
});
