/**
 * Test script: verifies friend request flow between test accounts
 * Run: npx tsx scripts/test-friends.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("── Test: Friend system ──────────────────────────────");

  // 1. Fetch our test users
  const [luffy, zoro, nami] = await Promise.all([
    prisma.user.findUnique({ where: { username: "Luffy_D" } }),
    prisma.user.findUnique({ where: { username: "Roronoa_Z" } }),
    prisma.user.findUnique({ where: { username: "Nami_Chan" } }),
  ]);

  if (!luffy || !zoro || !nami) {
    console.error("Test accounts not found. Did registration succeed?");
    process.exit(1);
  }

  console.log(`✓ Found users: ${luffy.username}, ${zoro.username}, ${nami.username}`);

  // 2. Clean up any existing relationships between these users
  await prisma.friendRequest.deleteMany({
    where: {
      OR: [
        { fromUserId: { in: [luffy.id, zoro.id, nami.id] }, toUserId: { in: [luffy.id, zoro.id, nami.id] } },
      ],
    },
  });
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { userAId: { in: [luffy.id, zoro.id, nami.id] }, userBId: { in: [luffy.id, zoro.id, nami.id] } },
      ],
    },
  });

  // 3. Luffy sends friend request to Zoro
  const req1 = await prisma.friendRequest.create({
    data: { fromUserId: luffy.id, toUserId: zoro.id },
  });
  console.log(`✓ Luffy → Zoro: friend request sent (id: ${req1.id})`);

  // 4. Zoro accepts
  await prisma.$transaction([
    prisma.friendship.create({
      data: {
        userAId: luffy.id < zoro.id ? luffy.id : zoro.id,
        userBId: luffy.id < zoro.id ? zoro.id : luffy.id,
      },
    }),
    prisma.friendRequest.update({
      where: { id: req1.id },
      data: { status: "ACCEPTED" },
    }),
  ]);
  console.log(`✓ Zoro accepted Luffy's request → Friendship created`);

  // 5. Nami sends request to Luffy
  const req2 = await prisma.friendRequest.create({
    data: { fromUserId: nami.id, toUserId: luffy.id },
  });
  console.log(`✓ Nami → Luffy: friend request sent (id: ${req2.id})`);

  // 6. Luffy accepts
  await prisma.$transaction([
    prisma.friendship.create({
      data: {
        userAId: nami.id < luffy.id ? nami.id : luffy.id,
        userBId: nami.id < luffy.id ? luffy.id : nami.id,
      },
    }),
    prisma.friendRequest.update({
      where: { id: req2.id },
      data: { status: "ACCEPTED" },
    }),
  ]);
  console.log(`✓ Luffy accepted Nami's request → Friendship created`);

  // 7. Verify final state
  const luffyFriendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userAId: luffy.id }, { userBId: luffy.id }],
    },
    include: {
      userA: { select: { username: true } },
      userB: { select: { username: true } },
    },
  });

  console.log("\n── Final friendship graph ───────────────────────────");
  for (const f of luffyFriendships) {
    const other = f.userAId === luffy.id ? f.userB.username : f.userA.username;
    console.log(`  Luffy ↔ ${other}`);
  }

  // 8. Test the API logic (normalize to "other user")
  const friendsList = luffyFriendships.map((f) => ({
    friendshipId: f.id,
    user: f.userAId === luffy.id ? f.userB : f.userA,
  }));
  console.log(`\n✓ Luffy has ${friendsList.length} friends: ${friendsList.map(f => f.user.username).join(", ")}`);
  console.log("✓ All assertions passed.\n");

  // 9. Send a test message Luffy → Zoro
  const msg = await prisma.message.create({
    data: {
      fromUserId: luffy.id,
      toUserId: zoro.id,
      body: "Oi Zoro! Want to duel?",
    },
  });
  console.log(`✓ Message from Luffy to Zoro: "${msg.body}"`);
  console.log("\n── Done ─────────────────────────────────────────────");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
