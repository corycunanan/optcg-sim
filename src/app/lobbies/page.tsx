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

export default async function LobbiesPage({ searchParams }: LobbiesPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const codeParam = (await searchParams)?.code;
  const code = Array.isArray(codeParam) ? codeParam[0] : codeParam;
  let joinError: string | null = null;
  let pendingJoinCode: string | null = null;

  if (code) {
    const joinResult = await joinLobbyByCode({
      userId: session.user.id,
      code,
    });
    if (joinResult.kind === "joined") {
      after(() => publishLobbyJoin(joinResult, session.user.id));
      redirect(`/lobbies/${joinResult.lobbyId}`);
    }
    if (joinResult.kind === "confirmation_required") {
      pendingJoinCode = joinResult.targetCode;
    } else {
      joinError = lobbyJoinFailureMessage(joinResult.kind);
    }
  }

  const resolution = await resolveCanonicalLobby(session.user.id);
  const query = [
    joinError ? `joinError=${encodeURIComponent(joinError)}` : null,
    pendingJoinCode ? `joinCode=${encodeURIComponent(pendingJoinCode)}` : null,
  ].filter(Boolean);
  const suffix = query.length > 0 ? `?${query.join("&")}` : "";
  redirect(`/lobbies/${resolution.lobbyId}${suffix}`);
}
