import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LobbyRoomShell } from "@/components/lobbies/lobby-room-shell";

export const metadata = { title: "Lobby Room — OPTCG Simulator" };

interface LobbyRoomPageProps {
  params: Promise<{ id: string }>;
}

export default async function LobbyRoomPage({ params }: LobbyRoomPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  return <LobbyRoomShell lobbyId={id} currentUserId={session.user.id} />;
}
