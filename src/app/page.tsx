import Link from "next/link";
import { auth } from "@/auth";
import { CardRings } from "@/components/home/CardRings";

export default async function Home() {
  const session = await auth();

  return (
    <main className="relative flex flex-1 flex-col bg-background p-12">
      {/* Concentric card rings — top right */}
      <CardRings />

      {/* Left — header and subtitle, vertically centered */}
      <div className="relative z-10 my-auto translate-y-10">
        <h1 className="font-display text-6xl font-bold leading-none tracking-tight text-content-primary">
          OPTCG{" "}
          <span className="text-navy-900">Simulator</span>
        </h1>
        <p className="mt-3 text-lg text-content-tertiary">
          One Piece Trading Card Game — Deck Builder &amp; Simulator
        </p>
      </div>

      {/* Bottom right — single CTA */}
      <div className="relative z-10 mt-auto ml-auto">
        <Link
          href={session ? "/lobbies" : "/login"}
          className="btn-ornamental inline-block rounded-md bg-gold-500 px-12 py-5 text-xl font-semibold text-navy-900 transition-colors hover:bg-gold-400 [--btn-ornamental-color:var(--gold-500)] hover:[--btn-ornamental-color:var(--gold-400)]"
        >
          Play Now
        </Link>
      </div>
    </main>
  );
}
