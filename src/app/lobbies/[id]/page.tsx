import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LobbyRoomShell } from "@/components/lobbies/lobby-room-shell";

export const metadata = { title: "Lobby Room — OPTCG Simulator" };

interface LobbyRoomPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    joinError?: string | string[];
    joinCode?: string | string[];
  }>;
}

export default async function LobbyRoomPage({
  params,
  searchParams,
}: LobbyRoomPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const joinErrorParam = resolvedSearchParams?.joinError;
  const joinError = Array.isArray(joinErrorParam)
    ? joinErrorParam[0]
    : joinErrorParam;
  const joinCodeParam = resolvedSearchParams?.joinCode;
  const joinCode = Array.isArray(joinCodeParam)
    ? joinCodeParam[0]
    : joinCodeParam;
  return (
    <LobbyRoomShell
      lobbyId={id}
      currentUserId={session.user.id}
      joinError={joinError}
      initialJoinCode={joinCode}
    />
  );
}
