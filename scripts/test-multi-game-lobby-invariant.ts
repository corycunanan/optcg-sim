import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  ActiveLobbyConflictError,
  claimActiveLobby,
} from "../src/lib/lobbies/active-membership";

const REQUIRED_DEV_HOST = "ep-aged-base-a45y6qrm";
const databaseUrl = process.env.DATABASE_URL;

if (
  !databaseUrl ||
  !new URL(databaseUrl).hostname.includes(REQUIRED_DEV_HOST)
) {
  throw new Error("Refusing to run outside the OPTCG dev Neon branch");
}

class RollbackAcceptanceEvidence extends Error {}

async function main() {
  const prisma = new PrismaClient();
  const marker = randomUUID();
  const createdLobbyIds: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      const [host, guest, secondHost] = await Promise.all([
        tx.user.create({ data: { name: `OPT-518 host ${marker}` } }),
        tx.user.create({ data: { name: `OPT-518 guest ${marker}` } }),
        tx.user.create({ data: { name: `OPT-518 second host ${marker}` } }),
      ]);

      const firstLobby = await tx.lobby.create({
        data: {
          hostUserId: host.id,
          joinCode: randomUUID(),
          status: "READY",
        },
      });
      createdLobbyIds.push(firstLobby.id);
      await claimActiveLobby(tx, host.id, firstLobby.id);
      await tx.lobbyGuest.create({
        data: { lobbyId: firstLobby.id, userId: guest.id },
      });
      await claimActiveLobby(tx, guest.id, firstLobby.id);

      await tx.gameSession.createMany({
        data: [
          {
            lobbyId: firstLobby.id,
            player1Id: host.id,
            player2Id: guest.id,
            player1DeckId: "opt-518-host-deck-1",
            player2DeckId: "opt-518-guest-deck-1",
            format: "Standard",
            status: "FINISHED",
          },
          {
            lobbyId: firstLobby.id,
            player1Id: host.id,
            player2Id: guest.id,
            player1DeckId: "opt-518-host-deck-2",
            player2DeckId: "opt-518-guest-deck-2",
            format: "Standard",
            status: "IN_PROGRESS",
          },
        ],
      });

      const secondLobby = await tx.lobby.create({
        data: {
          hostUserId: secondHost.id,
          joinCode: randomUUID(),
        },
      });
      createdLobbyIds.push(secondLobby.id);
      await claimActiveLobby(tx, secondHost.id, secondLobby.id);

      let conflict: string | null = null;
      try {
        await claimActiveLobby(tx, guest.id, secondLobby.id);
      } catch (error) {
        if (!(error instanceof ActiveLobbyConflictError)) throw error;
        conflict = error.name;
      }

      const gameSessionCount = await tx.gameSession.count({
        where: { lobbyId: firstLobby.id },
      });

      if (gameSessionCount !== 2 || conflict !== "ActiveLobbyConflictError") {
        throw new Error("OPT-518 acceptance assertions failed");
      }

      console.log(
        JSON.stringify({
          lobbyId: firstLobby.id,
          gameSessionCount,
          secondActiveLobbyClaim: "rejected",
          error: conflict,
        }),
      );

      throw new RollbackAcceptanceEvidence();
    });
  } catch (error) {
    if (!(error instanceof RollbackAcceptanceEvidence)) throw error;
  } finally {
    const remainingRows = await prisma.lobby.count({
      where: { id: { in: createdLobbyIds } },
    });
    await prisma.$disconnect();

    if (remainingRows !== 0) {
      throw new Error("OPT-518 acceptance rows were not rolled back");
    }
    console.log(JSON.stringify({ cleanup: "verified", remainingRows }));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
