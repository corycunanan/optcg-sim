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

const playerIdentities = {
  player1: { username: "luffy", name: "Monkey D. Luffy" },
  player2: { username: "zoro", name: "Roronoa Zoro" },
};

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
    player1: { select: { username: true, name: true } },
    player2: { select: { username: true, name: true } },
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

describe("/game/[id] spectator admission and retention", () => {
  it("passes a resolved player role to the board loader", async () => {
    gameSessionFindFirstMock.mockResolvedValue({
      mode: "PVP",
      player1Id: "viewer-1",
      player2Id: "player-2",
      ...playerIdentities,
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
      ...playerIdentities,
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
        ...playerIdentities,
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
        playerDisplayNames: ["luffy", "zoro"],
      });
    }
  );

  it.each(["FINISHED", "ABANDONED"] as const)(
    "deliberately keeps an admitted spectator on a %s board",
    async (status) => {
      gameSessionFindFirstMock.mockResolvedValue({
        mode: "PVP",
        status,
        player1Id: "player-1",
        player2Id: "player-2",
        ...playerIdentities,
        lobby: { hostUserId: "player-1" },
      });

      const result = await renderGamePage();

      expect(gameSessionFindFirstMock).toHaveBeenCalledWith(
        expectedAdmissionQuery
      );
      expect(result.props).toMatchObject({
        viewerRole: "spectator",
        bottomPlayerIndex: 0,
      });
      expect(redirectMock).not.toHaveBeenCalled();
    }
  );

  it("uses username, then name, then player-number fallbacks", async () => {
    gameSessionFindFirstMock.mockResolvedValue({
      mode: "PVP",
      player1Id: "player-1",
      player2Id: "player-2",
      player1: { username: null, name: "Monkey D. Luffy" },
      player2: { username: null, name: null },
      lobby: { hostUserId: "player-1" },
    });

    const result = await renderGamePage();

    expect(result.props.playerDisplayNames).toEqual([
      "Monkey D. Luffy",
      "Player 2",
    ]);
  });

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
