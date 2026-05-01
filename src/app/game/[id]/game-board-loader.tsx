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
  playerIndex,
  gameMode,
}: {
  gameId: string;
  workerUrl: string;
  playerIndex?: 0 | 1;
  gameMode?: "PVP" | "SOLITAIRE" | "PVCOMPUTER";
}) {
  return (
    <LiveGameShell
      gameId={gameId}
      workerUrl={workerUrl}
      playerIndex={playerIndex}
      gameMode={gameMode}
    />
  );
}
