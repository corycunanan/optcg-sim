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
  lobbyId: string,
) {
  const claimed = await tx.user.updateMany({
    where: { id: userId, activeLobbyId: null },
    data: { activeLobbyId: lobbyId },
  });

  if (claimed.count !== 1) {
    throw new ActiveLobbyConflictError();
  }
}

export async function releaseActiveLobby(
  tx: Prisma.TransactionClient,
  userId: string,
  lobbyId: string,
) {
  return tx.user.updateMany({
    where: { id: userId, activeLobbyId: lobbyId },
    data: { activeLobbyId: null },
  });
}
