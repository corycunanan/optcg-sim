"use client";

import dynamic from "next/dynamic";

const LiveGameShell = dynamic(
  () =>
    import("@/components/game/live-game-shell").then(
      (mod) => mod.LiveGameShell
    ),
  { ssr: false }
);

export function GameBoardLoader({
  gameId,
  workerUrl,
}: {
  gameId: string;
  workerUrl: string;
}) {
  return <LiveGameShell gameId={gameId} workerUrl={workerUrl} />;
}
