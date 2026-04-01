import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LobbiesShell } from "@/components/lobbies/lobbies-shell";

export const metadata = { title: "Play — OPTCG Simulator" };

export default async function LobbiesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return (
    <LobbiesShell
      user={{
        name: session.user.name ?? session.user.email ?? "Player",
        image: session.user.image ?? null,
      }}
    />
  );
}
