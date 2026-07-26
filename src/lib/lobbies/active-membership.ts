import type { Prisma } from "@prisma/client";

export class ActiveLobbyConflictError extends Error {
  constructor() {
    super("User already belongs to an active lobby");
    this.name = "ActiveLobbyConflictError";
  }
}

export async function claimActiveLobby(
  tx: Prisma.TransactionClient,
  userId: string,
  lobbyId: string
) {
  const claim = () =>
    tx.user.updateMany({
      where: { id: userId, activeLobbyId: null },
      data: { activeLobbyId: lobbyId },
    });

  const claimed = await claim();
  if (claimed.count === 1) return;

  const current = await tx.user.findUnique({
    where: { id: userId },
    select: {
      activeLobbyId: true,
      activeLobby: {
        select: {
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

  const pointedLobby = current?.activeLobby;
  const pointerIsStale =
    current?.activeLobbyId !== null &&
    current?.activeLobbyId !== undefined &&
    (!pointedLobby ||
      pointedLobby.status === "CLOSED" ||
      (pointedLobby.hostUserId !== userId &&
        pointedLobby.guest?.userId !== userId &&
        pointedLobby.spectators.length === 0));

  if (pointerIsStale && current?.activeLobbyId) {
    const cleared = await tx.user.updateMany({
      where: { id: userId, activeLobbyId: current.activeLobbyId },
      data: { activeLobbyId: null },
    });

    if (cleared.count === 1) {
      const retried = await claim();
      if (retried.count === 1) return;
    }
  }

  throw new ActiveLobbyConflictError();
}

export async function releaseActiveLobby(
  tx: Prisma.TransactionClient,
  userId: string,
  lobbyId: string
) {
  return tx.user.updateMany({
    where: { id: userId, activeLobbyId: lobbyId },
    data: { activeLobbyId: null },
  });
}

/** Release every active-lobby pointer in deterministic user-id lock order. */
export async function releaseActiveLobbyMembers(
  tx: Prisma.TransactionClient,
  lobbyId: string
) {
  const members = await tx.user.findMany({
    where: { activeLobbyId: lobbyId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const orderedMembers = [...members].sort((a, b) => a.id.localeCompare(b.id));

  for (const { id: userId } of orderedMembers) {
    await releaseActiveLobby(tx, userId, lobbyId);
  }
  return orderedMembers.map(({ id }) => id);
}
