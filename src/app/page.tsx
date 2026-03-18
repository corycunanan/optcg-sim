import Link from "next/link";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="text-center">
        <h1 className="mb-2 font-display text-6xl font-bold leading-none tracking-tight text-content-primary">
          OPTCG{" "}
          <span className="text-navy-900">Simulator</span>
        </h1>
        <p className="mb-10 text-lg text-content-tertiary">
          One Piece Trading Card Game — Deck Builder &amp; Simulator
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href={session ? "/decks" : "/login"}
            className="rounded bg-navy-900 px-6 py-3 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800 active:scale-[0.98]"
          >
            Deck Builder
          </Link>
          <Link
            href="/admin/cards"
            className="rounded border border-border px-6 py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-2 active:scale-[0.98]"
          >
            Card Database
          </Link>
          {!session && (
            <Link
              href="/login"
              className="rounded border border-border px-6 py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-2 active:scale-[0.98]"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
