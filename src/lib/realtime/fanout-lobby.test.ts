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
    status: "WAITING",
    joinCode: "ABCD",
    format: "Standard",
    mode: "PVP",
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const state = withGuest(lobbyState(), "guest-user");

    await notifyLobby(state, { deps: { ...baseDeps, fetch: fetchMock } });

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
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const state = withGuest(lobbyState(), "guest-user");

    await notifyLobby(state, {
      actorUserId: "guest-user",
      deps: { ...baseDeps, fetch: fetchMock },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://worker.example/user/host-user/notify",
    );
  });

  it("dedupes solitaire (host occupies the guest seat) into a single fanout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const state = withGuest(
      lobbyState({ mode: "SOLITAIRE", status: "READY" }),
      "host-user",
    );

    await notifyLobby(state, { deps: { ...baseDeps, fetch: fetchMock } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://worker.example/user/host-user/notify",
    );
  });

  it("is a no-op in solitaire when the host is also the actor", async () => {
    const fetchMock = vi.fn();
    const state = withGuest(
      lobbyState({ mode: "SOLITAIRE", status: "READY" }),
      "host-user",
    );

    await notifyLobby(state, {
      actorUserId: "host-user",
      deps: { ...baseDeps, fetch: fetchMock },
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("targets only the host when there is no guest", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));

    await notifyLobby(lobbyState(), { deps: { ...baseDeps, fetch: fetchMock } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://worker.example/user/host-user/notify",
    );
  });

  it("fans out to both members in parallel (Promise.all, not serial)", async () => {
    const resolvers: Array<() => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(() => resolve(new Response(null, { status: 202 })));
        }),
    );
    const state = withGuest(lobbyState(), "guest-user");

    const pending = notifyLobby(state, { deps: { ...baseDeps, fetch: fetchMock } });

    // Both fetch calls are pending before either resolves — proves they were
    // initiated in parallel, not awaited sequentially.
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvers.forEach((r) => r());
    await pending;
  });
});
