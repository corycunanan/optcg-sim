"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { GameButton } from "@/components/game/game-button";
import { meetsMinViewport } from "./meets-min-viewport";

export interface MinViewportGateProps {
  children: ReactNode;
}

export function MinViewportGate({ children }: MinViewportGateProps) {
  const [meets, setMeets] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () =>
      setMeets(meetsMinViewport(window.innerWidth, window.innerHeight));
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (meets === false) {
    return <MinViewportMessage />;
  }

  return <>{children}</>;
}

function MinViewportMessage() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gb-board px-4">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <h1 className="text-lg font-bold text-gb-text-bright">
          OPTCG Sim is designed for desktop.
        </h1>
        <p className="text-sm text-gb-text leading-relaxed">
          Please use a larger screen &mdash; at least 1280&times;720 &mdash; to
          play.
        </p>
        <p className="text-sm text-gb-text-subtle leading-relaxed">
          Tablet and mobile support are coming soon.
        </p>
        <GameButton asChild variant="primary" size="sm" className="mt-2">
          <Link href="/decks">Back to Decks</Link>
        </GameButton>
      </div>
    </div>
  );
}
