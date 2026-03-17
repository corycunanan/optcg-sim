import Link from "next/link";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-8"
      style={{ background: "var(--surface-0)" }}
    >
      <div className="text-center">
        <h1
          className="mb-2 text-5xl font-bold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          OPTCG{" "}
          <span style={{ color: "var(--accent)" }}>Simulator</span>
        </h1>
        <p
          className="mb-10 text-lg"
          style={{ color: "var(--text-tertiary)" }}
        >
          One Piece Trading Card Game — Deck Builder & Simulator
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/admin/cards"
            className="rounded-lg px-7 py-3 text-sm font-semibold transition-colors"
            style={{
              background: "var(--accent)",
              color: "var(--surface-0)",
            }}
          >
            Card Database
          </Link>
          {session ? (
            <Link
              href="/admin"
              className="rounded-lg px-7 py-3 text-sm font-medium transition-colors"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-lg px-7 py-3 text-sm font-medium transition-colors"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
