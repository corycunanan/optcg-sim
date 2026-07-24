import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.fn();
const gameSessionUpdateManyMock = vi.fn();
const gameSessionFindUniqueOrThrowMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const lobbyGuestUpdateManyMock = vi.fn();
const buildLobbyRoomStateMock = vi.fn();
const notifyLobbyMock = vi.fn();

const tx = {
  gameSession: {
    updateMany: (...args: unknown[]) => gameSessionUpdateManyMock(...args),
    findUniqueOrThrow: (...args: unknown[]) =>
      gameSessionFindUniqueOrThrowMock(...args),
  },
  lobby: {
    updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args),
  },
  lobbyGuest: {
    updateMany: (...args: unknown[]) => lobbyGuestUpdateManyMock(...args),
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/lobbies/build-state", () => ({
  buildLobbyRoomState: (...args: unknown[]) => buildLobbyRoomStateMock(...args),
}));
vi.mock("@/lib/realtime/fanout-lobby", () => ({
  notifyLobby: (...args: unknown[]) => notifyLobbyMock(...args),
}));

const { finalizeGameResult, notifyRestoredLobby } = await import("./finalize");

beforeEach(() => {
  transactionMock.mockReset();
  gameSessionUpdateManyMock.mockReset();
  gameSessionFindUniqueOrThrowMock.mockReset();
  lobbyUpdateManyMock.mockReset();
  lobbyGuestUpdateManyMock.mockReset();
  buildLobbyRoomStateMock.mockReset();
  notifyLobbyMock.mockReset();

  transactionMock.mockImplementation(
    (callback: (client: typeof tx) => unknown) => callback(tx)
  );
  gameSessionUpdateManyMock.mockResolvedValue({ count: 1 });
  gameSessionFindUniqueOrThrowMock.mockResolvedValue({ lobbyId: "lobby-1" });
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  lobbyGuestUpdateManyMock.mockResolvedValue({ count: 1 });
});

describe("finalizeGameResult", () => {
  it("atomically finalizes a normal win and restores the shared party", async () => {
    await expect(
      finalizeGameResult({
        gameId: "game-1",
        status: "FINISHED",
        winnerId: "user-1",
        winReason: "Life-out",
        reasonCode: "LIFE_LOSS",
      })
    ).resolves.toEqual({
      finalized: true,
      alreadyFinal: false,
      restoredLobbyId: "lobby-1",
    });

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(gameSessionUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "game-1",
        status: { notIn: ["FINISHED", "ABANDONED"] },
      },
      data: expect.objectContaining({
        status: "FINISHED",
        winnerId: "user-1",
        winReason: "Life-out",
        reasonCode: "LIFE_LOSS",
      }),
    });
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lobby-1", status: "IN_GAME" },
      data: {
        status: "WAITING",
        hostReady: false,
        revision: { increment: 1 },
      },
    });
    expect(lobbyGuestUpdateManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1" },
      data: { guestReady: false },
    });
  });

  it("restores the lobby for an abandonment timeout", async () => {
    await finalizeGameResult({
      gameId: "game-1",
      status: "ABANDONED",
      winnerId: null,
      winReason: "Both players failed to rejoin in time",
    });

    expect(gameSessionUpdateManyMock.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        status: "ABANDONED",
        winnerId: null,
        reasonCode: "DISCONNECT_TIMEOUT",
      })
    );
    expect(lobbyUpdateManyMock).toHaveBeenCalledOnce();
    expect(lobbyGuestUpdateManyMock).toHaveBeenCalledOnce();
  });

  it("keeps a host-only lobby waiting when no guest seat remains", async () => {
    lobbyGuestUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    await expect(
      finalizeGameResult({
        gameId: "game-1",
        status: "FINISHED",
        winnerId: "user-1",
        winReason: "Player 2 failed to rejoin in time",
      })
    ).resolves.toEqual({
      finalized: true,
      alreadyFinal: false,
      restoredLobbyId: "lobby-1",
    });

    expect(lobbyGuestUpdateManyMock).toHaveBeenCalledOnce();
  });

  it("does not reopen a lobby already closed by leave or disband rules", async () => {
    lobbyUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    await expect(
      finalizeGameResult({
        gameId: "game-1",
        status: "FINISHED",
        winnerId: "user-1",
        winReason: "Player 2 conceded",
      })
    ).resolves.toEqual({
      finalized: true,
      alreadyFinal: false,
      restoredLobbyId: null,
    });
    expect(lobbyGuestUpdateManyMock).not.toHaveBeenCalled();
  });

  it("uses the terminal-state guard so duplicate callbacks reset once", async () => {
    gameSessionUpdateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const input = {
      gameId: "game-1",
      status: "FINISHED" as const,
      winnerId: "user-2",
      winReason: "Player conceded while disconnected",
      reasonCode: "FALLBACK_CONCEDE" as const,
    };

    await expect(finalizeGameResult(input)).resolves.toEqual({
      finalized: true,
      alreadyFinal: false,
      restoredLobbyId: "lobby-1",
    });
    await expect(finalizeGameResult(input)).resolves.toEqual({
      finalized: false,
      alreadyFinal: true,
      restoredLobbyId: null,
    });

    expect(lobbyUpdateManyMock).toHaveBeenCalledOnce();
    expect(lobbyGuestUpdateManyMock).toHaveBeenCalledOnce();
  });

  it("infers a reason code when the caller omits one", async () => {
    await finalizeGameResult({
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-1",
      winReason: "Player 2 decked out",
    });

    expect(gameSessionUpdateManyMock.mock.calls[0][0].data.reasonCode).toBe(
      "DECK_OUT"
    );
  });
});

describe("notifyRestoredLobby", () => {
  it("fans the fresh WAITING state out to every remaining party member", async () => {
    const state = { id: "lobby-1", status: "WAITING" };
    buildLobbyRoomStateMock.mockResolvedValueOnce(state);
    notifyLobbyMock.mockResolvedValueOnce(undefined);

    await notifyRestoredLobby("lobby-1");

    expect(buildLobbyRoomStateMock).toHaveBeenCalledWith("lobby-1");
    expect(notifyLobbyMock).toHaveBeenCalledWith(state);
  });

  it("skips fanout if the lobby was deleted", async () => {
    buildLobbyRoomStateMock.mockResolvedValueOnce(null);

    await notifyRestoredLobby("lobby-1");

    expect(notifyLobbyMock).not.toHaveBeenCalled();
  });
});
