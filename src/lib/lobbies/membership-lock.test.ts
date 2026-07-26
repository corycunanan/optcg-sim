import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { lockLobbyMemberships } from "./membership-lock";

function lockingClient(acquired: string[]) {
  return {
    $queryRaw: vi.fn(async (query: { values: unknown[] }) => {
      const lobbyId = query.values[0] as string;
      acquired.push(lobbyId);
      return [{ id: lobbyId }];
    }),
  } as unknown as Prisma.TransactionClient;
}

describe("lockLobbyMemberships", () => {
  it.each([
    ["lobby-a", "lobby-b"],
    ["lobby-b", "lobby-a"],
  ])("locks the A/B switch %s -> %s in canonical order", async (from, to) => {
    const acquired: string[] = [];

    await expect(
      lockLobbyMemberships(lockingClient(acquired), [to, from])
    ).resolves.toBe(true);

    expect(acquired).toEqual(["lobby-a", "lobby-b"]);
  });
});
