/**
 * Database-backed proof that accept and cancel use the same lobby→invite
 * lock order. Creates isolated rows and removes only those rows afterward.
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

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
  if (!process.env.DATABASE_URL) {
    console.log("SKIPPED: DATABASE_URL is not configured.");
    return;
  }

  let hostId: string | null = null;
  let inviteeId: string | null = null;
  let lobbyId: string | null = null;
  let runError: unknown = null;

  try {
    await Promise.all([prisma.$connect(), cancelPrisma.$connect()]);

    const host = await prisma.user.create({
      data: { email: `opt-524-host-${suffix}@example.test` },
    });
    hostId = host.id;
    const invitee = await prisma.user.create({
      data: { email: `opt-524-invitee-${suffix}@example.test` },
    });
    inviteeId = invitee.id;

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

    const accept = prisma
      .$transaction(async (tx) => {
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
        if (inviteUpdate.count !== 1) {
          throw new Error("Accept lost invite lock");
        }
        return "accepted" as const;
      })
      .then((result) => result);

    await acceptHasLobbyLock.promise;

    const cancel = cancelPrisma
      .$transaction(async (tx) => {
        // PrismaPromise queries are lazy. Attaching the continuation starts
        // the row-lock request before we tell accept to release its lock.
        const lobbyLockInFlight = tx.lobby
          .updateMany({
            where: { id: lobby.id, status: "WAITING" },
            data: { status: "WAITING" },
          })
          .then((result) => result);
        cancelIsWaitingForLobby.resolve();

        const lobbyLock = await lobbyLockInFlight;
        if (lobbyLock.count !== 1) return "lobby_changed" as const;

        await tx.lobbyInvite.updateMany({
          where: { id: invite.id, status: "PENDING" },
          data: { status: "CANCELED" },
        });
        return "canceled" as const;
      })
      .then((result) => result);

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
  } catch (error) {
    runError = error;
  } finally {
    try {
      if (lobbyId) {
        await prisma.lobby.deleteMany({ where: { id: lobbyId } });
      }
      const userIds = [hostId, inviteeId].filter(
        (id): id is string => id !== null
      );
      if (userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } catch (cleanupError) {
      if (!runError) runError = cleanupError;
    }
  }

  if (runError) throw runError;
}

function isDatabaseUnavailable(error: unknown) {
  const unavailableCodes = new Set(["P1001", "P1002", "P1017"]);
  return (
    (error instanceof Prisma.PrismaClientInitializationError &&
      error.errorCode !== undefined &&
      unavailableCodes.has(error.errorCode)) ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      unavailableCodes.has(error.code))
  );
}

main()
  .catch((error) => {
    if (isDatabaseUnavailable(error)) {
      console.log(
        `SKIPPED: development database is unreachable (${error.code ?? error.errorCode}).`
      );
      return;
    }
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([
      prisma.$disconnect(),
      cancelPrisma.$disconnect(),
    ]);
  });
