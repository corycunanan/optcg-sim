import { describe, expect, it, vi } from "vitest";
import { notifyGame } from "./fanout-game";

const baseDeps = {
  workerUrl: "https://worker.example",
  workerSecret: "secret-123",
};

function makePrisma(game: { player1Id: string; player2Id: string } | null) {
  return {
    gameSession: {
      findUnique: vi.fn().mockResolvedValue(game),
    },
  };
}

describe("notifyGame", () => {
  it("notifies both players on a PVP finalization", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const prisma = makePrisma({ player1Id: "alice", player2Id: "bob" });

    await notifyGame(
      "game-1",
      { status: "FINISHED", winnerId: "alice", winReason: "Life-out" },
      { prisma, deps: { ...baseDeps, fetch: fetchMock } },
    );

    expect(prisma.gameSession.findUnique).toHaveBeenCalledWith({
      where: { id: "game-1" },
      select: { player1Id: true, player2Id: true },
    });
    const recipients = fetchMock.mock.calls.map(([url]) => url);
    expect(recipients).toEqual([
      "https://worker.example/user/alice/notify",
      "https://worker.example/user/bob/notify",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        type: "game:status",
        gameId: "game-1",
        status: "FINISHED",
        winnerId: "alice",
        winReason: "Life-out",
      });
    }
  });

  it("dedupes recipients in Solitaire (player1Id === player2Id)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const prisma = makePrisma({ player1Id: "solo", player2Id: "solo" });

    await notifyGame(
      "game-2",
      { status: "FINISHED", winnerId: "solo", winReason: "Decked out" },
      { prisma, deps: { ...baseDeps, fetch: fetchMock } },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://worker.example/user/solo/notify",
    );
  });

  it("is a no-op when the game session is missing", async () => {
    const fetchMock = vi.fn();
    const prisma = makePrisma(null);

    await notifyGame(
      "ghost-game",
      { status: "ABANDONED", winnerId: null, winReason: null },
      { prisma, deps: { ...baseDeps, fetch: fetchMock } },
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards null winnerId / winReason verbatim (draw / abandoned)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const prisma = makePrisma({ player1Id: "alice", player2Id: "bob" });

    await notifyGame(
      "game-3",
      { status: "ABANDONED", winnerId: null, winReason: null },
      { prisma, deps: { ...baseDeps, fetch: fetchMock } },
    );

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.winnerId).toBeNull();
    expect(body.winReason).toBeNull();
    expect(body.status).toBe("ABANDONED");
  });
});
