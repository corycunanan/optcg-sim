"use client";

import dynamic from "next/dynamic";

const GameBoardVisual = dynamic(
  () =>
    import("@/components/game/game-board-visual").then(
      (mod) => mod.GameBoardVisual
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
  return <GameBoardVisual gameId={gameId} workerUrl={workerUrl} />;
}
