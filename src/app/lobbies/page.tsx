import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveCanonicalLobby } from "@/lib/lobbies/resolve";

export const metadata = { title: "Play — OPTCG Simulator" };

export default async function LobbiesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const resolution = await resolveCanonicalLobby(session.user.id);
  redirect(`/lobbies/${resolution.lobbyId}`);
}
