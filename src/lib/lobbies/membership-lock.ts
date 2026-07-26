import { Prisma } from "@prisma/client";

/**
 * Serialize membership mutations for one lobby.
 *
 * PostgreSQL holds this row lock until the surrounding transaction ends. At
 * READ COMMITTED, later transactions then re-read the lobby after the winner
 * commits, which makes a count-then-insert spectator cap safe.
 *
 * Canonical ordering invariant: any transaction locking multiple lobbies must
 * acquire them in ascending lobby-id order. Any transaction locking multiple
 * users must acquire them in ascending userId order. This prevents switch and
 * bulk-membership paths from creating lock-order cycles.
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

export async function lockLobbyMemberships(
  tx: Prisma.TransactionClient,
  lobbyIds: readonly string[]
): Promise<boolean> {
  const orderedLobbyIds = Array.from(new Set(lobbyIds)).sort((a, b) =>
    a.localeCompare(b)
  );

  for (const lobbyId of orderedLobbyIds) {
    if (!(await lockLobbyMembership(tx, lobbyId))) return false;
  }
  return true;
}
