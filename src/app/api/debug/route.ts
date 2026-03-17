import { NextResponse } from "next/server";

export async function GET() {
  const checks = {
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    AUTH_SECRET_length: process.env.AUTH_SECRET?.length,
    AUTH_GOOGLE_ID: !!process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_ID_value: process.env.AUTH_GOOGLE_ID?.substring(0, 20) + "...",
    AUTH_GOOGLE_SECRET: !!process.env.AUTH_GOOGLE_SECRET,
    AUTH_GOOGLE_SECRET_length: process.env.AUTH_GOOGLE_SECRET?.length,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    DATABASE_URL: process.env.DATABASE_URL ? "set (length: " + process.env.DATABASE_URL.length + ")" : "NOT SET",
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL ? "set (length: " + process.env.DIRECT_DATABASE_URL.length + ")" : "NOT SET",
    NODE_ENV: process.env.NODE_ENV,
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

  // Test auth config by trying to get session
  let authStatus = "untested";
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    authStatus = session ? `ok (user: ${session.user?.email})` : "ok (no session)";
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    authStatus = `error: ${err.message}\nstack: ${err.stack?.split("\n").slice(0, 3).join(" | ")}`;
  }

  return NextResponse.json({ checks, dbStatus, authStatus }, { status: 200 });
}
