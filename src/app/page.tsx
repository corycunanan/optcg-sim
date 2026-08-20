import Link from "next/link";
import { auth } from "@/auth";
import { CardColumns } from "@/components/home/CardColumns";
import { Button } from "@/components/ui/button";

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
        <h1 className="font-display bg-gradient-to-b from-gold-400 to-gold-600 bg-clip-text text-6xl leading-none text-transparent">
          One Piece
          <br />
          TCG Simulator
        </h1>
        <p className="mt-6 text-lg text-content-secondary">
          Deck builder, simulator, and playground
        </p>
      </div>

      {/* Bottom right — single CTA */}
      <div className="relative z-10 mt-auto ml-auto">
        {/* `elevation="flat"`: `btn-ornamental` is already this CTA's elevation
            statement — a gold hairline at `outline-offset: 3px`. The solid-variant
            cast would sit in that 3px gap at rest and cross the ring at
            `shadow-md`, mixing two registers on one hover. */}
        <Button
          variant="gold"
          size="lg"
          elevation="flat"
          asChild
          className="btn-ornamental px-12 [--btn-ornamental-color:var(--accent)] hover:[--btn-ornamental-color:var(--accent-hover)]"
        >
          <Link href={session ? "/lobbies" : "/login"}>Play Now</Link>
        </Button>
      </div>
    </main>
  );
}
