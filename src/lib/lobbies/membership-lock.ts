import { Prisma } from "@prisma/client";

/**
 * Serialize membership mutations for one lobby.
 *
 * PostgreSQL holds this row lock until the surrounding transaction ends. At
 * READ COMMITTED, later transactions then re-read the lobby after the winner
 * commits, which makes a count-then-insert spectator cap safe.
 */
export async function lockLobbyMembership(
  tx: Prisma.TransactionClient,
  lobbyId: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "lobbies" WHERE "id" = ${lobbyId} FOR UPDATE`
  );
  return rows.length === 1;
}
