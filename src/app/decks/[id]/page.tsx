import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

const DeckBuilderShell = dynamic(
  () =>
    import("@/components/deck-builder/deck-builder-shell").then(
      (mod) => mod.DeckBuilderShell
    ),
  { ssr: false }
);

export const metadata = {
  title: "Edit Deck — OPTCG Simulator",
};

export default async function DeckBuilderEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  return <DeckBuilderShell deckId={id} />;
}
