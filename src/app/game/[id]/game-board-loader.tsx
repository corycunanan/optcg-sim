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
  viewerRole,
  bottomPlayerIndex,
}: {
  gameId: string;
  workerUrl: string;
  playerIndex?: 0 | 1;
  gameMode?: "PVP" | "SOLITAIRE" | "PVCOMPUTER";
  viewerRole: "player" | "spectator";
  bottomPlayerIndex?: 0 | 1;
}) {
  return (
    <LiveGameShell
      gameId={gameId}
      workerUrl={workerUrl}
      playerIndex={playerIndex}
      gameMode={gameMode}
      viewerRole={viewerRole}
      bottomPlayerIndex={bottomPlayerIndex}
    />
  );
}
