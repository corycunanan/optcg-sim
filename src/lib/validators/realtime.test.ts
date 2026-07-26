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
  it.each(["game:spectator_joined", "game:spectator_left"] as const)(
    "validates %s display identity without a type assertion",
    (type) => {
      expect(
        GameServerMessageSchema.parse({
          type,
          spectator: { id: "spectator-user", displayName: "Spectator User" },
        })
      ).toEqual({
        type,
        spectator: { id: "spectator-user", displayName: "Spectator User" },
      });
      expect(
        GameServerMessageSchema.safeParse({
          type,
          spectator: { id: "spectator-user" },
        }).success
      ).toBe(false);
    }
  );
});
