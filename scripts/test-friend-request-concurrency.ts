/**
 * Database-backed proof for OPT-378's unordered pending-request invariant.
 * Run after applying migrations against a disposable development database:
 *   pnpm test:db:friends
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const firstEmail = `opt-378-a-${suffix}@example.test`;
const secondEmail = `opt-378-b-${suffix}@example.test`;

async function main() {
  const [firstUser, secondUser] = await Promise.all([
    prisma.user.create({ data: { email: firstEmail } }),
    prisma.user.create({ data: { email: secondEmail } }),
  ]);

  try {
    const attempts = await Promise.allSettled([
      prisma.friendRequest.create({
        data: { fromUserId: firstUser.id, toUserId: secondUser.id },
      }),
      prisma.friendRequest.create({
        data: { fromUserId: secondUser.id, toUserId: firstUser.id },
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
    const pendingCount = await prisma.friendRequest.count({
      where: {
        status: "PENDING",
        OR: [
          { fromUserId: firstUser.id, toUserId: secondUser.id },
          { fromUserId: secondUser.id, toUserId: firstUser.id },
        ],
      },
    });

    if (
      successes.length !== 1 ||
      conflicts.length !== 1 ||
      pendingCount !== 1
    ) {
      throw new Error(
        `Expected one create, one P2002, and one pending row; got ${successes.length} create(s), ${conflicts.length} P2002(s), and ${pendingCount} pending row(s).`
      );
    }

    console.log("OPT-378 concurrency invariant verified.");
  } finally {
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { fromUserId: firstUser.id, toUserId: secondUser.id },
          { fromUserId: secondUser.id, toUserId: firstUser.id },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [firstUser.id, secondUser.id] } },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
