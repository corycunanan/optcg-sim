import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lobbyFindUniqueMock = vi.fn();
const lobbyUpdateManyMock = vi.fn();
const transactionMock = vi.fn();
const restoreLobbyAfterGameMock = vi.fn();
const finalizeGameResultMock = vi.fn();
const notifyRestoredLobbyMock = vi.fn();
const probeWorkerStatusMock = vi.fn();
const notifyGameMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    lobby: {
      findUnique: (...args: unknown[]) => lobbyFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => lobbyUpdateManyMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/game/finalize", () => ({
  finalizeGameResult: (...args: unknown[]) => finalizeGameResultMock(...args),
  notifyRestoredLobby: (...args: unknown[]) => notifyRestoredLobbyMock(...args),
  restoreLobbyAfterGame: (...args: unknown[]) =>
    restoreLobbyAfterGameMock(...args),
}));
vi.mock("@/lib/game-worker/probe-status", () => ({
  probeWorkerStatus: (...args: unknown[]) => probeWorkerStatusMock(...args),
}));
vi.mock("@/lib/realtime/fanout-game", () => ({
  notifyGame: (...args: unknown[]) => notifyGameMock(...args),
}));

const { lobbyNeedsRepair, repairStrandedLobby, STRANDED_GAME_GRACE_MS } =
  await import("./repair-stranded");

const NOW = new Date("2026-11-27T12:00:00.000Z");

function lobbyRow(overrides: Record<string, unknown> = {}) {
  return {
    status: "IN_GAME",
    mode: "PVP",
    hostUserId: "host",
    guest: { userId: "guest" },
    gameSessions: [
      {
        id: "game-1",
        status: "IN_PROGRESS",
        startedAt: new Date(NOW.getTime() - STRANDED_GAME_GRACE_MS - 1),
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  for (const mock of [
    lobbyFindUniqueMock,
    lobbyUpdateManyMock,
    transactionMock,
    restoreLobbyAfterGameMock,
    finalizeGameResultMock,
    notifyRestoredLobbyMock,
    probeWorkerStatusMock,
    notifyGameMock,
  ]) {
    mock.mockReset();
  }
  transactionMock.mockImplementation((callback: (tx: unknown) => unknown) =>
    callback("tx")
  );
  restoreLobbyAfterGameMock.mockResolvedValue(true);
  lobbyUpdateManyMock.mockResolvedValue({ count: 1 });
  notifyRestoredLobbyMock.mockResolvedValue(undefined);
  notifyGameMock.mockResolvedValue(undefined);
  finalizeGameResultMock.mockResolvedValue({
    finalized: true,
    alreadyFinal: false,
    restoredLobbyId: "lobby-1",
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("lobbyNeedsRepair", () => {
  const base = {
    status: "READY" as const,
    mode: "PVP" as const,
    hostUserId: "host",
    guest: {
      guestReady: false,
      user: { id: "guest", username: null, name: null, image: null },
      deck: null,
    },
    viewerRole: "guest" as const,
  };

  it("flags IN_GAME and seated-WAITING rooms for seated players only", () => {
    expect(lobbyNeedsRepair({ ...base, status: "IN_GAME" })).toBe(true);
    expect(lobbyNeedsRepair({ ...base, status: "WAITING" })).toBe(true);
    expect(lobbyNeedsRepair(base)).toBe(false);
    expect(
      lobbyNeedsRepair({ ...base, status: "WAITING", guest: null })
    ).toBe(false);
    expect(
      lobbyNeedsRepair({ ...base, status: "IN_GAME", viewerRole: "spectator" })
    ).toBe(false);
  });
});

describe("repairStrandedLobby", () => {
  it("restores an IN_GAME room whose latest game is already terminal", async () => {
    lobbyFindUniqueMock.mockResolvedValue(
      lobbyRow({
        gameSessions: [{ id: "game-1", status: "FINISHED", startedAt: NOW }],
      })
    );

    await expect(repairStrandedLobby("lobby-1")).resolves.toBe(true);
    expect(restoreLobbyAfterGameMock).toHaveBeenCalledWith("tx", "lobby-1");
    expect(probeWorkerStatusMock).not.toHaveBeenCalled();
    expect(notifyRestoredLobbyMock).toHaveBeenCalledWith("lobby-1");
  });

  it("restores an IN_GAME room with no game at all", async () => {
    lobbyFindUniqueMock.mockResolvedValue(lobbyRow({ gameSessions: [] }));

    await expect(repairStrandedLobby("lobby-1")).resolves.toBe(true);
    expect(restoreLobbyAfterGameMock).toHaveBeenCalledOnce();
  });

  it("abandons an IN_PROGRESS game whose worker session is gone", async () => {
    lobbyFindUniqueMock.mockResolvedValue(lobbyRow());
    probeWorkerStatusMock.mockResolvedValue({ kind: "ABSENT" });

    await expect(repairStrandedLobby("lobby-1")).resolves.toBe(true);
    expect(finalizeGameResultMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "game-1",
        status: "ABANDONED",
        winnerId: null,
        reasonCode: "UNKNOWN",
      })
    );
    expect(notifyRestoredLobbyMock).toHaveBeenCalledWith("lobby-1");
  });

  it("copies a terminal worker result the app never recorded", async () => {
    lobbyFindUniqueMock.mockResolvedValue(lobbyRow());
    probeWorkerStatusMock.mockResolvedValue({
      kind: "TERMINAL",
      status: "FINISHED",
      winnerId: "host",
      winReason: "Life-out",
    });

    await repairStrandedLobby("lobby-1");

    expect(finalizeGameResultMock).toHaveBeenCalledWith({
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "host",
      winReason: "Life-out",
      reasonCode: null,
    });
  });

  it.each([{ kind: "LIVE" }, { kind: "UNREACHABLE", reason: "AbortError" }])(
    "leaves a $kind game alone",
    async (probe) => {
      lobbyFindUniqueMock.mockResolvedValue(lobbyRow());
      probeWorkerStatusMock.mockResolvedValue(probe);

      await expect(repairStrandedLobby("lobby-1")).resolves.toBe(false);
      expect(finalizeGameResultMock).not.toHaveBeenCalled();
    }
  );

  it("does not probe a game still inside its start grace window", async () => {
    lobbyFindUniqueMock.mockResolvedValue(
      lobbyRow({
        gameSessions: [
          {
            id: "game-1",
            status: "IN_PROGRESS",
            startedAt: new Date(NOW.getTime() - 5_000),
          },
        ],
      })
    );

    await expect(repairStrandedLobby("lobby-1")).resolves.toBe(false);
    expect(probeWorkerStatusMock).not.toHaveBeenCalled();
  });

  it("moves a PVP WAITING room with a seated guest back to READY", async () => {
    lobbyFindUniqueMock.mockResolvedValue(lobbyRow({ status: "WAITING" }));

    await expect(repairStrandedLobby("lobby-1")).resolves.toBe(true);
    expect(lobbyUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "lobby-1",
        status: "WAITING",
        mode: "PVP",
        guest: { is: { userId: "guest" } },
      },
      data: { status: "READY", revision: { increment: 1 } },
    });
  });

  it("leaves healthy rooms untouched", async () => {
    lobbyFindUniqueMock.mockResolvedValue(lobbyRow({ status: "READY" }));

    await expect(repairStrandedLobby("lobby-1")).resolves.toBe(false);
    expect(lobbyUpdateManyMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("never throws into the read path", async () => {
    lobbyFindUniqueMock.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(repairStrandedLobby("lobby-1")).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
