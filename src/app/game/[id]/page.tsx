import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { GameBoardLoader } from "./game-board-loader";

export const metadata = {
  title: "Game — OPTCG Simulator",
};

const GAME_WORKER_URL =
  process.env.NEXT_PUBLIC_GAME_WORKER_URL ?? process.env.GAME_WORKER_URL ?? "";

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ playerIndex?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const rawPlayerIndex = Array.isArray(resolvedSearchParams?.playerIndex)
    ? resolvedSearchParams?.playerIndex[0]
    : resolvedSearchParams?.playerIndex;
  const playerIndex =
    rawPlayerIndex === "0" || rawPlayerIndex === "1"
      ? rawPlayerIndex === "0"
        ? 0
        : 1
      : undefined;
  const game = await prisma.gameSession.findFirst({
    // Deliberately omit a status filter. An admitted spectator may keep viewing
    // the same board after FINISHED/ABANDONED; OPT-565 owns terminal-game UX.
    where: {
      id,
      OR: [
        { player1Id: session.user.id },
        { player2Id: session.user.id },
        {
          AND: [
            { player1Id: { not: session.user.id } },
            { player2Id: { not: session.user.id } },
            {
              lobby: {
                allowSpectators: true,
                spectators: { some: { userId: session.user.id } },
              },
            },
          ],
        },
      ],
    },
    select: {
      mode: true,
      player1Id: true,
      player2Id: true,
      lobby: { select: { hostUserId: true } },
    },
  });

  if (!game) {
    redirect("/lobbies");
  }

  const viewerRole =
    game.player1Id === session.user.id || game.player2Id === session.user.id
      ? "player"
      : "spectator";
  const bottomPlayerIndex =
    viewerRole === "spectator"
      ? game.lobby.hostUserId === game.player1Id
        ? 0
        : 1
      : undefined;

  return (
    <GameBoardLoader
      gameId={id}
      workerUrl={GAME_WORKER_URL}
      playerIndex={playerIndex}
      gameMode={game.mode}
      viewerRole={viewerRole}
      bottomPlayerIndex={bottomPlayerIndex}
    />
  );
}
