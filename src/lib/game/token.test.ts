import { describe, expect, it } from "vitest";
import { mintGameToken } from "./token";

function decodePayload(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

describe("mintGameToken", () => {
  it("signs the spectator role without a playerIndex claim", async () => {
    const token = await mintGameToken("spectator-1", "test-secret", {
      gameId: "game-1",
      jti: "spectator-token",
      now: 1_000,
      role: "spectator",
    });

    expect(decodePayload(token)).toEqual({
      sub: "spectator-1",
      iat: 1_000,
      exp: 1_300,
      jti: "spectator-token",
      gameId: "game-1",
      role: "spectator",
    });
  });

  it("refuses to sign a spectator token with playerIndex", async () => {
    await expect(
      mintGameToken("spectator-1", "test-secret", {
        gameId: "game-1",
        role: "spectator",
        playerIndex: 0,
      }),
    ).rejects.toThrow("Spectator game tokens cannot include playerIndex");
  });
});
