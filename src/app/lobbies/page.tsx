import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import {
  joinLobbyByCode,
  lobbyJoinFailureMessage,
  publishLobbyJoin,
} from "@/lib/lobbies/join";
import { resolveCanonicalLobby } from "@/lib/lobbies/resolve";

export const metadata = { title: "Play — OPTCG Simulator" };

interface LobbiesPageProps {
  searchParams?: Promise<{ code?: string | string[] }>;
}

export default async function LobbiesPage({
  searchParams,
}: LobbiesPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const codeParam = (await searchParams)?.code;
  const code = Array.isArray(codeParam) ? codeParam[0] : codeParam;
  let joinError: string | null = null;

  if (code) {
    const joinResult = await joinLobbyByCode({
      userId: session.user.id,
      code,
    });
    if (joinResult.kind === "joined") {
      after(() => publishLobbyJoin(joinResult, session.user.id));
      redirect(`/lobbies/${joinResult.lobbyId}`);
    }
    joinError = lobbyJoinFailureMessage(joinResult.kind);
  }

  const resolution = await resolveCanonicalLobby(session.user.id);
  const errorQuery = joinError
    ? `?joinError=${encodeURIComponent(joinError)}`
    : "";
  redirect(`/lobbies/${resolution.lobbyId}${errorQuery}`);
}
