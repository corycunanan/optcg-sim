/**
 * Database-backed proof for OPT-381's one-WAITING-lobby-per-host invariant.
 * Run after applying migrations against a disposable development database:
 *   pnpm test:db:lobbies
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const email = `opt-381-${suffix}@example.test`;

async function main() {
  const user = await prisma.user.create({ data: { email } });

  try {
    const attempts = await Promise.allSettled([
      prisma.lobby.create({
        data: { hostUserId: user.id, joinCode: `A${suffix}`.slice(0, 32) },
      }),
      prisma.lobby.create({
        data: { hostUserId: user.id, joinCode: `B${suffix}`.slice(0, 32) },
      }),
    ]);

    const successes = attempts.filter(
      (attempt) => attempt.status === "fulfilled"
    );
    const conflicts = attempts.filter(
      (attempt) =>
        attempt.status === "rejected" &&
        attempt.reason instanceof Prisma.PrismaClientKnownRequestError &&
        attempt.reason.code === "P2002"
    );
    const waitingCount = await prisma.lobby.count({
      where: { hostUserId: user.id, status: "WAITING" },
    });

    if (
      successes.length !== 1 ||
      conflicts.length !== 1 ||
      waitingCount !== 1
    ) {
      throw new Error(
        `Expected one create, one P2002, and one WAITING lobby; got ${successes.length} create(s), ${conflicts.length} P2002(s), and ${waitingCount} WAITING lobby/lobbies.`
      );
    }

    console.log("OPT-381 concurrency invariant verified.");
  } finally {
    await prisma.lobby.deleteMany({ where: { hostUserId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
