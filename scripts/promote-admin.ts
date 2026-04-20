/**
 * Grant admin (isAdmin=true) to a user by email. Idempotent.
 * Run: pnpm tsx scripts/promote-admin.ts user@example.com
 *   or: pnpm tsx scripts/promote-admin.ts user@example.com --revoke
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  const revoke = args.includes("--revoke");

  if (!email) {
    console.error("Usage: tsx scripts/promote-admin.ts <email> [--revoke]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isAdmin: !revoke },
    select: { email: true, isAdmin: true },
  });

  console.log(`${updated.email} → isAdmin=${updated.isAdmin}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
