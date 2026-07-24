/**
 * Database-backed proof that accept and cancel use the same lobby→invite
 * lock order. Creates isolated rows and removes only those rows afterward.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const cancelPrisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function main() {
  const [host, invitee] = await Promise.all([
    prisma.user.create({
      data: { email: `opt-524-host-${suffix}@example.test` },
    }),
    prisma.user.create({
      data: { email: `opt-524-invitee-${suffix}@example.test` },
    }),
  ]);
  let lobbyId: string | null = null;

  try {
    const lobby = await prisma.lobby.create({
      data: {
        hostUserId: host.id,
        joinCode: `I${suffix}`.slice(0, 32),
      },
    });
    lobbyId = lobby.id;
    const invite = await prisma.lobbyInvite.create({
      data: {
        lobbyId: lobby.id,
        fromUserId: host.id,
        toUserId: invitee.id,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const acceptHasLobbyLock = deferred();
    const cancelIsWaitingForLobby = deferred();

    const accept = prisma.$transaction(async (tx) => {
      const lobbyUpdate = await tx.lobby.updateMany({
        where: { id: lobby.id, status: "WAITING" },
        data: { status: "READY", revision: { increment: 1 } },
      });
      if (lobbyUpdate.count !== 1) throw new Error("Accept lost lobby lock");

      acceptHasLobbyLock.resolve();
      await cancelIsWaitingForLobby.promise;

      const inviteUpdate = await tx.lobbyInvite.updateMany({
        where: { id: invite.id, status: "PENDING" },
        data: { status: "ACCEPTED" },
      });
      if (inviteUpdate.count !== 1) throw new Error("Accept lost invite lock");
      return "accepted" as const;
    });

    await acceptHasLobbyLock.promise;

    const cancel = cancelPrisma.$transaction(async (tx) => {
      const lobbyLockPromise = tx.lobby.updateMany({
        where: { id: lobby.id, status: "WAITING" },
        data: { status: "WAITING" },
      });
      cancelIsWaitingForLobby.resolve();

      const lobbyLock = await lobbyLockPromise;
      if (lobbyLock.count !== 1) return "lobby_changed" as const;

      await tx.lobbyInvite.updateMany({
        where: { id: invite.id, status: "PENDING" },
        data: { status: "CANCELED" },
      });
      return "canceled" as const;
    });

    const [acceptResult, cancelResult] = await Promise.all([accept, cancel]);
    const [storedLobby, storedInvite] = await Promise.all([
      prisma.lobby.findUniqueOrThrow({ where: { id: lobby.id } }),
      prisma.lobbyInvite.findUniqueOrThrow({ where: { id: invite.id } }),
    ]);

    if (
      acceptResult !== "accepted" ||
      cancelResult !== "lobby_changed" ||
      storedLobby.status !== "READY" ||
      storedInvite.status !== "ACCEPTED"
    ) {
      throw new Error(
        `Unexpected interleaving result: ${acceptResult}/${cancelResult}, ${storedLobby.status}/${storedInvite.status}`
      );
    }

    console.log("OPT-524 accept-vs-cancel lock ordering verified.");
  } finally {
    if (lobbyId) {
      await prisma.lobby.deleteMany({ where: { id: lobbyId } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [host.id, invitee.id] } },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() =>
    Promise.all([prisma.$disconnect(), cancelPrisma.$disconnect()])
  );
