import { describe, expect, it } from "vitest";
import type { LobbyRoomState } from "@/lib/lobbies/state";
import { lobbyRoomRecovery } from "./lobby-room-recovery";

function lobbyState(overrides: Partial<LobbyRoomState> = {}): LobbyRoomState {
  return {
    id: "lobby-1",
    version: "2026-07-16T12:00:00.000Z",
    status: "READY",
    joinCode: "ABCD",
    format: "Standard",
    mode: "PVP",
    hostReady: true,
    hostUserId: "host-user",
    host: { username: "hosty", name: null, image: null },
    hostDeck: null,
    guest: null,
    gameId: null,
    ...overrides,
  };
}

describe("lobbyRoomRecovery", () => {
  it("gives a CLOSED guest an explicit outcome and lobby-browser route", () => {
    expect(lobbyRoomRecovery(lobbyState({ status: "CLOSED" }))).toEqual({
      route: "/lobbies",
      message: "The host closed the lobby",
    });
  });

  it("preserves game routing for a lobby that starts", () => {
    expect(
      lobbyRoomRecovery(lobbyState({ status: "IN_GAME", gameId: "game-1" }))
    ).toEqual({ route: "/game/game-1", message: null });
  });

  it("does not recover an active pre-game room", () => {
    expect(lobbyRoomRecovery(lobbyState())).toBeNull();
  });
});
