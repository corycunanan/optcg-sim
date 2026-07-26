import { describe, expect, it } from "vitest";
import {
  GameServerMessageSchema,
  RealtimeServerEventSchema,
} from "./realtime";

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
