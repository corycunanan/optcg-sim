import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const redirectMock = vi.fn();
const gameSessionFindFirstMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findFirst: (...args: unknown[]) => gameSessionFindFirstMock(...args),
    },
  },
}));
vi.mock("./game-board-loader", () => ({
  GameBoardLoader: () => null,
}));

const GamePage = (await import("./page")).default;

const expectedAdmissionQuery = {
  where: {
    id: "game-1",
    OR: [
      { player1Id: "viewer-1" },
      { player2Id: "viewer-1" },
      {
        AND: [
          { player1Id: { not: "viewer-1" } },
          { player2Id: { not: "viewer-1" } },
          {
            lobby: {
              allowSpectators: true,
              spectators: { some: { userId: "viewer-1" } },
            },
          },
        ],
      },
    ],
  },
  select: {
    mode: true,
    player1Id: true,
    player2Id: true,
    lobby: { select: { hostUserId: true } },
  },
};

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockReset();
  gameSessionFindFirstMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "viewer-1" } });
  redirectMock.mockImplementation((destination: string) => {
    throw new Error(`redirect:${destination}`);
  });
});

function renderGamePage() {
  return GamePage({
    params: Promise.resolve({ id: "game-1" }),
    searchParams: Promise.resolve({}),
  });
}

describe("/game/[id] spectator admission", () => {
  it("passes a resolved player role to the board loader", async () => {
    gameSessionFindFirstMock.mockResolvedValue({
      mode: "PVP",
      player1Id: "viewer-1",
      player2Id: "player-2",
      lobby: { hostUserId: "viewer-1" },
    });

    const result = await renderGamePage();

    expect(result.props).toMatchObject({
      gameId: "game-1",
      gameMode: "PVP",
      viewerRole: "player",
    });
    expect(result.props.bottomPlayerIndex).toBeUndefined();
  });

  it("keeps player 2 seated instead of assigning the spectator role", async () => {
    gameSessionFindFirstMock.mockResolvedValue({
      mode: "PVP",
      player1Id: "player-1",
      player2Id: "viewer-1",
      lobby: { hostUserId: "player-1" },
    });

    const result = await renderGamePage();

    expect(result.props.viewerRole).toBe("player");
    expect(result.props.bottomPlayerIndex).toBeUndefined();
  });

  it.each([
    ["player 1", "player-1", 0],
    ["player 2", "player-2", 1],
  ] as const)(
    "admits a same-lobby spectator with the host in %s at the bottom",
    async (_label, hostUserId, expectedBottomPlayerIndex) => {
      gameSessionFindFirstMock.mockResolvedValue({
        mode: "PVP",
        player1Id: "player-1",
        player2Id: "player-2",
        lobby: { hostUserId },
      });

      const result = await renderGamePage();

      expect(gameSessionFindFirstMock).toHaveBeenCalledWith(
        expectedAdmissionQuery
      );
      expect(result.props).toMatchObject({
        gameId: "game-1",
        gameMode: "PVP",
        viewerRole: "spectator",
        bottomPlayerIndex: expectedBottomPlayerIndex,
      });
    }
  );

  it.each([
    "no LobbySpectator row",
    "a LobbySpectator row for a different lobby",
    "allowSpectators disabled",
    "a removed LobbySpectator row",
  ])("redirects to /lobbies for %s", async () => {
    gameSessionFindFirstMock.mockResolvedValue(null);

    await expect(renderGamePage()).rejects.toThrow("redirect:/lobbies");
    expect(gameSessionFindFirstMock).toHaveBeenCalledWith(
      expectedAdmissionQuery
    );
  });
});
