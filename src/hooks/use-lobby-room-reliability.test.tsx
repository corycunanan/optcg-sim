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
    version: "2026-07-16T12:00:00.000Z",
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
  it("recovers a dropped guest-leave fanout when the user channel reconnects", async () => {
    const staleOccupied = lobbyState({
      version: "2026-07-16T12:00:01.000Z",
      status: "READY",
      guest: guest("departed-guest"),
    });
    const releasedSeat = lobbyState({
      version: "2026-07-16T12:00:02.000Z",
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

  it("rejects a leave snapshot delivered after a newer join snapshot", async () => {
    const initial = lobbyState({
      version: "2026-07-16T12:00:01.000Z",
      status: "READY",
      guest: guest("first-guest"),
    });
    const afterLeave = lobbyState({
      version: "2026-07-16T12:00:02.000Z",
      status: "WAITING",
      guest: null,
    });
    const afterJoin = lobbyState({
      version: "2026-07-16T12:00:03.000Z",
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

  it("recovers a missed CLOSED event during the bounded fallback window", async () => {
    const active = lobbyState({
      version: "2026-07-16T12:00:01.000Z",
      status: "READY",
      guest: guest("guest-user"),
    });
    const closed = lobbyState({
      version: "2026-07-16T12:00:02.000Z",
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
