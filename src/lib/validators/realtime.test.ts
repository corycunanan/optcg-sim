import { describe, expect, it } from "vitest";
import { GameServerMessageSchema, RealtimeServerEventSchema } from "./realtime";

describe("RealtimeServerEventSchema spectator removal", () => {
  it.each(["SPECTATING_DISABLED", "REMOVED_BY_HOST", "LOBBY_CLOSED"] as const)(
    "accepts the %s reason",
    (reason) => {
      expect(
        RealtimeServerEventSchema.parse({
          type: "lobby:spectator_removed",
          lobbyId: "lobby-1",
          reason,
        })
      ).toEqual({
        type: "lobby:spectator_removed",
        lobbyId: "lobby-1",
        reason,
      });
    }
  );

  it("rejects an unknown removal reason", () => {
    expect(() =>
      RealtimeServerEventSchema.parse({
        type: "lobby:spectator_removed",
        lobbyId: "lobby-1",
        reason: "UNKNOWN",
      })
    ).toThrow();
  });
});

describe("RealtimeServerEventSchema notification timestamps", () => {
  const event = {
    type: "notification:updated",
    notification: {
      id: "notification-1",
      userId: "user-1",
      type: "FRIEND_REQUEST",
      status: "READ",
      actorUserId: null,
      actor: null,
      referenceId: "request-1",
      payload: null,
      createdAt: "2026-07-26T12:00:00.000Z",
      updatedAt: "2026-07-26T12:01:00.000Z",
    },
    unreadCount: 0,
  } as const;

  it("accepts ISO datetimes in serialized notifications", () => {
    expect(RealtimeServerEventSchema.parse(event)).toEqual(event);
  });

  it.each(["createdAt", "updatedAt"] as const)(
    "rejects a non-ISO %s timestamp",
    (field) => {
      expect(
        RealtimeServerEventSchema.safeParse({
          ...event,
          notification: { ...event.notification, [field]: "not-a-date" },
        }).success
      ).toBe(false);
    }
  );
});

describe("GameServerMessageSchema spectator lifecycle", () => {
  it("validates joined display identity without a type assertion", () => {
    expect(
      GameServerMessageSchema.parse({
        type: "game:spectator_joined",
        spectator: { id: "spectator-user", displayName: "Spectator User" },
      })
    ).toEqual({
      type: "game:spectator_joined",
      spectator: { id: "spectator-user", displayName: "Spectator User" },
    });
    expect(
      GameServerMessageSchema.safeParse({
        type: "game:spectator_joined",
        spectator: { id: "spectator-user" },
      }).success
    ).toBe(false);
  });

  it.each(["DEPARTED", "EJECTED"] as const)(
    "validates a spectator left %s cause without a type assertion",
    (cause) => {
      expect(
        GameServerMessageSchema.parse({
          type: "game:spectator_left",
          spectator: { id: "spectator-user", displayName: "Spectator User" },
          cause,
        })
      ).toEqual({
        type: "game:spectator_left",
        spectator: { id: "spectator-user", displayName: "Spectator User" },
        cause,
      });
    }
  );
});

describe("GameServerMessageSchema visible field power", () => {
  const state = {
    status: "IN_PROGRESS",
    players: [
      {
        leader: { basePower: 5000, effectivePower: 6000, powerDelta: 1000 },
        characters: [{ basePower: 4000, effectivePower: 6000, powerDelta: 0 }, null],
      },
      {
        leader: { basePower: 5000, effectivePower: 5000 },
        characters: [],
      },
    ],
  };

  it("accepts numeric field power and old snapshots without it", () => {
    expect(
      GameServerMessageSchema.safeParse({ type: "game:state", state }).success
    ).toBe(true);
    expect(
      GameServerMessageSchema.safeParse({
        type: "game:state",
        state: {
          ...state,
          players: state.players.map((player) => ({
            leader: {},
            characters: player.characters.map((card) => card && {}),
          })),
        },
      }).success
    ).toBe(true);
    expect(
      GameServerMessageSchema.safeParse({
        type: "game:state",
        state: { status: "IN_PROGRESS", players: [{}, {}] },
      }).success
    ).toBe(true);
  });

  it("rejects non-numeric field power", () => {
    expect(
      GameServerMessageSchema.safeParse({
        type: "game:state",
        state: {
          ...state,
          players: [
            {
              ...state.players[0],
              leader: { basePower: 5000, effectivePower: "6000" },
            },
            state.players[1],
          ],
        },
      }).success
    ).toBe(false);
    expect(
      GameServerMessageSchema.safeParse({
        type: "game:state",
        state: {
          ...state,
          players: [
            {
              ...state.players[0],
              leader: { basePower: 5000, effectivePower: 6000, powerDelta: "1000" },
            },
            state.players[1],
          ],
        },
      }).success
    ).toBe(false);
  });
});

describe("GameServerMessageSchema visible field cost", () => {
  const message = (effectiveCost?: unknown) => ({
    type: "game:state",
    state: {
      status: "IN_PROGRESS",
      players: [
        {
          leader: effectiveCost === undefined ? {} : { effectiveCost },
          characters: [],
        },
        { leader: {}, characters: [] },
      ],
    },
  });

  it("accepts numeric effective cost", () => {
    expect(GameServerMessageSchema.safeParse(message(3)).success).toBe(true);
  });

  it("accepts an absent effective cost", () => {
    expect(GameServerMessageSchema.safeParse(message()).success).toBe(true);
  });

  it("rejects non-numeric effective cost", () => {
    expect(GameServerMessageSchema.safeParse(message("3")).success).toBe(false);
  });
});

describe("GameServerMessageSchema visible hand cost", () => {
  const message = (effectiveCost?: unknown) => ({
    type: "game:state",
    state: {
      status: "IN_PROGRESS",
      players: [
        {
          hand: [effectiveCost === undefined ? {} : { effectiveCost }],
        },
        { hand: [] },
      ],
    },
  });

  it("accepts numeric effective cost", () => {
    expect(GameServerMessageSchema.safeParse(message(3)).success).toBe(true);
  });

  it("accepts an absent effective cost", () => {
    expect(GameServerMessageSchema.safeParse(message()).success).toBe(true);
  });

  it("rejects non-numeric effective cost", () => {
    expect(GameServerMessageSchema.safeParse(message("3")).success).toBe(false);
  });
});
