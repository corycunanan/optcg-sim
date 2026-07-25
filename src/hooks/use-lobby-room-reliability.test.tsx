import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus } from "@/types/realtime";
import type { LobbyRoomState } from "@/lib/lobbies/state";

type LobbyEvent = { type: "lobby:state_changed"; lobby: LobbyRoomState };

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  connectionStatus: "connected" as ConnectionStatus,
  subscribe: vi.fn(),
  subscribeHandler: null as ((event: LobbyEvent) => void) | null,
  subscribeUnsub: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiDelete: (...args: unknown[]) => mocks.apiDelete(...args),
  apiGet: (...args: unknown[]) => mocks.apiGet(...args),
  apiPatch: (...args: unknown[]) => mocks.apiPatch(...args),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
}));

vi.mock("@/components/realtime/user-channel-provider", () => ({
  useUserChannelEvents: () => ({
    connectionStatus: mocks.connectionStatus,
    subscribe: mocks.subscribe,
  }),
}));

import {
  LOBBY_RECONCILIATION_INTERVAL_MS,
  LOBBY_RECONCILIATION_MAX_ATTEMPTS,
  useLobbyRoom,
} from "@/hooks/use-lobby-room";

type LobbyRoomResult = ReturnType<typeof useLobbyRoom>;

let latestRoom: LobbyRoomResult | null = null;
let renderer: ReactTestRenderer | null = null;

function LobbyRoomProbe({ initialLobby }: { initialLobby: LobbyRoomState }) {
  const room = useLobbyRoom(initialLobby.id, initialLobby);
  useEffect(() => {
    latestRoom = room;
  }, [room]);
  return null;
}

function room(): LobbyRoomResult {
  if (!latestRoom) throw new Error("Lobby room has not rendered");
  return latestRoom;
}

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
    viewerRole: "host",
    guest: null,
    gameId: null,
    ...overrides,
  };
}

function guest(userId: string) {
  return {
    guestReady: false,
    user: { id: userId, username: null, name: null, image: null },
    deck: null,
  };
}

async function mount(initialLobby: LobbyRoomState) {
  await act(async () => {
    renderer = create(<LobbyRoomProbe initialLobby={initialLobby} />);
    await Promise.resolve();
  });
}

async function rerender(initialLobby: LobbyRoomState) {
  await act(async () => {
    renderer?.update(<LobbyRoomProbe initialLobby={initialLobby} />);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  mocks.apiGet.mockReset();
  mocks.apiDelete.mockReset();
  mocks.apiPatch.mockReset();
  mocks.apiPost.mockReset();
  mocks.subscribeUnsub.mockReset();
  mocks.subscribe.mockReset();
  mocks.subscribe.mockImplementation(
    (type: string, handler: (event: LobbyEvent) => void) => {
      if (type === "lobby:state_changed") mocks.subscribeHandler = handler;
      return mocks.subscribeUnsub;
    }
  );
  mocks.connectionStatus = "connected";
  mocks.subscribeHandler = null;
  latestRoom = null;
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useLobbyRoom degraded delivery recovery", () => {
  it("applies an equal-revision authoritative GET", async () => {
    const initial = lobbyState({ version: 4, format: "Standard" });
    const refreshed = lobbyState({ version: 4, format: "Eternal" });
    mocks.apiGet.mockResolvedValue({ data: refreshed });

    await mount(initial);

    expect(room().lobby).toEqual(refreshed);
  });

  it("applies a legacy snapshot without a version", async () => {
    const initial = lobbyState({ version: undefined, format: "Standard" });
    const refreshed = lobbyState({ version: undefined, format: "Eternal" });
    mocks.apiGet.mockResolvedValue({ data: refreshed });

    await mount(initial);

    expect(room().lobby).toEqual(refreshed);
  });

  it("starts numeric gating after a versioned snapshot follows legacy data", async () => {
    const initial = lobbyState({ version: undefined, format: "Standard" });
    const versioned = lobbyState({ version: 2, format: "Eternal" });
    mocks.apiGet.mockResolvedValue({ data: versioned });
    await mount(initial);

    await act(async () => {
      mocks.subscribeHandler?.({
        type: "lobby:state_changed",
        lobby: lobbyState({ version: 1, format: "Standard" }),
      });
    });

    expect(room().lobby).toEqual(versioned);
  });

  it("applies a legacy snapshot after numeric gating without replacing the gate", async () => {
    const initial = lobbyState({ version: 5, format: "Standard" });
    const legacy = lobbyState({ version: undefined, format: "Eternal" });
    mocks.apiGet.mockResolvedValue({ data: legacy });
    await mount(initial);

    expect(room().lobby).toEqual(legacy);

    await act(async () => {
      mocks.subscribeHandler?.({
        type: "lobby:state_changed",
        lobby: lobbyState({ version: 4, format: "Standard" }),
      });
    });

    expect(room().lobby).toEqual(legacy);
  });

  it("picks up deck-detail drift with an unchanged revision on reconciliation", async () => {
    const initial = lobbyState({
      version: 4,
      hostDeck: {
        id: "deck-1",
        name: "Old name",
        leaderId: "leader-1",
        leaderName: "Leader",
        leaderImageUrl: "/old-art.png",
      },
    });
    const renamedDeck = lobbyState({
      version: 4,
      hostDeck: {
        id: "deck-1",
        name: "Renamed deck",
        leaderId: "leader-1",
        leaderName: "Leader",
        leaderImageUrl: "/new-art.png",
      },
    });
    let serverState = initial;
    mocks.apiGet.mockImplementation(async () => ({ data: serverState }));
    await mount(initial);

    serverState = renamedDeck;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_RECONCILIATION_INTERVAL_MS);
    });

    expect(room().lobby).toEqual(renamedDeck);
  });

  it("recovers a dropped guest-leave fanout when the user channel reconnects", async () => {
    const staleOccupied = lobbyState({
      version: 2,
      status: "READY",
      guest: guest("departed-guest"),
    });
    const releasedSeat = lobbyState({
      version: 3,
      status: "WAITING",
      guest: null,
    });
    let serverState = staleOccupied;
    mocks.apiGet.mockImplementation(async () => ({ data: serverState }));

    await mount(staleOccupied);
    expect(room().lobby).toEqual(staleOccupied);

    mocks.connectionStatus = "disconnected";
    await rerender(staleOccupied);

    // The leave fanout is deliberately omitted. The server has the released
    // seat, but this tab can only learn it from reconnect reconciliation.
    serverState = releasedSeat;
    const callsBeforeReconnect = mocks.apiGet.mock.calls.length;
    mocks.connectionStatus = "connected";
    await rerender(staleOccupied);

    expect(mocks.apiGet).toHaveBeenCalledTimes(callsBeforeReconnect + 1);
    expect(room().lobby).toEqual(releasedSeat);
  });

  it("coalesces a reconnect during an in-flight read into a fresh follow-up", async () => {
    const initial = lobbyState({ version: 4, format: "Standard" });
    const stale = lobbyState({ version: 4, format: "Stale" });
    const fresh = lobbyState({ version: 5, format: "Eternal" });
    let resolveStale!: (value: { data: LobbyRoomState }) => void;
    const staleRead = new Promise<{ data: LobbyRoomState }>((resolve) => {
      resolveStale = resolve;
    });
    mocks.apiGet
      .mockReturnValueOnce(staleRead)
      .mockResolvedValueOnce({ data: fresh });

    await mount(initial);
    expect(mocks.apiGet).toHaveBeenCalledTimes(1);

    mocks.connectionStatus = "disconnected";
    await rerender(initial);
    mocks.connectionStatus = "connected";
    await rerender(initial);

    await act(async () => {
      void room().refresh();
      void room().refresh();
      await Promise.resolve();
    });
    expect(mocks.apiGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStale({ data: stale });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.apiGet).toHaveBeenCalledTimes(2);
    expect(room().lobby).toEqual(fresh);
  });

  it("rejects an older realtime event delivered after a newer event", async () => {
    const initial = lobbyState({
      version: 2,
      status: "READY",
      guest: guest("first-guest"),
    });
    const afterLeave = lobbyState({
      version: 3,
      status: "WAITING",
      guest: null,
    });
    const afterJoin = lobbyState({
      version: 4,
      status: "READY",
      guest: guest("second-guest"),
    });
    mocks.apiGet.mockResolvedValue({ data: initial });

    await mount(initial);

    await act(async () => {
      mocks.subscribeHandler?.({
        type: "lobby:state_changed",
        lobby: afterJoin,
      });
      mocks.subscribeHandler?.({
        type: "lobby:state_changed",
        lobby: afterLeave,
      });
    });

    expect(room().lobby).toEqual(afterJoin);
  });

  it("rejects an equal-revision realtime event", async () => {
    const initial = lobbyState({ version: 4, format: "Standard" });
    mocks.apiGet.mockResolvedValue({ data: initial });
    await mount(initial);

    await act(async () => {
      mocks.subscribeHandler?.({
        type: "lobby:state_changed",
        lobby: lobbyState({ version: 4, format: "Eternal" }),
      });
    });

    expect(room().lobby).toEqual(initial);
  });

  it("recovers a missed CLOSED event during the bounded fallback window", async () => {
    const active = lobbyState({
      version: 2,
      status: "READY",
      guest: guest("guest-user"),
    });
    const closed = lobbyState({
      version: 3,
      status: "CLOSED",
      guest: guest("guest-user"),
    });
    let serverState = active;
    mocks.connectionStatus = "disconnected";
    mocks.apiGet.mockImplementation(async () => ({ data: serverState }));
    await mount(active);

    // No CLOSED push is delivered while disconnected. The first bounded
    // active-room reconciliation request observes the terminal server state.
    serverState = closed;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_RECONCILIATION_INTERVAL_MS);
    });

    expect(room().lobby).toEqual(closed);
  });

  it("caps active pre-game reconciliation at six attempts over 60 seconds", async () => {
    const active = lobbyState();
    mocks.apiGet.mockResolvedValue({ data: active });
    await mount(active);
    mocks.apiGet.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        LOBBY_RECONCILIATION_INTERVAL_MS * LOBBY_RECONCILIATION_MAX_ATTEMPTS
      );
    });

    expect(mocks.apiGet).toHaveBeenCalledTimes(
      LOBBY_RECONCILIATION_MAX_ATTEMPTS
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_RECONCILIATION_INTERVAL_MS * 6);
    });
    expect(mocks.apiGet).toHaveBeenCalledTimes(
      LOBBY_RECONCILIATION_MAX_ATTEMPTS
    );
  });

  it("does not spend reconciliation attempts while the mount refresh is in flight", async () => {
    const active = lobbyState();
    let calls = 0;
    mocks.apiGet.mockImplementation(
      async (
        _url: string,
        _schema: unknown,
        options?: { signal?: AbortSignal }
      ) => {
        calls += 1;
        if (calls !== 1) return { data: active };

        return new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }
    );

    await mount(active);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        LOBBY_RECONCILIATION_INTERVAL_MS * LOBBY_RECONCILIATION_MAX_ATTEMPTS
      );
    });

    // One timed-out mount GET plus six reconciliation requests launched at
    // 10-second intervals. The blocked mount request consumes no attempt.
    expect(mocks.apiGet).toHaveBeenCalledTimes(
      LOBBY_RECONCILIATION_MAX_ATTEMPTS + 1
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_RECONCILIATION_INTERVAL_MS * 3);
    });
    expect(mocks.apiGet).toHaveBeenCalledTimes(
      LOBBY_RECONCILIATION_MAX_ATTEMPTS + 1
    );
  });

  it("reconciles a polled IN_GAME snapshot into the party room", async () => {
    const active = lobbyState({ version: 4, status: "READY" });
    const started = lobbyState({
      version: 5,
      status: "IN_GAME",
      gameId: "game-1",
    });
    mocks.apiGet.mockResolvedValue({ data: started });

    await mount(active);

    expect(room().lobby).toEqual(started);
    expect(mocks.apiGet).toHaveBeenCalledTimes(1);
  });

  it("applies realtime IN_GAME events without GET confirmation", async () => {
    const active = lobbyState({ version: 4, status: "READY" });
    const started = lobbyState({
      version: 5,
      status: "IN_GAME",
      gameId: "game-1",
    });
    mocks.apiGet.mockResolvedValue({ data: active });
    await mount(active);
    mocks.apiGet.mockClear();

    await act(async () => {
      mocks.subscribeHandler?.({
        type: "lobby:state_changed",
        lobby: started,
      });
    });

    expect(mocks.apiGet).not.toHaveBeenCalled();
    expect(room().lobby).toEqual(started);
  });

  it("does not reconcile a terminal room", async () => {
    const closed = lobbyState({ status: "CLOSED" });
    mocks.apiGet.mockResolvedValue({ data: closed });
    await mount(closed);
    mocks.apiGet.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        LOBBY_RECONCILIATION_INTERVAL_MS * LOBBY_RECONCILIATION_MAX_ATTEMPTS
      );
    });

    expect(mocks.apiGet).not.toHaveBeenCalled();
  });
});
