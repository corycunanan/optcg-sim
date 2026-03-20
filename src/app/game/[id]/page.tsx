import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GameBoard } from "@/components/game/game-board";

export const metadata = {
  title: "Game — OPTCG Simulator",
};

const GAME_WORKER_URL = process.env.NEXT_PUBLIC_GAME_WORKER_URL ?? process.env.GAME_WORKER_URL ?? "";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  return <GameBoard gameId={id} workerUrl={GAME_WORKER_URL} />;
}
