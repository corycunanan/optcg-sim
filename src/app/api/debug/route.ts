import { NextResponse } from "next/server";

export async function GET() {
  const checks = {
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    AUTH_GOOGLE_ID: !!process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: !!process.env.AUTH_GOOGLE_SECRET,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    DATABASE_URL: process.env.DATABASE_URL ? "set (length: " + process.env.DATABASE_URL.length + ")" : "NOT SET",
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL ? "set (length: " + process.env.DIRECT_DATABASE_URL.length + ")" : "NOT SET",
    DATABASE_URL_has_pgbouncer: process.env.DATABASE_URL?.includes("pgbouncer") ?? false,
    DATABASE_URL_has_pooler: process.env.DATABASE_URL?.includes("pooler") ?? false,
  };

  // Test DB connection
  let dbStatus = "untested";
  try {
    const { prisma } = await import("@/lib/db");
    const count = await prisma.card.count();
    dbStatus = `connected (${count} cards)`;
  } catch (e: unknown) {
    dbStatus = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test auth import
  let authStatus = "untested";
  try {
    await import("@/auth");
    authStatus = "ok";
  } catch (e: unknown) {
    authStatus = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({ checks, dbStatus, authStatus });
}
