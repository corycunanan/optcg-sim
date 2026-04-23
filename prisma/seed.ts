/**
 * Seed — local dev test accounts.
 *
 * Creates three One Piece-themed users with bcrypt-hashed passwords, plus
 * baseline friendships and a sample DM. Idempotent: safe to re-run — users
 * and friendships are upserted, and the DM is only inserted when it doesn't
 * already exist between the same sender/recipient with the same body.
 *
 * Credentials (local dev only — NEVER use in production):
 *   luffy@optcg.test / Gomugomu1!
 *   zoro@optcg.test  / Santoryu1!
 *   nami@optcg.test  / BelliRain1!
 *
 * Run with:
 *   npm run db:seed
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TEST_ACCOUNTS = [
  {
    email: "luffy@optcg.test",
    username: "Luffy_D",
    name: "Monkey D. Luffy",
    password: "Gomugomu1!",
  },
  {
    email: "zoro@optcg.test",
    username: "Roronoa_Z",
    name: "Roronoa Zoro",
    password: "Santoryu1!",
  },
  {
    email: "nami@optcg.test",
    username: "Nami_Chan",
    name: "Nami",
    password: "BelliRain1!",
  },
] as const;

async function upsertUser(account: (typeof TEST_ACCOUNTS)[number]) {
  const hash = await bcrypt.hash(account.password, 10);
  return prisma.user.upsert({
    where: { email: account.email },
    update: {
      // Re-hash so password resets if the seed file's password changes.
      password: hash,
      username: account.username,
      name: account.name,
    },
    create: {
      email: account.email,
      username: account.username,
      name: account.name,
      password: hash,
    },
  });
}

async function ensureFriendship(userXId: string, userYId: string) {
  // Friendship model uses @@unique([userAId, userBId]) with the convention
  // that IDs are sorted ascending (matches `.sort()` in src/app/api/friends/*).
  const [userAId, userBId] = [userXId, userYId].sort();
  await prisma.friendship.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    update: {},
    create: { userAId, userBId },
  });
}

async function ensureMessage(fromUserId: string, toUserId: string, body: string) {
  const existing = await prisma.message.findFirst({
    where: { fromUserId, toUserId, body },
  });
  if (!existing) {
    await prisma.message.create({ data: { fromUserId, toUserId, body } });
  }
}

async function main() {
  const [luffy, zoro, nami] = await Promise.all(TEST_ACCOUNTS.map(upsertUser));

  await ensureFriendship(luffy.id, zoro.id);
  await ensureFriendship(luffy.id, nami.id);

  await ensureMessage(luffy.id, zoro.id, "Oi Zoro! Want to duel?");

  console.log(
    `Seeded ${TEST_ACCOUNTS.length} users (luffy, zoro, nami) + 2 friendships + 1 DM.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
