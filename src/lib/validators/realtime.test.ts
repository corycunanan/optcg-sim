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
