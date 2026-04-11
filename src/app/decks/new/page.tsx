import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DeckBuilderShell } from "@/components/deck-builder/deck-builder-shell";

export const metadata = {
  title: "Deck Builder — OPTCG Simulator",
  description: "Build and validate OPTCG-legal decks",
};

export default async function DeckBuilderNewPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return <DeckBuilderShell deckId={null} />;
}
