import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GameBoardVisual } from "@/components/game/game-board-visual";

export const metadata = {
  title: "Game Board — OPTCG Simulator",
};

const GAME_WORKER_URL =
  process.env.NEXT_PUBLIC_GAME_WORKER_URL ??
  process.env.GAME_WORKER_URL ??
  "";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  return <GameBoardVisual gameId={id} workerUrl={GAME_WORKER_URL} />;
}
