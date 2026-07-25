import { describe, expect, it } from "vitest";
import { RealtimeServerEventSchema } from "./realtime";

describe("RealtimeServerEventSchema spectator removal", () => {
  it.each(["SPECTATING_DISABLED", "REMOVED_BY_HOST"] as const)(
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
