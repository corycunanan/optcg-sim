import { describe, expect, it } from "vitest";
import type { LobbyRoomState } from "@/lib/lobbies/state";
import { lobbyRoomRecovery, rejoinGameId } from "./lobby-room-recovery";

function lobbyState(overrides: Partial<LobbyRoomState> = {}): LobbyRoomState {
  return {
    id: "lobby-1",
    version: 1,
    status: "READY",
    joinCode: "ABCD",
    format: "Standard",
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    hostReady: true,
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

describe("lobbyRoomRecovery", () => {
  it("uses neutral recovery copy when the viewer is no longer seated", () => {
    expect(lobbyRoomRecovery(lobbyState({ status: "EVICTED" }))).toEqual({
      route: "/lobbies",
      message: "You're no longer in this party",
    });
  });

  it("gives a CLOSED guest an explicit outcome and lobby-browser route", () => {
    expect(lobbyRoomRecovery(lobbyState({ status: "CLOSED" }))).toEqual({
      route: "/lobbies",
      message: "You're no longer in this party",
    });
  });

  it("keeps an in-progress game in the party room for explicit rejoin", () => {
    const inGame = lobbyState({
      status: "IN_GAME",
      gameId: "game-1",
      gameStatus: "IN_PROGRESS",
    });

    expect(lobbyRoomRecovery(inGame)).toBeNull();
    expect(rejoinGameId(inGame)).toBe("game-1");
  });

  it("does not offer Rejoin for OPT-520's stale post-game lobby state", () => {
    expect(
      rejoinGameId(
        lobbyState({
          status: "IN_GAME",
          gameId: "game-1",
          gameStatus: "FINISHED",
        })
      )
    ).toBeNull();
  });

  it("does not recover an active pre-game room", () => {
    expect(lobbyRoomRecovery(lobbyState())).toBeNull();
  });
});
