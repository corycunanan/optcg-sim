import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DeckDeleteButton } from "@/components/deck-builder/deck-delete-button";

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
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight text-content-primary">
          My Decks
        </h1>
        <Link
          href="/decks/new"
          className="rounded bg-navy-900 px-4 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800"
        >
          + New Deck
        </Link>
      </div>

      {decks.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg font-semibold text-content-secondary">No decks yet</p>
          <p className="mt-1 text-sm text-content-tertiary">
            Create your first deck to get started
          </p>
          <Link
            href="/decks/new"
            className="mt-6 inline-block rounded bg-navy-900 px-6 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800"
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
              <Link
                key={deck.id}
                href={`/decks/${deck.id}`}
                className="group relative overflow-hidden rounded border border-border bg-surface-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
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
                  <h3 className="text-base font-bold text-content-primary">{deck.name}</h3>
                  <p className="mt-1 text-xs text-content-tertiary">
                    {leader?.name || "No leader"} · {totalCards}/50 cards
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                    {Array.from(colors).map((c) => (
                      <span
                        key={c}
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ background: `var(--card-${c.toLowerCase()})` }}
                        title={c}
                      />
                    ))}
                    <div className="ml-auto flex items-center gap-2">
                      <DeckDeleteButton deckId={deck.id} deckName={deck.name} />
                      <span className="text-xs text-content-tertiary">
                        {deck.updatedAt.toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
