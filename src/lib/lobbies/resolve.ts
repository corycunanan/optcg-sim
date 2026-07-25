import { prisma } from "@/lib/db";
import { generateLobbyCode } from "@/lib/lobbies";
import {
  ActiveLobbyConflictError,
  claimActiveLobby,
} from "./active-membership";
import { findActiveGameLobby } from "./active-game";
import { isJoinCodeCollision } from "./unique-constraints";

const MAX_JOIN_CODE_ATTEMPTS = 5;

export type LobbyResolutionBranch = "active_game" | "membership" | "created";

export interface LobbyResolution {
  lobbyId: string;
  branch: LobbyResolutionBranch;
}

/**
 * Resolve the canonical party room for Play navigation.
 *
 * An active game wins over the membership pointer so a stale or concurrently
 * changing pointer can never hide a rejoinable game. Otherwise the OPT-518
 * pointer is the membership fast path. Creation and pointer claim share one
 * transaction, so a losing first-visit race rolls back its lobby row before
 * refetching the winner's membership.
 */
export async function resolveCanonicalLobby(
  userId: string
): Promise<LobbyResolution> {
  const activeGame = await findActiveGameLobby(userId);

  if (activeGame) {
    const spectator = await prisma.lobbySpectator.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (spectator) {
      throw new Error(
        "Active lobby invariant violated: a player cannot also be a spectator"
      );
    }
    return { lobbyId: activeGame.lobbyId, branch: "active_game" };
  }

  const activeLobbyId = await findActiveLobbyMembership(userId);
  if (activeLobbyId) {
    return { lobbyId: activeLobbyId, branch: "membership" };
  }

  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    try {
      const lobby = await prisma.$transaction(async (tx) => {
        const created = await tx.lobby.create({
          data: {
            hostUserId: userId,
            hostDeckId: null,
            format: "Standard",
            mode: "PVP",
            joinCode: generateLobbyCode(),
          },
        });
        await claimActiveLobby(tx, userId, created.id);
        return created;
      });

      return { lobbyId: lobby.id, branch: "created" };
    } catch (error) {
      if (isJoinCodeCollision(error)) continue;

      if (error instanceof ActiveLobbyConflictError) {
        const racedLobbyId = await findActiveLobbyMembership(userId);
        if (racedLobbyId) {
          return { lobbyId: racedLobbyId, branch: "membership" };
        }
      }

      throw error;
    }
  }

  throw new Error("Failed to generate unique lobby code");
}

async function findActiveLobbyMembership(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      activeLobbyId: true,
      activeLobby: {
        select: {
          id: true,
          status: true,
          hostUserId: true,
          guest: { select: { userId: true } },
          spectators: {
            where: { userId },
            select: { userId: true },
          },
        },
      },
    },
  });

  const lobby = user?.activeLobby;
  if (!user?.activeLobbyId || !lobby || lobby.status === "CLOSED") return null;

  const isMember =
    lobby.hostUserId === userId ||
    lobby.guest?.userId === userId ||
    lobby.spectators.length > 0;
  return isMember ? lobby.id : null;
}
