import { describe, expect, it, vi, beforeEach } from "vitest";

const updateManyMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      updateMany: (...args: unknown[]) => updateManyMock(...args),
    },
  },
}));

const { finalizeGameResult } = await import("./finalize");

beforeEach(() => {
  updateManyMock.mockReset();
});

describe("finalizeGameResult", () => {
  it("uses a terminal-state guard so duplicate worker callbacks are idempotent", async () => {
    updateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const input = {
      gameId: "game-1",
      status: "FINISHED" as const,
      winnerId: "user-1",
      winReason: "Life-out",
      reasonCode: "LIFE_LOSS" as const,
    };

    await expect(finalizeGameResult(input)).resolves.toEqual({ finalized: true, alreadyFinal: false });
    await expect(finalizeGameResult(input)).resolves.toEqual({ finalized: false, alreadyFinal: true });

    expect(updateManyMock).toHaveBeenCalledTimes(2);
    expect(updateManyMock.mock.calls[0][0].where).toEqual({
      id: "game-1",
      status: { notIn: ["FINISHED", "ABANDONED"] },
    });
  });

  it("treats a worker callback after fallback concede as already final", async () => {
    updateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(finalizeGameResult({
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-2",
      winReason: "Player conceded while disconnected",
      reasonCode: "FALLBACK_CONCEDE",
    })).resolves.toEqual({ finalized: true, alreadyFinal: false });

    await expect(finalizeGameResult({
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-1",
      winReason: "Life-out",
      reasonCode: "LIFE_LOSS",
    })).resolves.toEqual({ finalized: false, alreadyFinal: true });
  });

  it("treats fallback concede after a worker callback as already final", async () => {
    updateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(finalizeGameResult({
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-1",
      winReason: "Deck-out",
      reasonCode: "DECK_OUT",
    })).resolves.toEqual({ finalized: true, alreadyFinal: false });

    await expect(finalizeGameResult({
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-2",
      winReason: "Player conceded while disconnected",
      reasonCode: "FALLBACK_CONCEDE",
    })).resolves.toEqual({ finalized: false, alreadyFinal: true });
  });

  it("infers a reason code when the caller omits one", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 1 });

    await finalizeGameResult({
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-1",
      winReason: "Player 2 decked out",
    });

    expect(updateManyMock.mock.calls[0][0].data.reasonCode).toBe("DECK_OUT");
  });
});
