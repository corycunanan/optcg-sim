import { prisma } from "@/lib/db";

/** The same deterministic active-game lookup gates resolver and join paths. */
export async function findActiveGameLobby(userId: string) {
  return prisma.gameSession.findFirst({
    where: {
      status: "IN_PROGRESS",
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    select: { lobbyId: true },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
  });
}
