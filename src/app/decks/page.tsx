import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { collectDeckColors } from "@/lib/decks/colors";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
} from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import type { DeckListItem } from "./deck-list";
import { DeckListFilter } from "./deck-list-filter";

export const metadata = {
  title: "My Decks — OPTCG Simulator",
};

/**
 * Compact "last touched" stamp. Built once at module scope and applied on the
 * server so the rendered string can't drift between server and client.
 */
const UPDATED_AT_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function DecksPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // The leader comes through the `Deck.leader` relation rather than a second
  // `card.findMany`, which also gets the stats and rules text the row's leader
  // tooltip needs in the same round trip.
  const decks = await prisma.deck.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    relationLoadStrategy: "join",
    include: {
      cards: {
        select: { quantity: true, card: { select: { color: true } } },
      },
      leader: {
        select: {
          id: true,
          name: true,
          type: true,
          color: true,
          cost: true,
          power: true,
          counter: true,
          life: true,
          traits: true,
          attribute: true,
          effectText: true,
          triggerText: true,
          imageUrl: true,
        },
      },
    },
  });

  const items: DeckListItem[] = decks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    totalCards: deck.cards.reduce((sum, dc) => sum + dc.quantity, 0),
    colors: collectDeckColors(
      deck.leader.color,
      deck.cards.map((dc) => dc.card.color)
    ),
    updatedAtIso: deck.updatedAt.toISOString(),
    updatedAtLabel: UPDATED_AT_FORMAT.format(deck.updatedAt),
    leader: {
      id: deck.leader.id,
      name: deck.leader.name,
      type: deck.leader.type,
      // The owner's chosen art variant wins, matching GET /api/decks.
      imageUrl: deck.leaderArtUrl ?? deck.leader.imageUrl,
      colors: deck.leader.color,
      cost: deck.leader.cost,
      power: deck.leader.power,
      counter: deck.leader.counter,
      life: deck.leader.life,
      traits: deck.leader.traits,
      attribute: deck.leader.attribute,
      effectText: deck.leader.effectText,
      triggerText: deck.leader.triggerText,
    },
  }));

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

      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        {items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-content-tertiary text-sm">
              No decks yet
            </p>
            <p className="text-content-tertiary mt-1 text-sm">
              Create your first deck to get started
            </p>
            <Link
              href="/decks/new"
              className="bg-primary text-primary-foreground hover:bg-gold-400 mt-6 inline-block rounded px-6 py-2 text-sm font-semibold transition-colors"
            >
              + New Deck
            </Link>
          </div>
        ) : (
          <DeckListFilter decks={items} />
        )}
      </div>
    </div>
  );
}
