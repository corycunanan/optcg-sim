import { describe, expect, it } from "vitest";
import {
  LobbyRoomStateSchema,
  PatchLobbySchema,
  PregameModeSchema,
} from "./lobbies";

function lobbyState(version?: unknown) {
  const state = {
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
  };
  return version === undefined ? state : { ...state, version };
}

describe("LobbyRoomStateSchema version", () => {
  it("accepts the nonnegative integer Lobby revision", () => {
    expect(LobbyRoomStateSchema.parse(lobbyState(0)).version).toBe(0);
    expect(LobbyRoomStateSchema.parse(lobbyState(42)).version).toBe(42);
  });

  it("accepts a legacy lobby snapshot without a version", () => {
    expect(LobbyRoomStateSchema.parse(lobbyState()).version).toBeUndefined();
  });

  it("rejects the former timestamp version shape", () => {
    expect(
      LobbyRoomStateSchema.safeParse(
        lobbyState("2026-07-16T12:00:00.000Z")
      ).success
    ).toBe(false);
  });
});

describe("pregame mode validation", () => {
  it.each([
    "PRIORITY_ROLL",
    "HOST_FIRST",
    "GUEST_FIRST",
    "RANDOM_FIXED",
  ] as const)("accepts %s in lobby snapshots and PATCH bodies", (pregameMode) => {
    expect(PregameModeSchema.parse(pregameMode)).toBe(pregameMode);
    expect(PatchLobbySchema.parse({ pregameMode })).toEqual({ pregameMode });
    expect(
      LobbyRoomStateSchema.parse({ ...lobbyState(), pregameMode }).pregameMode
    ).toBe(pregameMode);
  });

  it("defaults legacy lobby snapshots to priority roll", () => {
    expect(LobbyRoomStateSchema.parse(lobbyState()).pregameMode).toBe(
      "PRIORITY_ROLL"
    );
  });

  it("rejects future solitaire values until OPT-368 adds them", () => {
    expect(PatchLobbySchema.safeParse({ pregameMode: "SIDE_A_FIRST" }).success)
      .toBe(false);
  });
});
