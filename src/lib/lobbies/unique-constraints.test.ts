import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  isLobbyGuestCollision,
  isLobbySpectatorCollision,
} from "./unique-constraints";

function uniqueError(target: string | string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

describe("lobby membership unique constraints", () => {
  it("recognizes the guest seat unique constraint", () => {
    expect(isLobbyGuestCollision(uniqueError(["lobbyId"]))).toBe(true);
    expect(isLobbyGuestCollision(uniqueError(["userId"]))).toBe(false);
  });

  it("recognizes mapped and Prisma-field spectator constraints", () => {
    expect(
      isLobbySpectatorCollision(uniqueError(["lobby_id", "user_id"]))
    ).toBe(true);
    expect(isLobbySpectatorCollision(uniqueError(["lobbyId", "userId"]))).toBe(
      true
    );
    expect(
      isLobbySpectatorCollision(
        uniqueError("lobby_spectators_lobby_id_user_id_key")
      )
    ).toBe(true);
  });

  it("does not confuse another user uniqueness violation with spectators", () => {
    expect(isLobbySpectatorCollision(uniqueError(["userId"]))).toBe(false);
    expect(isLobbySpectatorCollision(new Error("P2002"))).toBe(false);
  });
});
