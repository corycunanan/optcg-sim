import Link from "next/link";
import { auth } from "@/auth";
import { CardColumns } from "@/components/home/CardColumns";

export default async function Home() {
  const session = await auth();

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-navy-900 p-12">
      {/* Subtle inverted map background */}
      <div
        className="pointer-events-none absolute -inset-16 bg-cover bg-center opacity-15"
        style={{
          backgroundImage: "url('/images/maps/map2.jpg')",
          filter: "invert(1)",
        }}
        aria-hidden="true"
      />

      {/* Scrolling card columns — top right */}
      <CardColumns />

      {/* Left — header and subtitle, vertically centered */}
      <div className="relative z-10 my-auto translate-y-10">
        <h1 className="font-display text-6xl font-bold leading-none tracking-tight bg-gradient-to-b from-gold-400 to-[oklch(60%_0.14_75)] bg-clip-text text-transparent">
          One Piece
          <br />
          TCG Simulator
        </h1>
        <p className="mt-6 text-lg text-background">
          Deck builder, simulator, and playground
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
