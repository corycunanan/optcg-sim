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
      LobbyRoomStateSchema.safeParse(lobbyState("2026-07-16T12:00:00.000Z"))
        .success
    ).toBe(false);
  });
});

describe("LobbyRoomStateSchema pending invite", () => {
  it("accepts the additive server-timestamped invited-seat state", () => {
    const pendingInvite = {
      id: "invite-1",
      expiresAt: "2026-07-24T20:05:00.000Z",
      user: {
        id: "friend-1",
        username: "nami",
        name: "Nami",
        image: null,
      },
    };

    expect(
      LobbyRoomStateSchema.parse({ ...lobbyState(), pendingInvite })
        .pendingInvite
    ).toEqual(pendingInvite);
  });

  it("keeps legacy room snapshots valid when invite state is absent", () => {
    expect(
      LobbyRoomStateSchema.parse(lobbyState()).pendingInvite
    ).toBeUndefined();
  });
});

describe("LobbyRoomStateSchema participant deck contents", () => {
  it("accepts additive grouped card summaries on a seat deck", () => {
    const contents = {
      characters: [
        {
          id: "OP01-024",
          name: "Monkey.D.Luffy",
          quantity: 4,
          imageUrl: "https://images.example/OP01-024.png",
        },
      ],
      events: [],
      stages: [],
    };

    const parsed = LobbyRoomStateSchema.parse({
      ...lobbyState(),
      hostDeck: {
        id: "deck-1",
        name: "Straw Hats",
        leaderId: "OP01-001",
        leaderName: "Roronoa Zoro",
        leaderImageUrl: null,
        contents,
      },
    });

    expect(parsed.hostDeck?.contents).toEqual(contents);
  });

  it("keeps legacy deck summaries valid without contents", () => {
    const parsed = LobbyRoomStateSchema.parse({
      ...lobbyState(),
      hostDeck: {
        id: "deck-1",
        name: "Straw Hats",
        leaderId: "OP01-001",
        leaderName: "Roronoa Zoro",
        leaderImageUrl: null,
      },
    });

    expect(parsed.hostDeck?.contents).toBeUndefined();
  });
});

describe("pregame mode validation", () => {
  it.each([
    "PRIORITY_ROLL",
    "HOST_FIRST",
    "GUEST_FIRST",
    "RANDOM_FIXED",
    "SIDE_A_FIRST",
    "SIDE_B_FIRST",
    "SOLITAIRE_RANDOM",
  ] as const)(
    "accepts %s in lobby snapshots and PATCH bodies",
    (pregameMode) => {
      expect(PregameModeSchema.parse(pregameMode)).toBe(pregameMode);
      expect(PatchLobbySchema.parse({ pregameMode })).toEqual({ pregameMode });
      expect(
        LobbyRoomStateSchema.parse({ ...lobbyState(), pregameMode }).pregameMode
      ).toBe(pregameMode);
    }
  );

  it("defaults legacy lobby snapshots to priority roll", () => {
    expect(LobbyRoomStateSchema.parse(lobbyState()).pregameMode).toBe(
      "PRIORITY_ROLL"
    );
  });

  it("rejects unknown future values", () => {
    expect(
      PatchLobbySchema.safeParse({ pregameMode: "FUTURE_MODE" }).success
    ).toBe(false);
  });
});
