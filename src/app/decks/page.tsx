import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DeckDeleteButton } from "@/components/deck-builder/deck-delete-button";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
} from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DeckColorIndicators } from "./deck-color-indicators";

export const metadata = {
  title: "My Decks — OPTCG Simulator",
};

export default async function DecksPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const decks = await prisma.deck.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      cards: {
        include: {
          card: {
            select: {
              id: true,
              name: true,
              color: true,
              type: true,
              imageUrl: true,
            },
          },
        },
      },
    },
  });

  // Also fetch leaders for each deck
  const leaderIds = [...new Set(decks.map((d) => d.leaderId))];
  const leaders = await prisma.card.findMany({
    where: { id: { in: leaderIds } },
    select: { id: true, name: true, color: true, imageUrl: true, power: true },
  });
  const leaderMap = new Map(leaders.map((l) => [l.id, l]));

  return (
    <div className="bg-background flex-1 overflow-y-auto">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>My Decks</PageHeaderTitle>
          <PageHeaderDescription>
            Build and manage your OPTCG decks.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="secondary" asChild>
            <Link href="/decks/new">+ New Deck</Link>
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="mx-auto w-full max-w-5xl px-6 py-8">
      {decks.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg font-semibold text-content-secondary">No decks yet</p>
          <p className="mt-1 text-sm text-content-tertiary">
            Create your first deck to get started
          </p>
          <Link
            href="/decks/new"
            className="mt-6 inline-block rounded bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-gold-400"
          >
            + New Deck
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => {
            const leader = leaderMap.get(deck.leaderId);
            const totalCards = deck.cards.reduce((sum, dc) => sum + dc.quantity, 0);
            const colors = new Set<string>();
            deck.cards.forEach((dc) => dc.card.color.forEach((c) => colors.add(c)));
            if (leader) leader.color.forEach((c) => colors.add(c));

            return (
              <article key={deck.id} className="group relative">
                <Link
                  href={`/decks/${deck.id}`}
                  className="block overflow-hidden rounded border border-border bg-surface-1 transition-all duration-200 hover:-translate-y-1 hover:border-border-strong hover:shadow-md"
                >
                  {leader && (
                    <div className="relative h-36 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={leader.imageUrl}
                        alt=""
                        className="h-full w-full object-cover object-top opacity-60 transition-transform duration-300 group-hover:scale-[1.05]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-surface-1 to-transparent" />
                    </div>
                  )}

                  <div className="relative p-4">
                    <h3 className="pr-16 text-base font-bold text-content-primary">
                      {deck.name}
                    </h3>
                    <p className="mt-1 text-xs text-content-tertiary">
                      {leader?.name || "No leader"} · {totalCards}/50 cards
                    </p>

                    <div className="mt-2 flex items-end gap-2">
                      <DeckColorIndicators colors={Array.from(colors)} />
                      <span className="ml-auto shrink-0 text-xs text-content-tertiary">
                        {deck.updatedAt.toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Link>
                <DeckDeleteButton deckId={deck.id} deckName={deck.name} />
              </article>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
