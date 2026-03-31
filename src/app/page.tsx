import Link from "next/link";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="relative flex flex-1 flex-col bg-background p-12">
      {/* Top left — header and subtitle */}
      <div>
        <h1 className="font-display text-6xl font-bold leading-none tracking-tight text-content-primary">
          OPTCG{" "}
          <span className="text-navy-900">Simulator</span>
        </h1>
        <p className="mt-3 text-lg text-content-tertiary">
          One Piece Trading Card Game — Deck Builder &amp; Simulator
        </p>
      </div>

      {/* Bottom right — single CTA */}
      <div className="mt-auto ml-auto">
        <Link
          href={session ? "/lobbies" : "/login"}
          className="btn-ornamental inline-block rounded-md bg-navy-900 px-12 py-5 text-xl font-semibold text-content-inverse transition-colors hover:bg-navy-800"
        >
          Play Now
        </Link>
      </div>
    </main>
  );
}
