import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LobbyRoomShell } from "@/components/lobbies/lobby-room-shell";

export const metadata = { title: "Lobby Room — OPTCG Simulator" };

interface LobbyRoomPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ joinError?: string | string[] }>;
}

export default async function LobbyRoomPage({
  params,
  searchParams,
}: LobbyRoomPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const joinErrorParam = (await searchParams)?.joinError;
  const joinError = Array.isArray(joinErrorParam)
    ? joinErrorParam[0]
    : joinErrorParam;
  return (
    <LobbyRoomShell
      lobbyId={id}
      currentUserId={session.user.id}
      joinError={joinError}
    />
  );
}
